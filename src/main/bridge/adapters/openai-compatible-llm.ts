import type {
  BridgeHealth,
  CapabilityProbeResult,
  CuratedPlaylist,
  DailyStationBrief,
  MusicTasteProfile,
  Track,
  TrackInsight
} from '../../../shared/contracts/bridge';

interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

interface ChatCompletionsResponse {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

interface DiscoveryPlan {
  queries: string[];
}

const sanitizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

const readConfig = (): LlmConfig | null => {
  const apiKey = process.env.COSIC_LLM_API_KEY?.trim();
  const baseUrl = process.env.COSIC_LLM_BASE_URL?.trim();
  const model = process.env.COSIC_LLM_MODEL?.trim() || 'gpt-5.4';
  const timeoutMs = Number(process.env.COSIC_LLM_TIMEOUT_MS || '30000');

  if (!apiKey || !baseUrl) {
    return null;
  }

  return {
    apiKey,
    baseUrl: sanitizeBaseUrl(baseUrl),
    model,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 30000
  };
};

const extractText = (payload: ChatCompletionsResponse) => {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => part.text ?? '')
      .join('')
      .trim();
  }

  return '';
};

const extractJsonObject = <T>(text: string): T => {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    candidates.unshift(fencedMatch[1].trim());
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    candidates.push(objectMatch[0]);
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      continue;
    }
  }

  throw new Error('LLM did not return valid JSON.');
};

const requestJson = async <T>(config: LlmConfig, endpoint: string, init: RequestInit) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.baseUrl}${endpoint}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {})
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
};

export class OpenAiCompatibleLlmAdapter {
  private readonly config = readConfig();

  isConfigured() {
    return Boolean(this.config);
  }

  getProviderLabel() {
    if (!this.config) {
      return 'OpenAI-compatible';
    }

    return new URL(this.config.baseUrl).host;
  }

  getModelName() {
    return this.config?.model ?? 'gpt-5.4';
  }

  getStatus(): BridgeHealth {
    return this.config ? 'online' : 'mock';
  }

