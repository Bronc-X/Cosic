import type {
  AgentTurnKind,
  BridgeHealth,
  CapabilityProbeResult,
  CuratedPlaylist,
  CurationChatMessage,
  DailyStationBrief,
  MusicTasteProfile,
  Track,
  TrackInsight
} from '../../../shared/contracts/bridge';

const { ProxyAgent } = require('undici') as typeof import('undici');

interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  curationTimeoutMs: number;
  proxyUrl: string;
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

interface CuratedPlaylistPlan {
  title?: string;
  intent?: string;
  note?: string;
  reply?: string;
  trackIds?: unknown[];
}

type SpecificArtistCurationRequest = {
  artist: string;
  requestedCount: number;
  strictArtistOnly: true;
};

interface TrackInsightPlan {
  notes?: Array<{
    trackId?: string;
    text?: string;
  }>;
}

interface AgentTurnPlan {
  kind?: string;
  reply?: string;
}

interface LlmHttpError extends Error {
  status?: number;
  retryAfterMs?: number;
}

const REQUEST_RETRY_DELAYS_MS = [350, 900];
const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const CURATION_FALLBACK_TRACK_COUNT = 15;
const DEFAULT_LLM_CURATION_TIMEOUT_MS = 20000;

const sanitizeBaseUrl = (value: string) => {
  const trimmed = value.replace(/\/+$/, '');

  try {
    return new URL(trimmed).toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
};

const sanitizeProxyUrl = (value: string | undefined) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return '';
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    return '';
  }
};

const normalizeApiKey = (value: string | undefined) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.toLowerCase() === 'ollama' ? '' : trimmed;
};

const readConfig = (): LlmConfig | null => {
  const apiKey =
    normalizeApiKey(process.env.COSIC_LLM_API_KEY) ||
    normalizeApiKey(process.env.OPENAI_API_KEY);
  const baseUrl =
    process.env.COSIC_LLM_BASE_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    (apiKey ? 'https://api.openai.com/v1' : '');
  const model = process.env.COSIC_LLM_MODEL?.trim() || 'gpt-5.5';
  const timeoutMs = Number(process.env.COSIC_LLM_TIMEOUT_MS || '30000');
  const curationTimeoutMs = Number(
    process.env.COSIC_LLM_CURATION_TIMEOUT_MS || String(DEFAULT_LLM_CURATION_TIMEOUT_MS)
  );
  const proxyUrl = sanitizeProxyUrl(
    process.env.COSIC_LLM_PROXY_URL ||
      process.env.COSIC_PROXY_URL ||
      process.env.HTTPS_PROXY ||
      process.env.HTTP_PROXY
  );

  if (!apiKey || !baseUrl) {
    return null;
  }

  const sanitizedBaseUrl = sanitizeBaseUrl(baseUrl);
  if (!sanitizedBaseUrl) {
    return null;
  }

  return {
    apiKey,
    baseUrl: sanitizedBaseUrl,
    model,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 30000,
    curationTimeoutMs: Number.isFinite(curationTimeoutMs)
      ? curationTimeoutMs
      : DEFAULT_LLM_CURATION_TIMEOUT_MS,
    proxyUrl
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

const repairJsonCandidate = (value: string) =>
  value
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/,\s*([}\]])/g, '$1');

const collectBalancedJsonObjects = (value: string) => {
  const objects: string[] = [];

  for (let startIndex = 0; startIndex < value.length; startIndex += 1) {
    if (value[startIndex] !== '{') {
      continue;
    }

    let depth = 0;
    let isInString = false;
    let isEscaped = false;

    for (let index = startIndex; index < value.length; index += 1) {
      const char = value[index];

      if (isInString) {
        if (isEscaped) {
          isEscaped = false;
        } else if (char === '\\') {
          isEscaped = true;
        } else if (char === '"') {
          isInString = false;
        }

        continue;
      }

      if (char === '"') {
        isInString = true;
        continue;
      }

      if (char === '{') {
        depth += 1;
        continue;
      }

      if (char === '}' && depth > 0) {
        depth -= 1;
        if (depth === 0) {
          objects.push(value.slice(startIndex, index + 1));
          break;
        }
      }
    }
  }

  return objects;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const isLlmTrackIdValue = (value: unknown) =>
  isNonEmptyString(value) || (typeof value === 'number' && Number.isFinite(value)) || isRecord(value);

const readStringField = (value: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const field = value[key];
    if (isNonEmptyString(field)) {
      return field.trim();
    }
  }

  return '';
};

