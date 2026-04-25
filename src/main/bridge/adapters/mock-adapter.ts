import type {
  BridgeCapability,
  BridgeCapabilityId,
  BridgeDevice,
  BridgeHealth,
  BridgeSnapshot,
  BridgeServer,
  CapabilityProbeResult,
  CuratedPlaylist,
  DailyStationBrief,
  Track,
  TrackInsight
} from '../../../shared/contracts/bridge';

const nowIso = () => new Date().toISOString();

const capabilityTemplates: Record<
  BridgeCapabilityId,
  Omit<BridgeCapability, 'latencyMs' | 'lastCheckedAt'>
> = {
  brain: {
    id: 'brain',
    label: 'LLM Brain',
    provider: 'OpenAI-compatible',
    summary: 'Writes short station copy and smart prompts.',
    status: 'mock'
  },
  music: {
    id: 'music',
    label: 'Music Library',
    provider: 'Netease-ready',
    summary: 'Playlist, catalog and playback source resolution.',
    status: 'mock'
  },
  voice: {
    id: 'voice',
    label: 'Voice Synth',
    provider: 'Fish Audio-ready',
    summary: 'Voice intro, spoken id and narration.',
    status: 'mock'
  },
  calendar: {
    id: 'calendar',
    label: 'Calendar Feed',
    provider: 'Feishu-ready',
    summary: 'Calendar context and event summary.',
    status: 'mock'
  },
  weather: {
    id: 'weather',
    label: 'Weather Feed',
    provider: 'OpenWeather-ready',
    summary: 'Ambient weather and scene context.',
    status: 'mock'
  },
  cast: {
    id: 'cast',
    label: 'Room Cast',
    provider: 'UPnP-ready',
    summary: 'Discovery and device handoff.',
    status: 'mock'
  }
};

const deviceTemplates: BridgeDevice[] = [
  {
    id: 'desk-speaker',
    name: 'Desk Speaker',
    zone: 'Studio',
    transport: 'Local renderer',
    status: 'ready'
  },
  {
    id: 'living-room',
    name: 'Living Room Node',
    zone: 'Home',
    transport: 'UPnP standby',
    status: 'standby'
  },
  {
    id: 'kitchen',
    name: 'Kitchen Mini',
    zone: 'Home',
    transport: 'Discovery waiting',
    status: 'offline'
  }
];

const buildLatency = (status: BridgeHealth, seed: number) => {
  if (status === 'offline') {
    return 0;
  }

  return 36 + seed * 11;
};

const curatorProfiles = [
  {
    id: 'focus',
    title: 'Focus Lane',
    intent: '深度专注',
    note: '前段稳住，避免情绪过度起伏，整条队列只做轻推进。',
    keywords: ['工作', '专注', 'focus', 'coding', '写', '深度', '效率', '推进'],
    moods: ['Focused', 'Calm'],
    tags: ['console glow', 'slow pulse', 'warm synth']
  },
  {
    id: 'wind-down',
    title: 'Slow Release',
    intent: '缓慢收尾',
    note: '先保留一点结构，再把房间慢慢放松下来，不突然塌陷。',
    keywords: ['放松', '收尾', '晚上', 'wind', 'rest', 'sleep', '下班', '夜里'],
    moods: ['Calm', 'Open'],
    tags: ['late city', 'thin air', 'sea air']
  },
  {
    id: 'cinematic',
    title: 'Cinematic Lift',
    intent: '克制的提振',
    note: '允许一点规模感，但节奏仍然清楚，不能抢走注意力。',
    keywords: ['灵感', '电影', 'cinematic', '提神', '开工', 'launch', 'build'],
    moods: ['Cinematic', 'Focused'],
    tags: ['weather feed', 'copper haze', 'evening']
  }
] as const;

const pickProfile = (input: string) => {
  const text = input.toLowerCase();
  const ranked = curatorProfiles
    .map((profile) => ({
      profile,
      score: profile.keywords.reduce(
        (total, keyword) => total + (text.includes(keyword.toLowerCase()) ? 1 : 0),
        0
      )
    }))
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.score ? ranked[0].profile : curatorProfiles[0];
};