  async probe(): Promise<CapabilityProbeResult> {
    if (!this.config) {
      return {
        capabilityId: 'brain',
        status: 'mock',
        latencyMs: 0,
        checkedAt: new Date().toISOString(),
        message: 'LLM env is missing. Add COSIC_LLM_BASE_URL and COSIC_LLM_API_KEY.'
      };
    }

    const startedAt = Date.now();
    try {
      await requestJson<{ data?: unknown[] }>(this.config, '/models', { method: 'GET' });

      return {
        capabilityId: 'brain',
        status: 'online',
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        message: `LLM bridge is live on ${this.getProviderLabel()}.`
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Probe failed.';

      return {
        capabilityId: 'brain',
        status: 'offline',
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        message
      };
    }
  }

  async generateTrackInsight(track: Track): Promise<TrackInsight> {
    if (!this.config) {
      throw new Error('LLM env is missing. Add COSIC_LLM_BASE_URL and COSIC_LLM_API_KEY.');
    }

    const payload = await requestJson<ChatCompletionsResponse>(this.config, '/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0.8,
        messages: [
          {
            role: 'system',
            content:
              'You write compact Chinese liner notes for a desktop music player. Return one polished sentence, 55 to 95 Chinese characters. Mention concrete track metadata when useful. No analysis steps, no markdown, no quotes.'
          },
          {
            role: 'user',
            content: JSON.stringify({
              title: track.title,
              artist: track.artist,
              album: track.album,
              mood: track.mood,
              tags: track.tags
            })
          }
        ]
      })
    });

    const text = extractText(payload);
    if (!text) {
      throw new Error('LLM returned an empty message.');
    }

    return {
      trackId: track.id,
      text,
      source: 'live',
      model: payload.model ?? this.config.model,
      generatedAt: new Date().toISOString()
    };
  }

  async analyzeMusicTaste(
    profile: MusicTasteProfile
  ): Promise<Pick<MusicTasteProfile, 'archetype' | 'summary' | 'signals'> & { model: string }> {
    if (!this.config) {
      throw new Error('LLM env is missing. Add COSIC_LLM_BASE_URL and COSIC_LLM_API_KEY.');
    }

    const payload = await requestJson<ChatCompletionsResponse>(this.config, '/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0.6,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a sharp music taste analyst. Return JSON with archetype, summary, and signals. summary should be under 90 Chinese characters. signals should be an array of 3 short bullets.'
          },
          {
            role: 'user',
            content: JSON.stringify({
              stats: profile.stats,
              topArtists: profile.topArtists,
              topAlbums: profile.topAlbums,
              topYears: profile.topYears,
              topPlaylists: profile.topPlaylists.map((item) => ({
                name: item.name,
                trackCount: item.trackCount
              }))
            })
          }
        ]
      })
    });

    const text = extractText(payload);
    const parsed = extractJsonObject<{
      archetype?: string;
      summary?: string;
      signals?: string[];
    }>(text);

    return {
      archetype: parsed.archetype?.trim() || '策展型听众',
      summary:
        parsed.summary?.trim() ||
        '你的歌单跨度很大，而且不是随手收藏，而是按场景和情绪认真分层。',
      signals: (parsed.signals ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 3),
      model: payload.model ?? this.config.model
    };
  }

  async generateCuratedPlaylist(
    input: string,
    tracks: Track[],
    options?: {
      tasteProfile?: MusicTasteProfile | null;
      discoveryQueries?: string[];
      dailyBrief?: DailyStationBrief | null;
      requestKind?: 'manual' | 'daily';
    }
  ): Promise<CuratedPlaylist> {
    if (!this.config) {
      throw new Error('LLM env is missing. Add COSIC_LLM_BASE_URL and COSIC_LLM_API_KEY.');
    }

    const requestKind = options?.requestKind ?? 'manual';
    const payload = await requestJson<ChatCompletionsResponse>(this.config, '/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              'You are the daily radio editor for Cosic, a personal desktop player.',
              'Choose only from the provided tracks.',
              'This is not generic recommendation. You must surface the most precise slice of this users taste for this exact moment.',
              'Use two layers of judgment at the same time.',
              'Layer 1: long-term taste profile. This tells you what feels native to the user over time.',
              'Layer 2: daily station brief. This tells you which slice of that taste should be surfaced today based on local time, weekday, region, weather, temperature, and inferred mood.',
              'For daily requests, the result must feel tied to this hour and this city, not like a reusable mood playlist.',
              'Treat long-term taste as the base grammar and the daily station brief as the selector for which pocket of taste should be surfaced right now.',
              'Sequence with intent: opening track, settling track, mid-run, release or hold. The queue should feel edited, not randomly sampled.',
              'Return 8 to 12 trackIds when possible.',
              'Avoid duplicates, alternate versions, repetitive artist clustering, abrupt style whiplash, and obvious cliches.',
              'Prefer at most one track from the same primary artist unless the user explicitly asks for concentration.',
              'Blend familiar library tracks with outside discovery only when it improves fit.',
              'If weather data is missing, ignore it rather than inventing it.',
              'Return JSON with title, intent, note, reply, and trackIds.',
              'title should feel like an edited station title, not a sentence.',
              'intent should describe the emotional or functional lane in under 16 Chinese characters.',
              'note should be a compact environment label under 24 Chinese characters.',
              'reply should be one calm finished-state UI line in Chinese under 36 Chinese characters.',
              'No visible reasoning, no factor checklist, no “because I considered” phrasing.'
            ].join(' ')
          },
          {
            role: 'user',
            content: JSON.stringify({
              input,
              requestKind,
              discoveryQueries: options?.discoveryQueries ?? [],
              dailyBrief: options?.dailyBrief
                ? {
                    weekdayLabel: options.dailyBrief.weekdayLabel,
                    localTimeLabel: options.dailyBrief.localTimeLabel,
                    partOfDayLabel: options.dailyBrief.partOfDayLabel,
                    regionLabel: options.dailyBrief.regionLabel,
                    weather: options.dailyBrief.weather
                      ? {
                          summary: options.dailyBrief.weather.summary,
                          temperatureC: options.dailyBrief.weather.temperatureC,
                          feelsLikeC: options.dailyBrief.weather.feelsLikeC
                        }
                      : null,
                    moodGuess: options.dailyBrief.moodGuess,
                    moodReason: options.dailyBrief.moodReason,
                    tasteAnchor: options.dailyBrief.tasteAnchor,
                    archetype: options.dailyBrief.archetype
                  }
                : null,
              tasteProfile: options?.tasteProfile
                ? {
                    archetype: options.tasteProfile.archetype,
                    summary: options.tasteProfile.summary,
                    signals: options.tasteProfile.signals,
                    topArtists: options.tasteProfile.topArtists.slice(0, 5),
                    topAlbums: options.tasteProfile.topAlbums.slice(0, 5),
                    topYears: options.tasteProfile.topYears.slice(0, 4)
                  }
                : null,
              tracks: tracks.map((track) => ({
                id: track.id,
                title: track.title,
                artist: track.artist,
                album: track.album,
                mood: track.mood,
                tags: track.tags
              }))
            })
          }
        ]
      })
    });

    const text = extractText(payload);
    const parsed = extractJsonObject<{
      title?: string;
      intent?: string;
      note?: string;
      reply?: string;
      trackIds?: string[];
    }>(text);

    const selectedTracks = (parsed.trackIds ?? [])
      .map((trackId) => tracks.find((track) => track.id === trackId))
      .filter((track): track is Track => Boolean(track));

    if (selectedTracks.length === 0) {
      throw new Error('LLM returned no valid track ids.');
    }

    return {
      id: `live-curation-${Date.now()}`,
      prompt: input,
      title: parsed.title?.trim() || (requestKind === 'daily' ? '今日队列' : '此刻歌单'),
      intent:
        parsed.intent?.trim() ||
        (requestKind === 'daily' ? '按今日环境策展' : '基于你的长期偏好策展'),
      note:
        parsed.note?.trim() ||
        (options?.dailyBrief
          ? [options.dailyBrief.regionLabel, options.dailyBrief.weather?.summary, options.dailyBrief.moodGuess]
              .filter(Boolean)
              .join(' · ')
          : '已按你当前状态和长期偏好完成编排。'),
      reply:
        parsed.reply?.trim() ||
        (requestKind === 'daily'
          ? '我先按今天的环境、时间和你的长期听歌习惯，开了一组更贴近此刻的随机队列。'
          : '我先按你此刻的需求和长期偏好，排了一组更贴脸的队列。'),
      source: 'live',
      model: payload.model ?? this.config.model,
      generatedAt: new Date().toISOString(),
      requestKind,
      dailyBrief: options?.dailyBrief ?? null,
      tracks: selectedTracks
    };
  }

  async generateDiscoveryPlan(
    input: string,
    options?: { tasteProfile?: MusicTasteProfile | null }
  ): Promise<DiscoveryPlan> {
    if (!this.config) {
      throw new Error('LLM env is missing. Add COSIC_LLM_BASE_URL and COSIC_LLM_API_KEY.');
    }

    const payload = await requestJson<ChatCompletionsResponse>(this.config, '/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0.5,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You create short NetEase search queries for music discovery. Return JSON with queries only. Provide 2 to 4 concise queries. Each query should be natural for NetEase music search, mixing artist, era, mood, scene, or genre. Use Chinese when appropriate. Avoid punctuation-heavy long sentences.'
          },
          {
            role: 'user',
            content: JSON.stringify({
              input,
              tasteProfile: options?.tasteProfile
                ? {
                    archetype: options.tasteProfile.archetype,
                    summary: options.tasteProfile.summary,
                    signals: options.tasteProfile.signals,
                    topArtists: options.tasteProfile.topArtists.slice(0, 5),
                    topAlbums: options.tasteProfile.topAlbums.slice(0, 4),
                    topYears: options.tasteProfile.topYears.slice(0, 4)
                  }
                : null
            })
          }
        ]
      })
    });

    const text = extractText(payload);
    const parsed = extractJsonObject<{ queries?: string[] }>(text);

    return {
      queries: (parsed.queries ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 4)
    };
  }
}