const readTrackReferencesField = (value: Record<string, unknown>) => {
  const candidates = [
    value.trackIds,
    value.track_ids,
    value.trackIdsList,
    value.selectedTrackIds,
    value.selected_track_ids,
    value.tracks,
    value.playlist,
    value.songs,
    value.items
  ];

  const references = candidates.find((candidate): candidate is unknown[] => Array.isArray(candidate));

  return references?.filter(isLlmTrackIdValue) ?? [];
};

const normalizeCuratedPlaylistPlan = (value: unknown): CuratedPlaylistPlan | null => {
  if (!isRecord(value)) {
    return null;
  }

  const trackIds = readTrackReferencesField(value);
  if (trackIds.length === 0) {
    return null;
  }

  return {
    title: readStringField(value, ['title', 'name', 'playlistTitle', 'playlist_title']),
    intent: readStringField(value, ['intent', 'reason', 'rationale', 'theme']),
    note: readStringField(value, ['note', 'description', 'summary']),
    reply: readStringField(value, ['reply', 'message', 'assistantReply', 'assistant_reply']),
    trackIds
  };
};

const isCuratedPlaylistPlan = (value: unknown) => Boolean(normalizeCuratedPlaylistPlan(value));

export const parseLlmJsonObject = <T>(
  text: string,
  options?: { isValid?: (value: unknown) => boolean }
): T => {
  const trimmed = text.trim();
  const candidates: string[] = [trimmed];
  const fencedMatches = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];

  for (const match of fencedMatches) {
    if (match[1]) {
      candidates.unshift(match[1].trim());
    }
  }

  candidates.push(...collectBalancedJsonObjects(trimmed));

  for (const candidate of candidates) {
    const repaired = repairJsonCandidate(candidate);
    if (!repaired) {
      continue;
    }

    try {
      const parsed = JSON.parse(repaired) as unknown;
      if (options?.isValid && !options.isValid(parsed)) {
        continue;
      }

      return parsed as T;
    } catch {
      continue;
    }
  }

  throw new Error('LLM did not return valid JSON.');
};

const normalizeSingleParagraph = (value: string) =>
  value
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-*•\d.、]+/, '')
    .trim();

const normalizeAgentTurnKind = (value: string | undefined): AgentTurnKind =>
  value === 'playlist' || value === 'refinement' ? value : 'conversation';

const CRUDE_TRACK_NOTE_PATTERN =
  /带着[^。；\n]*底色|适合先把注意力|接管房间|适合[^。；\n]{0,18}(?:放松|放空|专注)|不是[^。；\n]{0,28}而是|不再是|不是资料栏|进入世界的坐标|放得很稳|摊在桌面|终于能|我经历过|所以我仍然|真正动人的地方|哲学问题|无法解释的心事|可停靠的形状/;

const isEditorialTrackNote = (value: string) => value.length >= 90 && !CRUDE_TRACK_NOTE_PATTERN.test(value);

const normalizeArtistText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[\(\[（【].*?[\)\]）】]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const artistMatchesRequest = (track: Pick<Track, 'artist'>, artist: string) => {
  const requested = normalizeArtistText(artist);
  const fullArtist = normalizeArtistText(track.artist);

  return Boolean(requested && fullArtist && (fullArtist.includes(requested) || requested.includes(fullArtist)));
};

const inferSonicFingerprint = (track: Track) => {
  const year = track.year.trim();
  const era = year ? `${year.slice(0, 3)}0s` : 'unknown-era';
  const durationLabel =
    track.duration >= 360 ? 'long-form' : track.duration >= 240 ? 'patient-build' : 'compact';

  return {
    mood: track.mood,
    era,
    duration: durationLabel,
    textureHints: [
      track.mood,
      ...track.tags,
      track.album,
      year ? `${year} release context` : ''
    ]
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 7)
  };
};