const scoreTrackForProfile = (track: Track, profile: (typeof curatorProfiles)[number], input: string) => {
  const text = input.toLowerCase();
  let score = 0;

  if (profile.moods.some((mood) => mood === track.mood)) {
    score += 4;
  }

  for (const tag of track.tags) {
    if (profile.tags.some((profileTag) => tag.toLowerCase().includes(profileTag.toLowerCase()))) {
      score += 3;
    }

    if (text.includes(tag.toLowerCase())) {
      score += 2;
    }
  }

  if (text.includes(track.mood.toLowerCase())) {
    score += 4;
  }

  if (text.includes(track.artist.toLowerCase()) || text.includes(track.title.toLowerCase())) {
    score += 3;
  }

  return score;
};

export class MockBridgeAdapter {
  getSnapshot(): BridgeSnapshot {
    const updatedAt = nowIso();
    const capabilities = Object.values(capabilityTemplates).map((capability, index) => ({
      ...capability,
      latencyMs: buildLatency(capability.status, index + 1),
      lastCheckedAt: updatedAt
    }));
    const server: BridgeServer = {
      name: 'Local Node Core',
      runtime: `Node ${process.versions.node}`,
      status: 'mock',
      updatedAt
    };

    return {
      server,
      capabilities,
      devices: deviceTemplates,
      notes: [
        'Renderer only talks to the main process bridge.',
        'LLM can switch from mock to live without changing UI.',
        'Everything else stays mock until you wire the provider.'
      ]
    };
  }

  probeCapability(capabilityId: BridgeCapabilityId): CapabilityProbeResult {
    const capability = capabilityTemplates[capabilityId];
    const checkedAt = nowIso();
    const latencyMs = buildLatency(capability.status, capabilityId.length + 1);

    return {
      capabilityId,
      status: capability.status,
      latencyMs,
      checkedAt,
      message:
        capability.status === 'mock'
          ? `${capability.label} is still on mock mode.`
          : `${capability.label} is unavailable right now.`
    };
  }

  generateTrackInsight(track: Track): TrackInsight {
    const generatedAt = nowIso();

    return {
      trackId: track.id,
      text: `《${track.title}》把 ${track.mood} 的底色压在 ${track.tags.slice(0, 2).join(' / ')} 里，${track.artist} 让这一段听起来更像一张私人的唱片内页。`,
      source: 'mock',
      model: 'mock-brain',
      generatedAt
    };
  }

  generateCuratedPlaylist(
    input: string,
    tracks: Track[],
    options?: {
      dailyBrief?: DailyStationBrief | null;
      requestKind?: 'manual' | 'daily';
    }
  ): CuratedPlaylist {
    const generatedAt = nowIso();
    const profile = pickProfile(input);
    const requestKind = options?.requestKind ?? 'manual';
    const rankedTracks = [...tracks]
      .map((track, index) => ({
        track,
        score: scoreTrackForProfile(track, profile, input) + (tracks.length - index) * 0.1
      }))
      .sort((left, right) => right.score - left.score)
      .map((entry) => entry.track);

    const selected = rankedTracks.slice(0, Math.min(6, rankedTracks.length));
    const dailySummary =
      requestKind === 'daily' && options?.dailyBrief
        ? [
            `${options.dailyBrief.weekdayLabel} ${options.dailyBrief.localTimeLabel}`,
            options.dailyBrief.regionLabel,
            options.dailyBrief.weather?.summary,
            options.dailyBrief.moodGuess
          ]
            .filter(Boolean)
            .join(' · ')
        : profile.note;

    return {
      id: `mock-curation-${Date.now()}`,
      prompt: input,
      title:
        requestKind === 'daily' && options?.dailyBrief
          ? options.dailyBrief.partOfDayLabel
          : profile.title,
      intent:
        requestKind === 'daily' && options?.dailyBrief
          ? `${options.dailyBrief.moodGuess} / ${options.dailyBrief.archetype}`
          : profile.intent,
      note: dailySummary,
      reply:
        requestKind === 'daily' && options?.dailyBrief
          ? '今日队列已经收好。'
          : `${profile.intent}队列已就位。`,
      source: 'mock',
      model: 'mock-curator',
      generatedAt,
      requestKind,
      dailyBrief: options?.dailyBrief ?? null,
      tracks: selected
    };
  }
}