const getLlmTrackChoiceId = (index: number) => `track-${index + 1}`;

const normalizeTrackReference = (value: unknown) =>
  String(value ?? '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^(?:id|trackId|track id)\s*[:=]\s*/i, '')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();

const getStringArrayText = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter(isNonEmptyString)
        .map((item) => item.trim())
        .join(', ')
    : '';

const getTrackReferenceValues = (value: unknown): unknown[] => {
  if (!isRecord(value)) {
    return [value];
  }

  const title = readStringField(value, ['title', 'name', 'songName', 'song_name']);
  const artist =
    readStringField(value, ['artist', 'artistName', 'artist_name']) ||
    getStringArrayText(value.artists) ||
    getStringArrayText(value.artistNames);
  const idFields = [
    value.id,
    value.trackId,
    value.track_id,
    value.songId,
    value.song_id,
    value.shortId,
    value.short_id,
    value.ref
  ];
  const references = idFields.filter(isLlmTrackIdValue);

  if (title) {
    references.push(title);
  }

  if (title && artist) {
    references.push(`${title} - ${artist}`, `${artist} - ${title}`);
  }

  return references;
};

const compactTrackReference = (value: string) => value.replace(/\s*-\s*/g, '-');

const getTrackReferenceLookupKeys = (value: unknown) => {
  const normalized = normalizeTrackReference(value);
  if (!normalized) {
    return [];
  }

  const keys = new Set([normalized, compactTrackReference(normalized)]);
  const numericOnlyMatch = normalized.match(/^(\d+)$/);
  if (numericOnlyMatch) {
    keys.add(`track-${numericOnlyMatch[1]}`);
    keys.add(`#${numericOnlyMatch[1]}`);
    keys.add(`t${numericOnlyMatch[1]}`);
  }

  const shortIdMatch = normalized.match(/^(?:track|trk)\s*[-_#]?\s*(\d+)\b/);
  if (shortIdMatch) {
    keys.add(`track-${shortIdMatch[1]}`);
  }

  const hashIdMatch = normalized.match(/^#\s*(\d+)\b/);
  if (hashIdMatch) {
    keys.add(`#${hashIdMatch[1]}`);
  }

  const teeIdMatch = normalized.match(/^t\s*[-_#]?\s*(\d+)\b/);
  if (teeIdMatch) {
    keys.add(`t${teeIdMatch[1]}`);
  }

  return [...keys];
};

const addTrackLookupKey = (lookup: Map<string, Track>, key: unknown, track: Track) => {
  const normalized = normalizeTrackReference(key);
  if (!normalized) {
    return;
  }

  if (!lookup.has(normalized)) {
    lookup.set(normalized, track);
  }

  const compacted = compactTrackReference(normalized);
  if (compacted && !lookup.has(compacted)) {
    lookup.set(compacted, track);
  }
};

const buildTrackLookup = (tracks: Track[]) => {
  const exactIdLookup = new Map<string, Track>();
  const aliasLookup = new Map<string, Track>();

  tracks.forEach((track) => {
    addTrackLookupKey(exactIdLookup, track.id, track);
  });

  tracks.forEach((track, index) => {
    const choiceId = getLlmTrackChoiceId(index);

    addTrackLookupKey(aliasLookup, choiceId, track);
    addTrackLookupKey(aliasLookup, `#${index + 1}`, track);
    addTrackLookupKey(aliasLookup, `t${index + 1}`, track);
    addTrackLookupKey(aliasLookup, index + 1, track);
    addTrackLookupKey(aliasLookup, track.title, track);
    addTrackLookupKey(aliasLookup, `${track.title} - ${track.artist}`, track);
    addTrackLookupKey(aliasLookup, `${track.artist} - ${track.title}`, track);
  });

  return { exactIdLookup, aliasLookup };
};

export const resolveLlmSelectedTracks = (trackIds: unknown[] = [], tracks: Track[]) => {
  const { exactIdLookup, aliasLookup } = buildTrackLookup(tracks);
  const seen = new Set<string>();
  const selected: Track[] = [];

  for (const trackId of trackIds) {
    const track = getTrackReferenceValues(trackId)
      .flatMap(getTrackReferenceLookupKeys)
      .map((key) => exactIdLookup.get(key) ?? aliasLookup.get(key) ?? aliasLookup.get(compactTrackReference(key)))
      .find((item): item is Track => Boolean(item));
    if (!track || seen.has(track.id)) {
      continue;
    }

    seen.add(track.id);
    selected.push(track);
  }

  return selected;
};

const toLlmTrackPromptItem = (track: Track, index: number) => ({
  id: getLlmTrackChoiceId(index),
  title: track.title,
  artist: track.artist,
  album: track.album,
  year: track.year,
  mood: track.mood,
  semanticTags: track.tags,
  inferredSonicFingerprint: inferSonicFingerprint(track)
});

const resolveCuratedTracksFromPlan = (
  plan: CuratedPlaylistPlan,
  tracks: Track[],
  specificArtistRequest?: SpecificArtistCurationRequest | null
) => {
  let selectedTracks = resolveLlmSelectedTracks(plan.trackIds, tracks);
  if (!specificArtistRequest) {
    return selectedTracks;
  }

  const selectedIds = new Set(selectedTracks.map((track) => track.id));
  const matchingRemainder = tracks.filter(
    (track) => artistMatchesRequest(track, specificArtistRequest.artist) && !selectedIds.has(track.id)
  );

  return [
    ...selectedTracks.filter((track) => artistMatchesRequest(track, specificArtistRequest.artist)),
    ...matchingRemainder
  ].slice(0, specificArtistRequest.requestedCount);
};

const selectFallbackCuratedTracks = (
  tracks: Track[],
  specificArtistRequest?: SpecificArtistCurationRequest | null
) => {
  const eligibleTracks = specificArtistRequest
    ? tracks.filter((track) => artistMatchesRequest(track, specificArtistRequest.artist))
    : tracks;
  const limit = specificArtistRequest?.requestedCount ?? CURATION_FALLBACK_TRACK_COUNT;

  return eligibleTracks.slice(0, limit);
};

const buildLocalCuratedPlaylistPlan = (
  requestKind: 'manual' | 'daily',
  tracks: Track[],
  specificArtistRequest?: SpecificArtistCurationRequest | null
): CuratedPlaylistPlan => {
  const eligibleTracks = specificArtistRequest
    ? tracks.filter((track) => artistMatchesRequest(track, specificArtistRequest.artist))
    : tracks;
  const limit = Math.min(specificArtistRequest?.requestedCount ?? CURATION_FALLBACK_TRACK_COUNT, eligibleTracks.length);

  return {
    title: requestKind === 'daily' ? '今日本地电台' : '本地模型歌单',
    intent: specificArtistRequest ? `${specificArtistRequest.artist} 专场` : '本地稳态编排',
    note: requestKind === 'daily' ? '本地模型降级' : '可播放优先',
    reply: specificArtistRequest
      ? `模型这次响应超时或不可用，我先按 ${specificArtistRequest.artist} 给你排一组可播放队列。`
      : '模型这次响应超时或不可用，我先按可播放曲库给你排一组稳定队列。',
    trackIds: eligibleTracks.slice(0, limit).map((track) => track.id)
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseRetryAfterMs = (value: string | null) => {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) {
    return Math.max(0, timestamp - Date.now());
  }

  return null;
};

const createHttpError = (status: number, text: string, retryAfterMs: number | null): LlmHttpError => {
  const error = new Error(`HTTP ${status}: ${text.slice(0, 200)}`) as LlmHttpError;
  error.status = status;
  if (retryAfterMs !== null) {
    error.retryAfterMs = retryAfterMs;
  }

  return error;
};

const getErrorCauseCode = (error: unknown) => {
  if (!(error instanceof Error) || !error.cause || typeof error.cause !== 'object') {
    return '';
  }

  const cause = error.cause as { code?: unknown };
  return typeof cause.code === 'string' ? cause.code : '';
};

const isRetryableRequestError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  const status = (error as LlmHttpError).status;
  if (typeof status === 'number') {
    return RETRYABLE_HTTP_STATUSES.has(status);
  }

  if (error.name === 'AbortError') {
    return true;
  }

  const causeCode = getErrorCauseCode(error);
  if (/ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR_/i.test(causeCode)) {
    return true;
  }

  return /fetch failed|network|timeout|socket|connection/i.test(error.message);
};

const formatRequestError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return 'unknown error';
  }

  const causeCode = getErrorCauseCode(error);
  if (causeCode) {
    return `${error.message} (${causeCode})`;
  }

  return error.message;
};

const requestJson = async <T>(
  config: LlmConfig,
  endpoint: string,
  init: RequestInit,
  options: { timeoutMs?: number; retryDelaysMs?: number[] } = {}
) => {
  let lastError: unknown = null;
  const retryDelays = options.retryDelaysMs ?? REQUEST_RETRY_DELAYS_MS;
  const timeoutMs = options.timeoutMs ?? config.timeoutMs;
  const dispatcher = config.proxyUrl ? new ProxyAgent(config.proxyUrl) : undefined;

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${config.baseUrl}${endpoint}`, {
        ...init,
        ...(dispatcher ? { dispatcher } : {}),
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          ...(init.headers ?? {})
        },
        signal: controller.signal
      });

      if (!response.ok) {
        const text = await response.text();
        throw createHttpError(response.status, text, parseRetryAfterMs(response.headers.get('retry-after')));
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      const retryDelay = Math.max(
        (error as LlmHttpError)?.retryAfterMs ?? 0,
        retryDelays[attempt] ?? 0
      );

      if (attempt >= retryDelays.length || !isRetryableRequestError(error)) {
        break;
      }

      await sleep(retryDelay);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(
    `LLM request failed after ${retryDelays.length + 1} attempts: ${formatRequestError(lastError)}`
  );
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

    try {
      return new URL(this.config.baseUrl).host;
    } catch {
      return this.config.baseUrl;
    }
  }

  getModelName() {
    return this.config?.model ?? 'gpt-5.5';
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

  async classifyAgentTurn(
    input: string,
    options?: {
      chatHistory?: CurationChatMessage[];
      hasActiveCuration?: boolean;
    }
  ): Promise<{ kind: AgentTurnKind; reply: string }> {
    if (!this.config) {
      throw new Error('LLM env is missing. Add COSIC_LLM_BASE_URL and COSIC_LLM_API_KEY.');
    }

    const payload = await requestJson<ChatCompletionsResponse>(this.config, '/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              'You classify one Cosic assistant turn. Return JSON with kind and reply.',
              'kind must be exactly conversation, playlist, or refinement.',
              'conversation means the user wants to talk, reflect, ask a question, or share a feeling without clearly asking for music.',
              'playlist means the user asks for songs, a playlist, radio, recommendations, an artist, a genre, classical music, or a count of tracks.',
              'refinement means the user is changing the current queue, such as quieter, brighter, darker, another version, less vocal, or more push.',
              'If ambiguous, choose conversation. Reply in warm Chinese, one or two sentences. Do not mention internal classification.'
            ].join(' ')
          },
          {
            role: 'user',
            content: JSON.stringify({
              latestUserMessage: input,
              hasActiveCuration: Boolean(options?.hasActiveCuration),
              conversation: (options?.chatHistory ?? []).slice(-10)
            })
          }
        ]
      })
    });

    const parsed = parseLlmJsonObject<AgentTurnPlan>(extractText(payload), {
      isValid: (value) => isRecord(value) && typeof value.kind === 'string'
    });

    return {
      kind: normalizeAgentTurnKind(parsed.kind),
      reply:
        normalizeSingleParagraph(parsed.reply ?? '') ||
        '我在。你可以慢慢说，今天不一定非要立刻变成一张歌单。'
    };
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
              '你是 Cosic 的中文 track note 编辑。只返回一段 120 到 210 个中文字符的单段文字。写得像懂音乐的人在播放器旁边低声补一句，不像公众号散文。必须有一个具体背景锚点，如艺人阶段、专辑位置、发行年代、风格源流、创作/录音背景或音乐史坐标；再写可听见的声音细节，如人声距离、鼓点密度、和声颜色、录音空间、段落推进或乐器动作；最后用一句克制的感受收住。禁止截图式模板和 AI 反差句：不要写“不是……而是……”“不再是”“不是资料栏”“进入世界的坐标”“带着某种底色”“适合先把注意力放稳”“让旋律接管房间”“放得很稳”“摊在桌面上”“终于能”“我经历过”“所以我仍然在这里”“真正动人的地方”“哲学问题”“无法解释的心事”“可停靠的形状”。不要把 mood 标签直接塞进句子。不要列表、标题、项目符号、markdown、引号或解释过程。不能把不确定背景写成事实，不确定时用“像是”“可理解为”“更接近”。'
          },
          {
            role: 'user',
            content: JSON.stringify({
              title: track.title,
              artist: track.artist,
              album: track.album,
              year: track.year,
              mood: track.mood,
              tags: track.tags
            })
          }
        ]
      })
    });

    const text = normalizeSingleParagraph(extractText(payload));
    if (!text || !isEditorialTrackNote(text)) {
      throw new Error('LLM returned an empty or underwritten track note.');
    }

    return {
      trackId: track.id,
      text,
      source: 'live',
      model: payload.model ?? this.config.model,
      generatedAt: new Date().toISOString()
    };
  }

  async generateTrackInsights(tracks: Track[]): Promise<TrackInsight[]> {
    if (!this.config) {
      throw new Error('LLM env is missing. Add COSIC_LLM_BASE_URL and COSIC_LLM_API_KEY.');
    }

    if (tracks.length === 0) {
      return [];
    }

    const payload = await requestJson<ChatCompletionsResponse>(this.config, '/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0.72,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              '你是 Cosic 的音乐随笔编辑。为每首歌写中文 track note。',
              '每条 120 到 210 个中文字符，只能是一段完整文字，像播放器旁边的一句低声补充，不像公众号散文。',
              '禁止截图式模板和 AI 反差句：不要写“不是……而是……”“不再是”“不是资料栏”“进入世界的坐标”“带着某种底色”“适合先把注意力放稳”“让旋律接管房间”“放得很稳”“摊在桌面上”“终于能”“我经历过”“所以我仍然在这里”“真正动人的地方”“哲学问题”“无法解释的心事”“可停靠的形状”。不要把 mood 标签直接塞进句子。',
              '每条必须有一个具体背景锚点：艺人阶段、专辑位置、发行年代、风格源流、创作/录音背景或音乐史坐标，至少命中其一。',
              '然后写可听见的声音细节：人声距离、鼓点密度、和声颜色、录音空间、段落推进或乐器动作，至少命中其一。',
              '最后用一句克制的感受收住，不要替用户宣判人生。',
              '不要模板，不要重复开头，不要标题、列表、项目符号或解释你的思考过程。',
              '不要把不知道的背景写成事实；不确定时使用“像是”“可理解为”“更接近”。',
              '返回 JSON：{ "notes": [ { "trackId": "...", "text": "..." } ] }。'
            ].join(' ')
          },
          {
            role: 'user',
            content: JSON.stringify({
              tracks: tracks.map((track) => ({
                trackId: track.id,
                title: track.title,
                artist: track.artist,
                album: track.album,
                year: track.year,
                mood: track.mood,
                tags: track.tags
              }))
            })
          }
        ]
      })
    });

    const text = extractText(payload);
    const parsed = parseLlmJsonObject<TrackInsightPlan>(text, {
      isValid: (value) => isRecord(value) && Array.isArray(value.notes)
    });
    const generatedAt = new Date().toISOString();
    const model = payload.model ?? this.config.model;
    const validTrackIds = new Set(tracks.map((track) => track.id));

    return (parsed.notes ?? [])
      .map((note) => ({
        trackId: note.trackId?.trim() ?? '',
        text: normalizeSingleParagraph(note.text ?? '')
      }))
      .filter((note) => validTrackIds.has(note.trackId) && isEditorialTrackNote(note.text))
      .map((note) => ({
        trackId: note.trackId,
        text: note.text,
        source: 'live' as const,
        model,
        generatedAt
      }));
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
    const parsed = parseLlmJsonObject<{
      archetype?: string;
      summary?: string;
      signals?: string[];
    }>(text, {
      isValid: (value) =>
        isRecord(value) &&
        (typeof value.archetype === 'string' ||
          typeof value.summary === 'string' ||
          Array.isArray(value.signals))
    });

    return {
      archetype: parsed.archetype?.trim() || '策展型听众',
      summary:
        parsed.summary?.trim() ||
        '你的歌单跨度很大，按场景和情绪分层很明显。',
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
      chatHistory?: CurationChatMessage[];
      specificArtistRequest?: SpecificArtistCurationRequest | null;
    }
  ): Promise<CuratedPlaylist> {
    if (!this.config) {
      throw new Error('LLM env is missing. Add COSIC_LLM_BASE_URL and COSIC_LLM_API_KEY.');
    }

    const requestKind = options?.requestKind ?? 'manual';
    let payload: ChatCompletionsResponse = { model: this.config.model };
    let parsed: CuratedPlaylistPlan;

    try {
      payload = await requestJson<ChatCompletionsResponse>(
        this.config,
        '/chat/completions',
        {
          method: 'POST',
          body: JSON.stringify({
            model: this.config.model,
            temperature: 0.45,
            max_tokens: 650,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: [
                  'You are the daily radio editor for Cosic, a personal desktop player.',
                  'Choose only from the provided tracks.',
                  'Return strict JSON only with title, intent, note, reply, and trackIds.',
                  'Every candidate track has a short id like track-1. Return those exact short id values in trackIds.',
                  'Return 15 to 50 trackIds when possible.',
                  'If the user asks for a specific artist and requested count, obey that hard constraint.',
                  'Do not include markdown, comments, visible reasoning, or explanations outside JSON.'
                ].join(' ')
              },
              {
                role: 'user',
                content: JSON.stringify({
                  input,
                  requestKind,
                  specificArtistRequest: options?.specificArtistRequest ?? null,
                  conversation: (options?.chatHistory ?? []).slice(-8),
                  candidateAnalysisContract: {
                    semanticTags: 'Use candidate semanticTags as editorial clues, not as hard genres.',
                    inferredSonicFingerprint:
                      'Use candidate inferredSonicFingerprint to infer texture, era, duration, and mood fit.'
                  },
                  discoveryQueries: options?.discoveryQueries ?? [],
                  dailyBrief: options?.dailyBrief
                    ? {
                        localTimeLabel: options.dailyBrief.localTimeLabel,
                        partOfDayLabel: options.dailyBrief.partOfDayLabel,
                        regionLabel: options.dailyBrief.regionLabel,
                        weather: options.dailyBrief.weather
                          ? {
                              summary: options.dailyBrief.weather.summary,
                              temperatureC: options.dailyBrief.weather.temperatureC
                            }
                          : null,
                        moodGuess: options.dailyBrief.moodGuess,
                        tasteAnchor: options.dailyBrief.tasteAnchor
                      }
                    : null,
                  tasteProfile: options?.tasteProfile
                    ? {
                        archetype: options.tasteProfile.archetype,
                        summary: options.tasteProfile.summary,
                        signals: options.tasteProfile.signals.slice(0, 3),
                        topArtists: options.tasteProfile.topArtists.slice(0, 4)
                      }
                    : null,
                  tracks: tracks.map(toLlmTrackPromptItem)
                })
              }
            ]
          })
        },
        {
          timeoutMs: this.config.curationTimeoutMs,
          retryDelaysMs: []
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      throw new Error(`LLM playlist request failed: ${message}`);
    }

    try {
      const parsedCandidate = parseLlmJsonObject<unknown>(extractText(payload), {
        isValid: isCuratedPlaylistPlan
      });
      const normalizedPlan = normalizeCuratedPlaylistPlan(parsedCandidate);
      if (!normalizedPlan) {
        throw new Error('LLM playlist plan contained no usable track references.');
      }

      parsed = normalizedPlan;
    } catch {
      parsed = buildLocalCuratedPlaylistPlan(requestKind, tracks, options?.specificArtistRequest);
    }

    let selectedTracks = resolveCuratedTracksFromPlan(parsed, tracks, options?.specificArtistRequest);

    if (selectedTracks.length === 0) {
      selectedTracks = selectFallbackCuratedTracks(tracks, options?.specificArtistRequest);
    }

    const targetTrackCount = Math.min(
      options?.specificArtistRequest?.requestedCount ?? CURATION_FALLBACK_TRACK_COUNT,
      tracks.length
    );
    if (selectedTracks.length < targetTrackCount) {
      const selectedIds = new Set(selectedTracks.map((track) => track.id));
      const fallbackTracks = selectFallbackCuratedTracks(tracks, options?.specificArtistRequest).filter(
        (track) => !selectedIds.has(track.id)
      );
      selectedTracks = [...selectedTracks, ...fallbackTracks].slice(0, targetTrackCount);
    }

    if (selectedTracks.length === 0 && tracks.length > 0) {
      parsed = buildLocalCuratedPlaylistPlan(requestKind, tracks, options?.specificArtistRequest);
      selectedTracks = selectFallbackCuratedTracks(tracks, options?.specificArtistRequest);
    }

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
        (options?.specificArtistRequest
          ? `${options.specificArtistRequest.artist} / ${selectedTracks.length} 首`
          : options?.dailyBrief
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

  async generateCurationChatReply(
    input: string,
    playlist: CuratedPlaylist,
    options?: {
      chatHistory?: CurationChatMessage[];
      tasteProfile?: MusicTasteProfile | null;
      dailyBrief?: DailyStationBrief | null;
    }
  ) {
    if (!this.config) {
      throw new Error('LLM env is missing. Add COSIC_LLM_BASE_URL and COSIC_LLM_API_KEY.');
    }

    const payload = await requestJson<ChatCompletionsResponse>(this.config, '/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0.45,
        messages: [
          {
            role: 'system',
            content: [
              '你负责给 Cosic 写一句自然的聊天回复。',
              '必须直接回答用户最新一句话，不能说空泛的氛围词，不能像 mock 回执。',
              '如果用户明确点名歌手、曲风、数量或语言，回复必须复述这个硬约束并说明已经按它排。',
              '如果用户说“十首Adele的歌”“二十首Adele的歌”或类似请求，回复要明确写出 Adele 和对应数量/接近对应数量，不要写城市、傍晚、房间、边界之类与请求无关的意象。',
              '可以用一到两句中文，克制但具体。不要 markdown，不要列表，不要解释内部推理。'
            ].join(' ')
          },
          {
            role: 'user',
            content: JSON.stringify({
              latestUserMessage: input,
              conversation: options?.chatHistory ?? [],
              playlist: {
                title: playlist.title,
                intent: playlist.intent,
                note: playlist.note,
                requestKind: playlist.requestKind,
                trackCount: playlist.tracks.length,
                tracks: playlist.tracks.slice(0, 12).map((track) => ({
                  title: track.title,
                  artist: track.artist,
                  album: track.album,
                  year: track.year
                }))
              },
              tasteProfile: options?.tasteProfile
                ? {
                    archetype: options.tasteProfile.archetype,
                    summary: options.tasteProfile.summary,
                    topArtists: options.tasteProfile.topArtists.slice(0, 5)
                  }
                : null,
              dailyBrief: options?.dailyBrief
                ? {
                    localTimeLabel: options.dailyBrief.localTimeLabel,
                    regionLabel: options.dailyBrief.regionLabel,
                    weather: options.dailyBrief.weather?.summary ?? null
                  }
                : null
            })
          }
        ]
      })
    });

    const text = normalizeSingleParagraph(extractText(payload));
    if (!text) {
      throw new Error('LLM returned an empty chat reply.');
    }

    return text;
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
              'You create short external music search queries for Cosic playlist discovery. Return JSON with queries only. Provide 3 to 6 concise queries. Each query should be natural for NetEase music search, but broad enough to reach outside the users existing library through all playable external sources available to the bridge. Mix artist, era, adjacent genre, texture, scene, and mood. Use Chinese when appropriate. Avoid punctuation-heavy long sentences.'
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
    const parsed = parseLlmJsonObject<{ queries?: string[] }>(text, {
      isValid: (value) => isRecord(value) && Array.isArray(value.queries)
    });

    return {
      queries: (parsed.queries ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 6)
    };
  }
}
