import fs from 'node:fs';
import path from 'node:path';
import { mockTracks } from '../../shared/mock/tracks';
import { enrichTrackWithClassicalMetadata, isClassicalLikeTrack } from '../../shared/classical';
import type {
  AgentTurnKind,
  AgentTurnResponse,
  BootstrapPayload,
  BridgeCapability,
  BridgeCapabilityId,
  BridgeSnapshot,
  CapabilityProbeResult,
  CurationRequest,
  DailyStationBrief,
  ClassicalCoverageReport,
  ClassicalCoverageReportItem,
  ClassicalScoreCoverage,
  ClassicalScoreSource,
  CuratedPlaylist,
  LibraryContext,
  LibraryLoadResult,
  LibraryPlaylist,
  MusicTasteProfile,
  NarrationAudio,
  TasteFacet,
  Track,
  TrackInsight,
  TrackLyrics,
  WindowPlatform
} from '../../shared/contracts/bridge';
import { LocalMusicBridgeAdapter, type MusicBootstrapResult } from './adapters/local-music-bridge';
import { MockBridgeAdapter } from './adapters/mock-adapter';
import { OpenAiCompatibleLlmAdapter } from './adapters/openai-compatible-llm';
import { OpenAiImageGenerator } from './adapters/openai-image-generator';
import { OpenWeatherAdapter } from './adapters/open-weather-adapter';
import { CosyVoiceAdapter } from './adapters/cosyvoice-adapter';
import { getProviderReadiness } from './provider-readiness';

interface LibraryTrackEntry {
  track: Track;
  count: number;
  playlistIds: string[];
  playlistNames: string[];
}

interface LibraryCatalogSnapshot {
  accountLabel: string;
  playlists: LibraryPlaylist[];
  totalTrackEntries: number;
  generatedAt: string;
  trackEntries: LibraryTrackEntry[];
  trackEntryMap: Map<string, LibraryTrackEntry>;
}

interface SpecificArtistRequest {
  artist: string;
  requestedCount: number;
  strictArtistOnly: true;
}

interface ScoreManifestScore {
  title?: string;
  instrument?: ClassicalScoreSource['instrument'];
  role?: ClassicalScoreSource['role'];
  priority?: ClassicalScoreSource['priority'];
  sourceUrl?: string;
  status?: string;
  reason?: string;
  localUrl?: string;
  cachePath?: string | null;
  fileName?: string;
}

interface ScoreManifestEntry {
  workId?: string;
  scores?: ScoreManifestScore[];
}

interface ScoreManifest {
  entries?: ScoreManifestEntry[];
}

interface CachedScoreManifest {
  manifest: ScoreManifest | null;
  mtimeMs: number;
}

const nowIso = () => new Date().toISOString();

const compiledProjectRoot = () => path.resolve(__dirname, '../../../..');

const toUnpackedAsarPath = (value: string) =>
  value.replace(/app\.asar(?=$|[\\/])/, 'app.asar.unpacked');

const resolveProjectRoot = () => toUnpackedAsarPath(compiledProjectRoot());

const SCORE_MANIFEST_PATH = path.join(resolveProjectRoot(), 'artifacts', 'scores', 'manifest.json');

const CURATED_PLAYLIST_MIN_TRACKS = 15;
const CURATED_PLAYLIST_MAX_TRACKS = 50;
const MANUAL_CURATION_TASTE_TIMEOUT_MS = 1500;
const DAILY_CURATION_CONTEXT_TIMEOUT_MS = 4500;
const DAILY_CURATION_DISCOVERY_TIMEOUT_MS = 5000;
const MANUAL_CURATION_LLM_CANDIDATE_LIMIT = 36;
const AGENT_CLASSIFICATION_TIMEOUT_MS = 6000;
const AGENT_PLAYLIST_HINTS = [
  '推荐',
  '歌单',
  '来几首',
  '来一组',
  '给我',
  '想听',
  '播放',
  '电台',
  'radio',
  'playlist',
  'recommend',
  'songs',
  'tracks',
  'classical',
  '古典',
  '钢琴',
  '小提琴',
  '谱',
  '五线谱',
  '巴赫',
  '贝多芬',
  '莫扎特',
  '肖邦',
  '德彪西',
  '柴可夫斯基',
  '维瓦尔第'
];
const AGENT_REFINEMENT_HINTS = [
  '更安静',
  '更亮',
  '更暗',
  '更慢',
  '更快',
  '再轻',
  '再重',
  '换一版',
  '重做',
  '不要',
  '少一点',
  '多一点',
  'another version',
  'quieter',
  'darker',
  'brighter',
  'slower',
  'faster'
];

const shouldUseSeparateChatReply = () => process.env.COSIC_LLM_SEPARATE_CHAT_REPLY === 'true';

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const chunk = <T>(items: T[], size: number) => {
  const groups: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }

  return groups;
};

const getRandomUnit = () => {
  const values = new Uint32Array(1);
  globalThis.crypto?.getRandomValues(values);
  return values[0] ? values[0] / 0xffffffff : Math.random();
};

export const diversifyCurationCandidates = (tracks: Track[], randomUnit = getRandomUnit) => {
  const shuffledHeadSize = Math.min(tracks.length, Math.max(8, Math.ceil(tracks.length * 0.35)));
  const head = tracks.slice(0, shuffledHeadSize);

  for (let index = head.length - 1; index > 0; index -= 1) {
    const unit = Math.min(Math.max(randomUnit(), 0), 0.999999999);
    const swapIndex = Math.floor(unit * (index + 1));
    [head[index], head[swapIndex]] = [head[swapIndex], head[index]];
  }

  return [...head, ...tracks.slice(shuffledHeadSize)];
};

const shuffleLibraryPlaylists = (playlists: LibraryPlaylist[]) => {
  const shuffled = playlists.filter((playlist) => playlist.trackCount > 0);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(getRandomUnit() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
};

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter(Boolean);

const normalizeTrackText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[\(\[（【].*?[\)\]）】]/g, ' ')
    .replace(/\b(?:live|ver|version|mix|demo|remaster(?:ed)?)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getPrimaryArtist = (artist: string) =>
  normalizeTrackText(
    artist
      .split(/[\/,&]/)
      .map((item) => item.trim())
      .find(Boolean) ?? artist
  );

const getTrackSignature = (track: Pick<Track, 'title' | 'artist'>) =>
  `${normalizeTrackText(track.title)}::${getPrimaryArtist(track.artist)}`;

const parseChineseCount = (value: string) => {
  const normalized = value.trim();
  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  const digits: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
  };

  if (normalized === '十') {
    return 10;
  }

  const tenIndex = normalized.indexOf('十');
  if (tenIndex >= 0) {
    const tensText = normalized.slice(0, tenIndex);
    const onesText = normalized.slice(tenIndex + 1);
    const tens = tensText ? digits[tensText] ?? 0 : 1;
    const ones = onesText ? digits[onesText] ?? 0 : 0;
    return tens * 10 + ones;
  }

  return digits[normalized] ?? Number.NaN;
};

const clampPlaylistTrackCount = (value: number) => {
  const normalized = Math.floor(value);
  return Number.isFinite(normalized)
    ? Math.max(CURATED_PLAYLIST_MIN_TRACKS, Math.min(CURATED_PLAYLIST_MAX_TRACKS, normalized))
    : CURATED_PLAYLIST_MIN_TRACKS;
};

const clampRequestedCount = (value: number) => clampPlaylistTrackCount(value);

const isBareRequestedCount = (value: string) => /^(?:\d{1,2}|[一二两三四五六七八九十]{1,3})$/u.test(value.trim());

const cleanRequestedArtist = (value: string) =>
  value
    .replace(/^(?:我要|我想|想听|给我|帮我|来点|来|播放|听|请|要)+/i, '')
    .replace(/(?:的歌|歌曲|歌|音乐|作品|谢谢|吧|一下|的)+$/i, '')
    .trim();

const artistMatchesRequest = (track: Pick<Track, 'artist'>, artist: string) => {
  const requested = normalizeTrackText(artist);
  const fullArtist = normalizeTrackText(track.artist);

  if (!requested || !fullArtist) {
    return false;
  }

  return fullArtist.includes(requested) || requested.includes(fullArtist);
};

const parseSpecificArtistLine = (value: string): SpecificArtistRequest | null => {
  const countPattern = String.raw`(?<count>\d{1,2}|[一二两三四五六七八九十]{1,3})`;
  const artistPattern = String.raw`(?<artist>[\p{L}\p{N}][\p{L}\p{N}\s.'’&\-·/]{0,60}?)`;
  const patterns = [
    new RegExp(`${countPattern}\\s*首\\s*${artistPattern}(?:的歌|歌曲|歌|的|$|[，。,.!?])`, 'iu'),
    new RegExp(`${artistPattern}(?:的歌|歌曲|歌)?\\s*${countPattern}\\s*首\\s*(?:的歌|歌曲|歌)?`, 'iu')
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    const countText = match?.groups?.count;
    const artistText = match?.groups?.artist;
    if (!countText || !artistText) {
      continue;
    }

    const requestedCount = clampRequestedCount(parseChineseCount(countText));
    const artist = cleanRequestedArtist(artistText);
    if (!Number.isFinite(requestedCount) || !artist || isBareRequestedCount(artist)) {
      continue;
    }

    return {
      artist,
      requestedCount,
      strictArtistOnly: true
    };
  }

  return null;
};

const extractRequestedCount = (value: string) => {
  const match = value.match(/(?<count>\d{1,2}|[一二两三四五六七八九十]{1,3})\s*首/u);
  const countText = match?.groups?.count;
  if (!countText) {
    return null;
  }

  const parsed = clampRequestedCount(parseChineseCount(countText));
  return Number.isFinite(parsed) ? parsed : null;
};

const extractArtistOnlyRequest = (value: string) => {
  const match = value.match(
    /(?:我要|我想|想听|给我|帮我|来点|来|播放|听|请|要)?\s*(?<artist>[\p{L}\p{N}][\p{L}\p{N}\s.'’&\-·/]{0,60}?)(?:的歌|歌曲|歌)(?:$|[，。,.!?])/iu
  );
  const artist = cleanRequestedArtist(match?.groups?.artist ?? '');
  return artist || null;
};

export const parseSpecificArtistRequest = (
  latestInput: string,
  chatHistory: NonNullable<CurationRequest['chatHistory']>
): SpecificArtistRequest | null => {
  const direct = parseSpecificArtistLine(latestInput);
  if (direct) {
    return direct;
  }

  const requestedCount = extractRequestedCount(latestInput);
  if (!requestedCount) {
    return null;
  }

  for (const message of [...chatHistory].reverse()) {
    if (message.role !== 'user') {
      continue;
    }

    const artist = extractArtistOnlyRequest(message.text);
    if (artist) {
      return {
        artist,
        requestedCount,
        strictArtistOnly: true
      };
    }
  }

  return null;
};

const dedupeTracks = (
  tracks: Track[],
  options?: { maxTracks?: number; maxPerArtist?: number; maxPerAlbum?: number }
) => {
  const maxTracks = options?.maxTracks ?? tracks.length;
  const maxPerArtist = options?.maxPerArtist ?? Number.POSITIVE_INFINITY;
  const maxPerAlbum = options?.maxPerAlbum ?? Number.POSITIVE_INFINITY;
  const seenIds = new Set<string>();
  const seenSignatures = new Set<string>();
  const artistCounts = new Map<string, number>();
  const albumCounts = new Map<string, number>();
  const result: Track[] = [];

  for (const track of tracks) {
    const signature = getTrackSignature(track);
    if (seenIds.has(track.id) || seenSignatures.has(signature)) {
      continue;
    }

    const artistKey = getPrimaryArtist(track.artist);
    if (artistKey && (artistCounts.get(artistKey) ?? 0) >= maxPerArtist) {
      continue;
    }

    const albumKey = normalizeTrackText(track.album);
    if (albumKey && (albumCounts.get(albumKey) ?? 0) >= maxPerAlbum) {
      continue;
    }

    seenIds.add(track.id);
    seenSignatures.add(signature);

    if (artistKey) {
      artistCounts.set(artistKey, (artistCounts.get(artistKey) ?? 0) + 1);
    }

    if (albumKey) {
      albumCounts.set(albumKey, (albumCounts.get(albumKey) ?? 0) + 1);
    }

    result.push(track);
    if (result.length >= maxTracks) {
      break;
    }
  }

  return result;
};

export const prepareCurationCandidateTracks = (
  candidateTracks: Track[],
  knownTracks: Track[] = [],
  fallbackTracks: Track[] = [],
  options?: { maxTracks?: number; maxPerArtist?: number; maxPerAlbum?: number }
) => {
  const sourceTracks =
    candidateTracks.length > 0 ? candidateTracks : knownTracks.length > 0 ? knownTracks : fallbackTracks;

  return dedupeTracks(sourceTracks, {
    maxTracks: options?.maxTracks ?? 96,
    maxPerArtist: options?.maxPerArtist ?? 2,
    maxPerAlbum: options?.maxPerAlbum ?? 2
  });
};

const toFacetList = (map: Map<string, number>, limit = 6): TasteFacet[] =>
  [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([label, count]) => ({
      label,
      count
    }));

const sumFacet = (map: Map<string, number>, label: string, amount = 1) => {
  map.set(label, (map.get(label) ?? 0) + amount);
};

const buildFallbackSignals = (profile: MusicTasteProfile) => {
  const artistLead = profile.topArtists[0]?.label ?? '你的核心收藏';
  const albumLead = profile.topAlbums[0]?.label ?? '整张专辑聆听';
  const yearLead = profile.topYears[0]?.label ?? '跨年代收藏';

  return [
    `你的收藏围绕 ${artistLead} 展开，同时还有明显的旁支和回访路线。`,
    `你的专辑取向很明显，像《${albumLead}》这种整张作品会反复出现。`,
    `你的年代分布会回到 ${yearLead} 附近，但不会只停在一个时期。`
  ];
};

const normalizeChatHistory = (messages: CurationRequest['chatHistory'] = []) =>
  messages
    .filter(
      (message): message is NonNullable<CurationRequest['chatHistory']>[number] =>
        Boolean(message) &&
        typeof message === 'object' &&
        !Array.isArray(message) &&
        (message.role === 'assistant' || message.role === 'user') &&
        typeof message.text === 'string' &&
        message.text.trim().length > 0
    )
    .slice(-24)
    .map((message) => ({
      role: message.role,
      text: message.text.trim().slice(0, 600)
    }));

const includesAnyHint = (value: string, hints: string[]) => {
  const normalized = value.toLowerCase();

  return hints.some((hint) => normalized.includes(hint.toLowerCase()));
};

const hasRecentPlaylistContext = (chatHistory: NonNullable<CurationRequest['chatHistory']>) =>
  chatHistory
    .slice(-8)
    .some((message) => message.role === 'assistant' && includesAnyHint(message.text, ['歌单', '队列', 'playlist']));

const classifyAgentTurnLocally = (
  prompt: string,
  chatHistory: NonNullable<CurationRequest['chatHistory']>,
  hasActiveCuration: boolean
): AgentTurnKind | null => {
  const normalized = prompt.trim();
  if (!normalized) {
    return null;
  }

  if (includesAnyHint(normalized, AGENT_PLAYLIST_HINTS) || /\b\d{1,2}\s*(?:首|songs?|tracks?)\b/iu.test(normalized)) {
    return 'playlist';
  }

  if (
    normalized.length <= 28 &&
    includesAnyHint(normalized, AGENT_REFINEMENT_HINTS) &&
    (hasActiveCuration || hasRecentPlaylistContext(chatHistory))
  ) {
    return 'refinement';
  }

  if (/^(?:聊聊|说说|为什么|你觉得|我今天|今天有点|有点|只是想|陪我|在吗)/u.test(normalized)) {
    return 'conversation';
  }

  return null;
};

const buildLocalConversationReply = (prompt: string) => {
  const trimmed = prompt.trim();

  if (/累|疲惫|难过|烦|空|睡不着/u.test(trimmed)) {
    return '我在。先不急着排歌单，这句话可以先停在这里。你现在需要一点空间，我陪你慢慢把它说清楚。';
  }

  return '我在听。你可以继续说，等你真的想让音乐进来时，我再替你把它排成一条路。';
};

const isClassicalRequest = (value: string) =>
  includesAnyHint(value, ['classical', '古典', '钢琴', '小提琴', '五线谱', '谱', '巴赫', '贝多芬', '莫扎特', '肖邦', '德彪西']);

const REFINEMENT_PROMPT_HINTS = [
  '换一版',
  '更静',
  '更亮',
  '更暗',
  '更推进',
  '更松',
  '更慢',
  '更快',
  '再来',
  '继续',
  '别太',
  '不要太',
  '安静一点',
  '轻一点',
  '重一点',
  '像刚才',
  '像上一版',
  '还是'
];

const isRefinementPrompt = (prompt: string) => {
  const normalized = prompt.trim();

  if (!normalized || normalized.includes('\n')) {
    return false;
  }

  if (REFINEMENT_PROMPT_HINTS.some((hint) => normalized.includes(hint))) {
    return true;
  }

  return normalized.length <= 16 && /^(?:更|再|换|别|不要|还是|偏)/u.test(normalized);
};

const buildConversationSearchText = (
  prompt: string,
  chatHistory: NonNullable<CurationRequest['chatHistory']>
) => {
  const normalizedPrompt = prompt.trim();

  if (!isRefinementPrompt(normalizedPrompt)) {
    return normalizedPrompt;
  }

  const previousUserPrompts = chatHistory
    .filter((message) => message.role === 'user')
    .map((message) => message.text.trim())
    .filter(Boolean);
  const previousUserPrompt =
    previousUserPrompts.length > 1 ? previousUserPrompts[previousUserPrompts.length - 2] ?? '' : '';

  return [previousUserPrompt, normalizedPrompt].filter(Boolean).join('\n').trim();
};

const formatRegionFromTimezone = (timezone: string | undefined) => {
  if (!timezone) {
    return 'Local Region';
  }

  const parts = timezone.split('/');
  const city = parts[parts.length - 1] ?? timezone;
  return city.replace(/_/g, ' ');
};

const formatPartOfDay = (hour: number) => {
  if (hour < 6) {
    return 'Early Hours';
  }

  if (hour < 11) {
    return 'Morning Run';
  }

  if (hour < 15) {
    return 'Work Block';
  }

  if (hour < 19) {
    return 'Late Shift';
  }

  if (hour < 23) {
    return 'Evening Drop';
  }

  return 'Night Loop';
};

const inferMoodGuess = (
  hour: number,
  temperatureC: number | null,
  weatherSummary: string | null
) => {
  const weather = (weatherSummary ?? '').toLowerCase();
  const isWet = /rain|drizzle|storm|shower|雪|雨/.test(weather);
  const isGray = /cloud|mist|fog|overcast|阴|雾/.test(weather);
  const isHot = temperatureC !== null && temperatureC >= 28;
  const isCold = temperatureC !== null && temperatureC <= 10;

  if (hour < 6) {
    return {
      moodGuess: '不想被突然叫醒',
      moodReason: '现在更适合低亮度、低惊扰、慢慢起机的开场。'
    };
  }

  if (hour < 11) {
    if (isWet || isGray) {
      return {
        moodGuess: '想稳住节奏',
        moodReason: '上午天色和空气都偏闷，今天更需要轻推进和清醒感。'
      };
    }

    return {
      moodGuess: '需要慢热提神',
      moodReason: '上午的状态还在铺开，节奏要把注意力托起来，但不能太吵。'
    };
  }

  if (hour < 17) {
    if (isHot) {
      return {
        moodGuess: '想给大脑降噪',
        moodReason: '白天温度偏高，推荐更克制、更通风的编排来保持专注。'
      };
    }

    return {
      moodGuess: '处在执行段',
      moodReason: '白天中段更适合结构清楚、密度稳定、不中断工作的队列。'
    };
  }

  if (hour < 22) {
    if (isWet || isGray || isCold) {
      return {
        moodGuess: '想把外界收小一点',
        moodReason: '傍晚到夜里更适合把环境噪声收起来，让音乐接管气氛。'
      };
    }

    return {
      moodGuess: '想从工作态缓慢切出来',
      moodReason: '这个时间适合从控制感过渡到放松感，节奏放缓一点会更舒服。'
    };
  }

  return {
    moodGuess: '希望尾声干净一点',
    moodReason: '深夜不适合情绪过冲，更适合留白、呼吸感和低刺激收束。'
  };
};

export class BridgeService {
  private readonly mockAdapter = new MockBridgeAdapter();

  private readonly musicAdapter = new LocalMusicBridgeAdapter();

  private readonly llmAdapter = new OpenAiCompatibleLlmAdapter();

  private readonly imageGenerator = new OpenAiImageGenerator();

  private readonly weatherAdapter = new OpenWeatherAdapter();

  private readonly voiceAdapter = new CosyVoiceAdapter();

  private scoreManifest: CachedScoreManifest | undefined;

  private lastKnownTracks: Track[] = [];

  private lastLibraryContext: LibraryContext = this.createMockLibraryContext();

  private lastPlaylists: LibraryPlaylist[] = [];

  private activePlaylistId: string | null = null;

  private libraryCatalog: LibraryCatalogSnapshot | null = null;

  private libraryCatalogPromise: Promise<LibraryCatalogSnapshot | null> | null = null;

  private readonly trackInsightCache = new Map<string, TrackInsight>();

  private lastTasteProfile: MusicTasteProfile | null = null;

  private tasteProfilePromise: Promise<MusicTasteProfile> | null = null;

  async getBootstrap(platform: WindowPlatform): Promise<BootstrapPayload> {
    const tracks = await this.getTrackPool(true);
    const playlists = await this.getLibraryPlaylists();

    return {
      platform,
      tracks,
      bridge: await this.refreshBridge(),
      libraryContext: this.lastLibraryContext,
      playlists,
      activePlaylistId: this.activePlaylistId
    };
  }

  async loadLibraryPlaylist(playlistId: string): Promise<LibraryLoadResult> {
    const tracks = await this.getTrackPool(true, playlistId);

    return {
      tracks,
      libraryContext: this.lastLibraryContext,
      activePlaylistId: this.activePlaylistId
    };
  }

  async getClassicalCoverageReport(): Promise<ClassicalCoverageReport> {
    const catalog = await this.ensureLibraryCatalog();
    const source = catalog ? 'live' : this.lastLibraryContext.source;
    const entries = catalog?.trackEntries ?? this.lastKnownTracks.map((track) => ({
      track,
      count: 1,
      playlistIds: [],
      playlistNames: []
    }));
    const items: ClassicalCoverageReportItem[] = entries
      .map((entry) => ({
        ...entry,
        track: this.enrichTrackWithClassicalScores(entry.track)
      }))
      .filter((entry) => isClassicalLikeTrack(entry.track) || entry.track.classical?.isClassical)
      .map((entry) => {
        const classical = entry.track.classical;
        const coverage =
          classical?.coverage ?? {
            status: 'missing' as const,
            hasPreferredSource: false,
            hasOptionalArrangement: false,
            missingReason: 'no_catalog_match' as const
          };

        return {
          track: entry.track,
          count: entry.count,
          playlistIds: entry.playlistIds,
          playlistNames: entry.playlistNames,
          matchStatus: classical?.matchStatus ?? 'heuristic',
          coverage
        };
      });

    return {
      source,
      generatedAt: catalog?.generatedAt ?? nowIso(),
      totalClassicalTracks: items.length,
      coveredCount: items.filter((item) => item.coverage.status === 'covered').length,
      partialCount: items.filter((item) => item.coverage.status === 'partial').length,
      missingCount: items.filter((item) => item.coverage.status === 'missing').length,
      items
    };
  }

  async analyzeMusicTaste(): Promise<MusicTasteProfile> {
    if (this.lastTasteProfile) {
      return this.lastTasteProfile;
    }

    if (this.tasteProfilePromise) {
      return this.tasteProfilePromise;
    }

    this.tasteProfilePromise = this.buildMusicTasteProfile();

    try {
      return await this.tasteProfilePromise;
    } finally {
      this.tasteProfilePromise = null;
    }
  }

  private async buildMusicTasteProfile(): Promise<MusicTasteProfile> {
    const catalog = await this.ensureLibraryCatalog();

    if (!catalog) {
      this.lastTasteProfile = this.createMockTasteProfile();
      return this.lastTasteProfile;
    }

    const baseProfile = this.buildTasteProfileFromCatalog(catalog);

    if (!this.llmAdapter.isConfigured()) {
      this.lastTasteProfile = baseProfile;
      return baseProfile;
    }

    try {
      const liveProfile = await this.llmAdapter.analyzeMusicTaste(baseProfile);
      this.lastTasteProfile = {
        ...baseProfile,
        archetype: liveProfile.archetype,
        summary: liveProfile.summary,
        signals: liveProfile.signals.length > 0 ? liveProfile.signals : baseProfile.signals,
        model: liveProfile.model
      };

      return this.lastTasteProfile;
    } catch {
      this.lastTasteProfile = baseProfile;
      return baseProfile;
    }
  }

  async getDailyStationBrief(request?: CurationRequest['context']): Promise<DailyStationBrief> {
    const timezone = request?.timezone?.trim() || 'Asia/Shanghai';
    const locale = request?.locale?.trim() || 'zh-CN';
    const localNow = request?.localTimeIso ? new Date(request.localTimeIso) : new Date();
    const regionLabel = request?.regionLabel?.trim() || formatRegionFromTimezone(timezone);
    const hour = localNow.getHours();
    const tasteProfilePromise = this.analyzeMusicTaste().catch(() => this.createMockTasteProfile());
    const weatherPromise = this.weatherAdapter
      .getCurrent({
        regionLabel,
        latitude: request?.latitude,
        longitude: request?.longitude
      })
      .catch(() => null);
    const [tasteProfile, weather] = await Promise.all([tasteProfilePromise, weatherPromise]);
    const mood = inferMoodGuess(hour, weather?.temperatureC ?? null, weather?.summary ?? null);

    return {
      generatedAt: nowIso(),
      timezone,
      regionLabel: weather?.locationLabel || regionLabel,
      localTimeLabel: new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: timezone
      }).format(localNow),
      weekdayLabel: new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        timeZone: timezone
      }).format(localNow),
      partOfDayLabel: formatPartOfDay(hour),
      moodGuess: mood.moodGuess,
      moodReason: mood.moodReason,
      tasteAnchor:
        tasteProfile.topArtists[0]?.label ||
        tasteProfile.topPlaylists[0]?.name ||
        tasteProfile.archetype,
      archetype: tasteProfile.archetype,
      weather
    };
  }

  async generateDesignReference(request: { prompt: string; mode?: 'dark' | 'light'; size?: '1024x1024' | '1536x1024' | '1024x1536'; quality?: 'low' | 'medium' | 'high' }) {
    return this.imageGenerator.generateDesignReference(request);
  }

  async resolveTrackSource(trackId: string): Promise<string | null> {
    const knownTrack = this.findKnownTrack(trackId);

    try {
      const source = await this.musicAdapter.resolveTrackSource(trackId);

      if (source && knownTrack) {
        knownTrack.source = source;
      }

      return source || knownTrack?.source || null;
    } catch {
      return knownTrack?.source || null;
    }
  }

  async getTrackLyrics(trackId: string): Promise<TrackLyrics | null> {
    try {
      return await this.musicAdapter.getTrackLyrics(trackId);
    } catch {
      return null;
    }
  }

  async refreshBridge(): Promise<BridgeSnapshot> {
    const snapshot = this.mockAdapter.getSnapshot();
    const musicProbe = await this.musicAdapter.probe();
    const capabilities = snapshot.capabilities.map((capability) =>
      capability.id === 'brain'
        ? this.decorateBrainCapability(capability)
        : capability.id === 'music'
          ? this.decorateMusicCapability(capability, musicProbe)
          : this.decorateConfiguredCapability(capability)
    );
    const hasCoreConfig = capabilities.some(
      (capability) =>
        capability.id !== 'weather' &&
        (capability.status === 'online' || capability.status === 'configured')
    );

    return {
      ...snapshot,
      server: {
        ...snapshot.server,
        status:
          musicProbe.status === 'online' ? 'online' : hasCoreConfig ? 'configured' : snapshot.server.status,
        updatedAt: nowIso()
      },
      capabilities,
      notes: [
        musicProbe.status === 'online'
          ? musicProbe.message
          : '音乐 bridge 还没就绪，播放器会暂时回退到演示库。',
        this.llmAdapter.isConfigured()
          ? `大模型已接通 ${this.llmAdapter.getProviderLabel()}。`
          : 'LLM 环境变量还没配置，AI 歌单生成会直接停止。',
        ...snapshot.notes.slice(2)
      ]
    };
  }

  async pingCapability(capabilityId: BridgeCapabilityId): Promise<CapabilityProbeResult> {
    if (capabilityId === 'music') {
      return this.musicAdapter.probe();
    }

    if (capabilityId === 'brain') {
      return this.llmAdapter.probe();
    }

    if (capabilityId === 'voice') {
      return this.voiceAdapter.probe();
    }

    const readiness = getProviderReadiness(capabilityId);
    const fallback = this.mockAdapter.probeCapability(capabilityId);

    return {
      ...fallback,
      status: readiness.status,
      message: readiness.message
    };
  }

  async generateTrackInsight(trackId: string): Promise<TrackInsight> {
    const cached = this.trackInsightCache.get(trackId);
    if (cached) {
      return cached;
    }

    const tracks = await this.getTrackPool();
    const track = tracks.find((item) => item.id === trackId) ?? this.findKnownTrack(trackId);
    if (!track) {
      throw new Error(`Track ${trackId} was not found.`);
    }

    if (!this.llmAdapter.isConfigured()) {
      throw new Error('LLM env is required for track notes.');
    }

    const insight = await this.llmAdapter.generateTrackInsight(track);
    this.trackInsightCache.set(trackId, insight);

    return insight;
  }

  async generateNarrationAudio(text: string): Promise<NarrationAudio> {
    return this.voiceAdapter.generateNarrationAudio(text);
  }

  async generatePlaylistTrackInsights(trackIds: string[]): Promise<TrackInsight[]> {
    const uniqueIds = [...new Set(trackIds.map((trackId) => trackId.trim()).filter(Boolean))].slice(0, 24);
    const cached = uniqueIds
      .map((trackId) => this.trackInsightCache.get(trackId))
      .filter((item): item is TrackInsight => Boolean(item));
    const missingIds = uniqueIds.filter((trackId) => !this.trackInsightCache.has(trackId));

    if (missingIds.length === 0) {
      return cached;
    }

    const tracks = await this.getTrackPool();
    const missingTracks = missingIds
      .map((trackId) => tracks.find((item) => item.id === trackId) ?? this.findKnownTrack(trackId))
      .filter((track): track is Track => Boolean(track));

    if (missingTracks.length === 0) {
      return cached;
    }

    if (!this.llmAdapter.isConfigured()) {
      throw new Error('LLM env is required for playlist track notes.');
    }

    const generated = await this.llmAdapter.generateTrackInsights(missingTracks);
    for (const insight of generated) {
      this.trackInsightCache.set(insight.trackId, insight);
    }

    return [...cached, ...generated];
  }

  async handleAgentTurn(request: CurationRequest): Promise<AgentTurnResponse> {
    const prompt = request.input.trim();
    if (!prompt) {
      throw new Error('Agent prompt is empty.');
    }

    const chatHistory = normalizeChatHistory(request.chatHistory);
    let kind =
      classifyAgentTurnLocally(prompt, chatHistory, Boolean(request.context?.mode === 'curation')) ??
      null;
    let reply = '';

    if (!kind && this.llmAdapter.isConfigured()) {
      const decision = await withTimeout(
        this.llmAdapter.classifyAgentTurn(prompt, {
          chatHistory,
          hasActiveCuration: Boolean(request.context?.mode === 'curation')
        }),
        AGENT_CLASSIFICATION_TIMEOUT_MS,
        'agent turn classification'
      ).catch(() => null);
      kind = decision?.kind ?? null;
      reply = decision?.reply ?? '';
    }

    if (!kind) {
      kind = 'conversation';
    }

    if (kind === 'conversation') {
      return {
        kind,
        reply: reply || buildLocalConversationReply(prompt)
      };
    }

    const playlist = await this.generateCuratedPlaylist({
      ...request,
      input: prompt,
      chatHistory
    });

    return {
      kind,
      reply: playlist.reply,
      playlist
    };
  }

  async generateCuratedPlaylist(request: CurationRequest): Promise<CuratedPlaylist> {
    const prompt = request.input.trim();
    if (!prompt) {
      throw new Error('Curation prompt is empty.');
    }

    if (!this.llmAdapter.isConfigured()) {
      throw new Error('LLM env is required for AI playlist generation.');
    }

    const chatHistory = normalizeChatHistory(request.chatHistory);
    const conversationText = buildConversationSearchText(prompt, chatHistory);
    const specificArtistRequest = parseSpecificArtistRequest(prompt, chatHistory);
    const requestKind = request.context?.requestKind ?? 'manual';
    const tasteProfilePromise = this.lastTasteProfile
      ? Promise.resolve(this.lastTasteProfile)
      : withTimeout(
          this.analyzeMusicTaste(),
          requestKind === 'daily' ? DAILY_CURATION_CONTEXT_TIMEOUT_MS : MANUAL_CURATION_TASTE_TIMEOUT_MS,
          'music taste analysis'
        ).catch(() => this.createMockTasteProfile());
    const dailyBriefPromise =
      requestKind === 'daily'
        ? withTimeout(this.getDailyStationBrief(request.context), DAILY_CURATION_CONTEXT_TIMEOUT_MS, 'daily brief').catch(
            () => null
          )
        : Promise.resolve(null);
    const [tasteProfile, dailyBrief] = await Promise.all([tasteProfilePromise, dailyBriefPromise]);
    let discovery: { queries: string[]; tracks: Track[] };
    let candidateTracks: Track[];

    if (specificArtistRequest) {
      discovery = { queries: [specificArtistRequest.artist], tracks: [] };
      candidateTracks = await this.getArtistFocusedTrackPool(specificArtistRequest, conversationText);
    } else {
      const [primaryTracks, discoveredTracks] = await Promise.all([
        this.getCurationTrackPool(conversationText),
        this.getDiscoveryTracks(conversationText, tasteProfile)
      ]);
      discovery = discoveredTracks;
      candidateTracks = this.mergeCandidateTracks(primaryTracks, discovery.tracks);
    }

    const fallbackTracks =
      candidateTracks.length > 0 || specificArtistRequest ? [] : await this.getRealTrackFallbackPool().catch(() => []);
    const knownCandidateTracks = specificArtistRequest
      ? this.lastKnownTracks.filter((track) => artistMatchesRequest(track, specificArtistRequest.artist))
      : this.lastKnownTracks;
    candidateTracks = prepareCurationCandidateTracks(candidateTracks, knownCandidateTracks, fallbackTracks, {
      maxTracks: specificArtistRequest ? Math.max(specificArtistRequest.requestedCount, 40) : 96,
      maxPerArtist: specificArtistRequest ? Number.POSITIVE_INFINITY : 2,
      maxPerAlbum: specificArtistRequest ? Number.POSITIVE_INFINITY : 2
    }).map((track) => this.enrichTrackWithClassicalScores(track));

    if (!specificArtistRequest && isClassicalRequest(conversationText)) {
      candidateTracks = this.removeScorelessClassicalTracks(candidateTracks);
    }

    try {
      const diversifiedCandidateTracks = specificArtistRequest
        ? candidateTracks
        : diversifyCurationCandidates(candidateTracks);
      const llmCandidateTracks = specificArtistRequest
        ? candidateTracks.slice(
            0,
            Math.max(
              specificArtistRequest.requestedCount,
              Math.min(candidateTracks.length, specificArtistRequest.requestedCount + 20)
            )
          )
        : diversifiedCandidateTracks.slice(0, MANUAL_CURATION_LLM_CANDIDATE_LIMIT);
      const result = await this.llmAdapter.generateCuratedPlaylist(prompt, llmCandidateTracks, {
        tasteProfile,
        discoveryQueries: discovery.queries,
        dailyBrief,
        requestKind,
        chatHistory,
        specificArtistRequest
      });
      const hydrated = await this.hydrateCuratedPlaylist(result, specificArtistRequest, {
        requireCompleteClassicalScores: isClassicalRequest(conversationText)
      });
      const reply = shouldUseSeparateChatReply()
        ? await this.llmAdapter
            .generateCurationChatReply(prompt, hydrated, {
              chatHistory,
              tasteProfile,
              dailyBrief
            })
            .catch(() => hydrated.reply)
        : hydrated.reply;

      return {
        ...hydrated,
        reply
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      throw new Error(`LLM curation failed: ${message}`);
    }
  }

  private decorateBrainCapability(capability: BridgeCapability): BridgeCapability {
    const status = this.llmAdapter.getStatus();

    return {
      ...capability,
      provider: `${this.llmAdapter.getProviderLabel()} / ${this.llmAdapter.getModelName()}`,
      summary: this.llmAdapter.isConfigured()
        ? '大模型策展已启用。'
        : '等待本地 env 接通大模型。',
      status,
      latencyMs: status === 'online' ? 64 : capability.latencyMs
    };
  }

  private decorateConfiguredCapability(capability: BridgeCapability): BridgeCapability {
    const readiness = getProviderReadiness(capability.id as Exclude<BridgeCapabilityId, 'brain'>);

    return {
      ...capability,
      provider: readiness.provider,
      summary: readiness.summary,
      status: readiness.status,
      latencyMs: readiness.status === 'configured' ? 12 : capability.latencyMs
    };
  }

  private decorateMusicCapability(capability: BridgeCapability, probe: CapabilityProbeResult): BridgeCapability {
    const readiness = getProviderReadiness('music');

    return {
      ...capability,
      provider: readiness.provider,
      summary: probe.status === 'online' ? '网易云 bridge 正在为播放器供歌。' : readiness.summary,
      status: probe.status === 'online' ? 'online' : readiness.status,
      latencyMs: probe.latencyMs || (readiness.status === 'configured' ? 12 : capability.latencyMs),
      lastCheckedAt: probe.checkedAt
    };
  }

  private getScoreManifest() {
    try {
      const stat = fs.statSync(SCORE_MANIFEST_PATH);
      if (this.scoreManifest?.mtimeMs === stat.mtimeMs) {
        return this.scoreManifest.manifest;
      }

      const parsed = JSON.parse(fs.readFileSync(SCORE_MANIFEST_PATH, 'utf8')) as ScoreManifest;
      this.scoreManifest = {
        manifest: parsed && Array.isArray(parsed.entries) ? parsed : null,
        mtimeMs: stat.mtimeMs
      };
    } catch {
      this.scoreManifest = {
        manifest: null,
        mtimeMs: 0
      };
    }

    return this.scoreManifest.manifest;
  }

  private getManifestScoresForWork(workId: string) {
    const manifest = this.getScoreManifest();
    return manifest?.entries?.find((entry) => entry.workId === workId)?.scores ?? [];
  }

  private enrichScoreWithCachedPdf(score: ClassicalScoreSource, manifestScore: ScoreManifestScore | undefined) {
    if (
      manifestScore?.status !== 'resolved' ||
      !manifestScore.localUrl ||
      !manifestScore.cachePath ||
      manifestScore.instrument !== score.instrument ||
      manifestScore.role !== score.role ||
      manifestScore.priority !== score.priority
    ) {
      return score;
    }

    const publicUrl = this.musicAdapter.getPublicScoreUrl(manifestScore.localUrl);
    if (!publicUrl || score.pages.includes(publicUrl)) {
      return score;
    }

    return {
      ...score,
      pages: [publicUrl, ...score.pages]
    };
  }

  private evaluateRuntimeCoverage(scores: ClassicalScoreSource[]): ClassicalScoreCoverage {
    const hasPreferredSource = scores.some(
      (score) => score.priority === 'preferred' && ['original', 'authoritative_full_score'].includes(score.role)
    );
    const hasReadablePreferredSource = scores.some(
      (score) =>
        score.priority === 'preferred' &&
        ['original', 'authoritative_full_score'].includes(score.role) &&
        score.pages.some((page) => /\.(?:pdf|png|jpe?g|webp|svg)(?:[?#].*)?$/i.test(page.trim()))
    );
    const hasOptionalArrangement = scores.some(
      (score) => score.priority === 'optional' && score.role === 'arrangement'
    );

    if (hasPreferredSource) {
      return {
        status: 'covered',
        hasPreferredSource,
        hasOptionalArrangement,
        missingReason: hasReadablePreferredSource ? undefined : 'needs_review'
      };
    }

    if (scores.length > 0) {
      return {
        status: 'partial',
        hasPreferredSource,
        hasOptionalArrangement,
        missingReason: 'needs_review'
      };
    }

    return {
      status: 'missing',
      hasPreferredSource,
      hasOptionalArrangement,
      missingReason: 'no_legal_source'
    };
  }

  private enrichTrackWithClassicalScores(track: Track) {
    const enriched = enrichTrackWithClassicalMetadata(track);
    const workId = enriched.classical?.workId;
    if (!workId || !enriched.classical) {
      return enriched;
    }

    const manifestScores = this.getManifestScoresForWork(workId);
    if (manifestScores.length === 0) {
      return enriched;
    }

    const scores = enriched.classical.scores.map((score) => {
      const manifestScore = manifestScores.find(
        (item) =>
          item.title === score.title &&
          item.instrument === score.instrument &&
          item.role === score.role &&
          item.priority === score.priority
      );

      return this.enrichScoreWithCachedPdf(score, manifestScore);
    });

    return {
      ...enriched,
      classical: {
        ...enriched.classical,
        scores,
        coverage: this.evaluateRuntimeCoverage(scores),
        isScoreReady: scores.some(
          (score) =>
            score.priority === 'preferred' &&
            ['original', 'authoritative_full_score'].includes(score.role) &&
            score.pages.length > 0
        )
      }
    };
  }

  private enrichClassicalTracks(tracks: Track[]) {
    return tracks.map((track) => this.enrichTrackWithClassicalScores(track));
  }

  private removeScorelessClassicalTracks(tracks: Track[]) {
    return tracks
      .map((track) => this.enrichTrackWithClassicalScores(track))
      .filter((track) => !isClassicalLikeTrack(track) || track.classical?.coverage.hasPreferredSource);
  }

  private async getTrackPool(forceRefresh = false, playlistId?: string): Promise<Track[]> {
    if (!forceRefresh && this.lastKnownTracks.length > 0) {
      return this.lastKnownTracks;
    }

    const liveLibrary = await this.loadLiveLibrary(playlistId);

    if (liveLibrary?.tracks.length) {
      this.lastKnownTracks = this.enrichClassicalTracks(liveLibrary.tracks);
      this.activePlaylistId = liveLibrary.playlistId;
      this.lastLibraryContext = {
        source: 'live',
        title: liveLibrary.playlistName,
        subtitle: `${liveLibrary.accountLabel} / 网易云歌库`,
        note: `当前播放来自《${liveLibrary.playlistName}》。`
      };
      return this.lastKnownTracks;
    }

    if (playlistId) {
      throw new Error(`Playlist ${playlistId} could not be loaded from the live music bridge.`);
    }

    this.lastKnownTracks = this.enrichClassicalTracks(mockTracks);
    this.lastLibraryContext = this.createMockLibraryContext();
    this.activePlaylistId = null;

    return this.lastKnownTracks;
  }

  private async loadLiveLibrary(playlistId?: string): Promise<MusicBootstrapResult | null> {
    try {
      const playlists = await this.getLibraryPlaylists(true);
      const playlistCandidates = playlistId
        ? [playlistId]
        : shuffleLibraryPlaylists(playlists).map((item) => item.id);

      for (const candidateId of playlistCandidates.slice(0, 10)) {
        try {
          const result = await this.musicAdapter.loadPlaylist(candidateId);
          if (result?.tracks.length) {
            return result;
          }
        } catch {
          if (playlistId) {
            return null;
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private async getLibraryPlaylists(forceRefresh = false): Promise<LibraryPlaylist[]> {
    if (!forceRefresh && this.lastPlaylists.length > 0) {
      return this.lastPlaylists;
    }

    try {
      const playlists = await this.musicAdapter.listPlaylists();
      this.lastPlaylists = playlists.items;
      return this.lastPlaylists;
    } catch {
      this.lastPlaylists = [];
      return this.lastPlaylists;
    }
  }

  private async ensureLibraryCatalog(forceRefresh = false): Promise<LibraryCatalogSnapshot | null> {
    if (!forceRefresh && this.libraryCatalog) {
      return this.libraryCatalog;
    }

    if (!forceRefresh && this.libraryCatalogPromise) {
      return this.libraryCatalogPromise;
    }

    this.libraryCatalogPromise = this.buildLibraryCatalog();
    const result = await this.libraryCatalogPromise;
    this.libraryCatalogPromise = null;

    if (result) {
      this.libraryCatalog = result;
    }

    return result;
  }

  private async buildLibraryCatalog(): Promise<LibraryCatalogSnapshot | null> {
    const playlists = await this.getLibraryPlaylists(true);

    if (playlists.length === 0) {
      return null;
    }

    let accountLabel = 'NetEase';
    let totalTrackEntries = 0;
    const trackEntryMap = new Map<string, LibraryTrackEntry>();

    for (const playlistGroup of chunk(playlists, 4)) {
      const results = await Promise.all(
        playlistGroup.map(async (playlist) => {
          try {
            return await this.musicAdapter.loadPlaylistCatalog(playlist.id);
          } catch {
            return null;
          }
        })
      );

      for (const result of results) {
        if (!result) {
          continue;
        }

        accountLabel = result.accountLabel || accountLabel;

        for (const track of result.tracks) {
          totalTrackEntries += 1;
          const existing = trackEntryMap.get(track.id);

          if (existing) {
            existing.count += 1;
            if (!existing.playlistIds.includes(result.playlistId)) {
              existing.playlistIds.push(result.playlistId);
            }
            if (!existing.playlistNames.includes(result.playlistName)) {
              existing.playlistNames.push(result.playlistName);
            }
            continue;
          }

          trackEntryMap.set(track.id, {
            track: this.enrichTrackWithClassicalScores(track),
            count: 1,
            playlistIds: [result.playlistId],
            playlistNames: [result.playlistName]
          });
        }
      }
    }

    const trackEntries = [...trackEntryMap.values()].sort(
      (left, right) => right.count - left.count || left.track.title.localeCompare(right.track.title)
    );

    return {
      accountLabel,
      playlists,
      totalTrackEntries,
      generatedAt: nowIso(),
      trackEntries,
      trackEntryMap
    };
  }

  private buildTasteProfileFromCatalog(catalog: LibraryCatalogSnapshot): MusicTasteProfile {
    const artistCounts = new Map<string, number>();
    const albumCounts = new Map<string, number>();
    const yearCounts = new Map<string, number>();

    for (const entry of catalog.trackEntries) {
      const weight = entry.count;
      const artists = entry.track.artist.split('/').map((item) => item.trim()).filter(Boolean);

      for (const artist of artists) {
        sumFacet(artistCounts, artist, weight);
      }

      sumFacet(albumCounts, entry.track.album, weight);

      if (entry.track.year.trim()) {
        sumFacet(yearCounts, entry.track.year.trim(), weight);
      }
    }

    const topArtists = toFacetList(artistCounts, 7);
    const topAlbums = toFacetList(albumCounts, 7);
    const topYears = toFacetList(yearCounts, 6);
    const topPlaylists = [...catalog.playlists]
      .sort((left, right) => right.trackCount - left.trackCount || left.name.localeCompare(right.name))
      .slice(0, 6);

    const profile: MusicTasteProfile = {
      source: 'live',
      model: 'heuristic-profile',
      generatedAt: catalog.generatedAt,
      archetype: '策展型听众',
      summary: `${catalog.accountLabel} 的歌单按场景、年代和情绪长期沉淀，跨度大，但有清楚的回访路线。`,
      signals: buildFallbackSignals({
        source: 'live',
        model: 'heuristic-profile',
        generatedAt: catalog.generatedAt,
        archetype: '策展型听众',
        summary: '',
        signals: [],
        stats: {
          playlistCount: catalog.playlists.length,
          totalTrackEntries: catalog.totalTrackEntries,
          uniqueTrackCount: catalog.trackEntries.length
        },
        topArtists,
        topAlbums,
        topYears,
        topPlaylists
      }),
      stats: {
        playlistCount: catalog.playlists.length,
        totalTrackEntries: catalog.totalTrackEntries,
        uniqueTrackCount: catalog.trackEntries.length
      },
      topArtists,
      topAlbums,
      topYears,
      topPlaylists
    };

    return profile;
  }

  private async getCurationTrackPool(
    prompt: string,
    options: { verifyPlayable?: boolean } = {}
  ): Promise<Track[]> {
    if (options.verifyPlayable === false && this.lastKnownTracks.length > 0) {
      const tokens = tokenize(prompt);
      const scored = this.lastKnownTracks.map((track, index) => {
        const haystack = [track.title, track.artist, track.album, track.year, ...track.tags].join(' ').toLowerCase();
        let score = Math.max(0, 80 - index) * 0.05;

        for (const token of tokens) {
          if (!token) {
            continue;
          }

          if (haystack.includes(token)) {
            score += 12;
          }

          if (track.tags.some((tag) => tag.toLowerCase().includes(token))) {
            score += 8;
          }

          if (track.artist.toLowerCase().includes(token)) {
            score += 10;
          }
        }

        return { track, score };
      });

      return dedupeTracks(
        scored
          .sort((left, right) => right.score - left.score || left.track.title.localeCompare(right.track.title))
          .map((entry) => entry.track),
        {
          maxTracks: CURATED_PLAYLIST_MAX_TRACKS,
          maxPerArtist: Number.POSITIVE_INFINITY,
          maxPerAlbum: Number.POSITIVE_INFINITY
        }
      );
    }

    const catalog = await this.ensureLibraryCatalog();

    if (!catalog) {
      return [];
    }

    const tokens = tokenize(prompt);
    const scored = catalog.trackEntries.map((entry, index) => {
      const haystack = [
        entry.track.title,
        entry.track.artist,
        entry.track.album,
        entry.track.year,
        ...entry.track.tags
      ]
        .join(' ')
        .toLowerCase();

      let score = entry.count * 3 + Math.max(0, 80 - index) * 0.05;

      for (const token of tokens) {
        if (!token) {
          continue;
        }

        if (haystack.includes(token)) {
          score += 12;
        }

        if (entry.track.tags.some((tag) => tag.toLowerCase().includes(token))) {
          score += 8;
        }

        if (entry.track.artist.toLowerCase().includes(token)) {
          score += 10;
        }
      }

      return {
        track: entry.track,
        score
      };
    });

    const sorted = scored
      .sort((left, right) => right.score - left.score || left.track.title.localeCompare(right.track.title))
      .map((entry) => entry.track);
    const uniqueTracks = dedupeTracks(sorted, {
      maxTracks: 72,
      maxPerArtist: 2,
      maxPerAlbum: 2
    });
    const fallbackTracks = dedupeTracks(
      catalog.trackEntries.slice(0, 72).map((entry) => entry.track),
      {
        maxTracks: 72,
        maxPerArtist: 2,
        maxPerAlbum: 2
      }
    );
    const candidateTracks = uniqueTracks.length > 0 ? uniqueTracks : fallbackTracks;

    if (options.verifyPlayable === false) {
      return candidateTracks.slice(0, CURATED_PLAYLIST_MAX_TRACKS);
    }

    return this.musicAdapter.prioritizePlayableTracks(candidateTracks, CURATED_PLAYLIST_MAX_TRACKS, 180);
  }

  private async getArtistFocusedTrackPool(
    request: SpecificArtistRequest,
    conversationText: string
  ): Promise<Track[]> {
    const scanLimit = Math.max(40, request.requestedCount * 3);
    const catalog = await this.ensureLibraryCatalog();
    const catalogMatches =
      catalog?.trackEntries
        .filter((entry) => artistMatchesRequest(entry.track, request.artist))
        .sort((left, right) => right.count - left.count || left.track.title.localeCompare(right.track.title))
        .map((entry) => entry.track) ?? [];
    const queries = [
      request.artist,
      `${request.artist} 热门`,
      `${request.artist} ${conversationText}`,
      `${request.artist} 专辑`
    ]
      .map((query) => query.trim().slice(0, 80))
      .filter((query, index, items) => query.length > 0 && items.indexOf(query) === index)
      .slice(0, 4);
    const searchedGroups = await Promise.all(
      queries.map(async (query) => {
        try {
          return await this.musicAdapter.searchTracks(query, 20);
        } catch {
          return [];
        }
      })
    );
    const searchedMatches = searchedGroups.flat().filter((track) => artistMatchesRequest(track, request.artist));
    const artistTracks = dedupeTracks([...catalogMatches, ...searchedMatches], {
      maxTracks: scanLimit,
      maxPerArtist: Number.POSITIVE_INFINITY,
      maxPerAlbum: Number.POSITIVE_INFINITY
    });

    return this.musicAdapter.prioritizePlayableTracks(
      artistTracks,
      Math.max(request.requestedCount, Math.min(scanLimit, request.requestedCount + 12)),
      scanLimit
    );
  }

  private buildFallbackDiscoveryQueries(prompt: string, tasteProfile: MusicTasteProfile | null) {
    const queries = new Set<string>();
    queries.add(prompt);

    if (tasteProfile?.topArtists[0]?.label) {
      queries.add(`${tasteProfile.topArtists[0].label} ${prompt}`);
    }

    if (tasteProfile?.topYears[0]?.label) {
      queries.add(`${tasteProfile.topYears[0].label} ${prompt}`);
    }

    if (tasteProfile?.topArtists[1]?.label) {
      queries.add(`${tasteProfile.topArtists[1].label} 相似`);
    }

    if (tasteProfile?.topAlbums[0]?.label) {
      queries.add(`${tasteProfile.topAlbums[0].label} 相似风格`);
    }

    if (tasteProfile?.topYears[0]?.label) {
      queries.add(`${tasteProfile.topYears[0].label} 独立流行 氛围`);
    }

    return [...queries]
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 6);
  }

  private async getDiscoveryTracks(prompt: string, tasteProfile: MusicTasteProfile | null) {
    let queries = this.buildFallbackDiscoveryQueries(prompt, tasteProfile);

    if (this.llmAdapter.isConfigured()) {
      try {
        const plan = await this.llmAdapter.generateDiscoveryPlan(prompt, {
          tasteProfile
        });

        if (plan.queries.length > 0) {
          queries = plan.queries;
        }
      } catch {
        // Fall back to heuristic queries.
      }
    }

    if (queries.length === 0) {
      return {
        queries: [],
        tracks: []
      };
    }

    const catalog = await this.ensureLibraryCatalog();
    const libraryIds = new Set(catalog?.trackEntryMap.keys() ?? []);
    const groups = await Promise.all(
      queries.map(async (query) => {
        try {
          return await this.musicAdapter.searchTracks(query, 12);
        } catch {
          return [];
        }
      })
    );

    const deduped: Track[] = [];
    const seen = new Set<string>();

    for (const group of groups) {
      for (const track of group) {
        if (seen.has(track.id) || libraryIds.has(track.id)) {
          continue;
        }

        seen.add(track.id);
        deduped.push(track);
      }
    }

    const discoveryCandidates = dedupeTracks(deduped, {
      maxTracks: 36,
      maxPerArtist: 1,
      maxPerAlbum: 1
    });
    const checked = await Promise.all(
      discoveryCandidates.map(async (track) => ({
        track,
        ok: await this.musicAdapter.checkTrackAvailability(track.id).catch(() => false)
      }))
    );

    return {
      queries,
      tracks: dedupeTracks(
        checked
          .filter((item) => item.ok)
          .map((item) => item.track),
        {
          maxTracks: 24,
          maxPerArtist: 1,
          maxPerAlbum: 1
        }
      )
    };
  }

  private mergeCandidateTracks(primary: Track[], discovery: Track[]) {
    const merged: Track[] = [];
    const maxLength = Math.max(primary.length, discovery.length);

    for (let index = 0; index < maxLength; index += 1) {
      if (discovery[index]) {
        merged.push(discovery[index]);
      }

      if (primary[index]) {
        merged.push(primary[index]);
      }
    }

    return dedupeTracks(merged, {
      maxTracks: 96,
      maxPerArtist: 2,
      maxPerAlbum: 2
    });
  }

  private async hydrateCuratedPlaylist(
    playlist: CuratedPlaylist,
    specificArtistRequest: SpecificArtistRequest | null = null,
    options?: { requireCompleteClassicalScores?: boolean }
  ): Promise<CuratedPlaylist> {
    if (specificArtistRequest) {
      return this.hydrateSpecificArtistPlaylist(playlist, specificArtistRequest);
    }

    const normalizedTracks = dedupeTracks(playlist.tracks, {
      maxTracks: CURATED_PLAYLIST_MAX_TRACKS,
      maxPerArtist: playlist.requestKind === 'manual' ? Number.POSITIVE_INFINITY : 2,
      maxPerAlbum: playlist.requestKind === 'manual' ? Number.POSITIVE_INFINITY : 2
    });
    const finalizeManualTracks = (tracks: Track[]) =>
      options?.requireCompleteClassicalScores
        ? this.removeScorelessClassicalTracks(tracks)
        : this.enrichClassicalTracks(tracks);
    const needsHydration = normalizedTracks.some((track) => !track.source);

    if (!needsHydration) {
      return {
        ...playlist,
        tracks:
          playlist.requestKind === 'manual'
            ? finalizeManualTracks(normalizedTracks)
            : await this.fillCuratedPlaylistFloor(normalizedTracks)
      };
    }

    const hydratedTracks = dedupeTracks(await this.musicAdapter.hydrateTracks(normalizedTracks), {
      maxTracks: CURATED_PLAYLIST_MAX_TRACKS,
      maxPerArtist: 2,
      maxPerAlbum: 2
    });
    if (hydratedTracks.length > 0) {
      return {
        ...playlist,
        tracks:
          playlist.requestKind === 'manual'
            ? finalizeManualTracks(hydratedTracks)
            : await this.fillCuratedPlaylistFloor(hydratedTracks)
      };
    }

    const fallbackPool = await this.getRealTrackFallbackPool();
    const fallbackTracks = dedupeTracks(
      fallbackPool.filter(
        (track) => !hydratedTracks.some((item) => getTrackSignature(item) === getTrackSignature(track))
      ),
      {
        maxTracks: Math.max(0, CURATED_PLAYLIST_MIN_TRACKS - hydratedTracks.length),
        maxPerArtist: 2,
        maxPerAlbum: 2
      }
    );

    const mergedTracks = dedupeTracks([...hydratedTracks, ...fallbackTracks], {
      maxTracks: CURATED_PLAYLIST_MAX_TRACKS,
      maxPerArtist: 2,
      maxPerAlbum: 2
    });

    return {
      ...playlist,
      note:
        hydratedTracks.length < normalizedTracks.length
          ? `${playlist.note} 已自动跳过部分当前不可播的歌曲。`
          : playlist.note,
      tracks:
        playlist.requestKind === 'manual'
          ? finalizeManualTracks(mergedTracks)
          : await this.fillCuratedPlaylistFloor(mergedTracks)
    };
  }

  private async fillCuratedPlaylistFloor(tracks: Track[]): Promise<Track[]> {
    const cappedTracks = dedupeTracks(tracks, {
      maxTracks: CURATED_PLAYLIST_MAX_TRACKS,
      maxPerArtist: 2,
      maxPerAlbum: 2
    });

    if (cappedTracks.length >= CURATED_PLAYLIST_MIN_TRACKS) {
      return this.enrichClassicalTracks(cappedTracks);
    }

    const fallbackPool = await this.getRealTrackFallbackPool();
    const merged = [...cappedTracks];
    const seenIds = new Set(merged.map((track) => track.id));
    const seenSignatures = new Set(merged.map((track) => getTrackSignature(track)));

    for (const track of fallbackPool) {
      const signature = getTrackSignature(track);
      if (seenIds.has(track.id) || seenSignatures.has(signature)) {
        continue;
      }

      seenIds.add(track.id);
      seenSignatures.add(signature);
      merged.push(track);

      if (merged.length >= CURATED_PLAYLIST_MIN_TRACKS || merged.length >= CURATED_PLAYLIST_MAX_TRACKS) {
        break;
      }
    }

    return this.enrichClassicalTracks(merged.slice(0, CURATED_PLAYLIST_MAX_TRACKS));
  }

  private async hydrateSpecificArtistPlaylist(
    playlist: CuratedPlaylist,
    request: SpecificArtistRequest
  ): Promise<CuratedPlaylist> {
    const normalizedTracks = dedupeTracks(
      playlist.tracks.filter((track) => artistMatchesRequest(track, request.artist)),
      {
        maxTracks: request.requestedCount,
        maxPerArtist: Number.POSITIVE_INFINITY,
        maxPerAlbum: Number.POSITIVE_INFINITY
      }
    );
    const hydratedTracks = dedupeTracks(await this.musicAdapter.hydrateTracks(normalizedTracks), {
      maxTracks: request.requestedCount,
      maxPerArtist: Number.POSITIVE_INFINITY,
      maxPerAlbum: Number.POSITIVE_INFINITY
    });
    const needsMoreTracks = hydratedTracks.length < request.requestedCount;

    if (!needsMoreTracks) {
      return {
        ...playlist,
        tracks: this.enrichClassicalTracks(hydratedTracks)
      };
    }

    const fallbackPool = await this.getArtistFocusedTrackPool(request, request.artist);
    const hydratedSignatures = new Set(hydratedTracks.map((track) => getTrackSignature(track)));
    const fallbackTracks = dedupeTracks(
      fallbackPool.filter((track) => !hydratedSignatures.has(getTrackSignature(track))),
      {
        maxTracks: request.requestedCount - hydratedTracks.length,
        maxPerArtist: Number.POSITIVE_INFINITY,
        maxPerAlbum: Number.POSITIVE_INFINITY
      }
    );
    const hydratedFallbackTracks = dedupeTracks(await this.musicAdapter.hydrateTracks(fallbackTracks), {
      maxTracks: request.requestedCount - hydratedTracks.length,
      maxPerArtist: Number.POSITIVE_INFINITY,
      maxPerAlbum: Number.POSITIVE_INFINITY
    });
    const mergedTracks = dedupeTracks([...hydratedTracks, ...hydratedFallbackTracks], {
      maxTracks: request.requestedCount,
      maxPerArtist: Number.POSITIVE_INFINITY,
      maxPerAlbum: Number.POSITIVE_INFINITY
    });
    const finalTracks = mergedTracks;

    return {
      ...playlist,
      note:
        finalTracks.length < request.requestedCount
          ? `只找到 ${finalTracks.length} 首 ${request.artist} 可播歌曲。`
          : playlist.note,
      tracks: this.enrichClassicalTracks(finalTracks)
    };
  }

  private findKnownTrack(trackId: string) {
    return (
      this.lastKnownTracks.find((track) => track.id === trackId) ??
      this.libraryCatalog?.trackEntryMap.get(trackId)?.track ??
      mockTracks.find((track) => track.id === trackId) ??
      null
    );
  }

  private async getRealTrackFallbackPool() {
    const catalog = await this.ensureLibraryCatalog();
    if (catalog?.trackEntries.length) {
      const catalogTracks = dedupeTracks(
        catalog.trackEntries.map((entry) => entry.track),
        {
          maxTracks: 96,
          maxPerArtist: 2,
          maxPerAlbum: 1
        }
      );

      const playableCatalogTracks = await this.musicAdapter.prioritizePlayableTracks(
        catalogTracks,
        CURATED_PLAYLIST_MAX_TRACKS,
        180
      );
      const hydratedCatalogTracks = await this.musicAdapter.hydrateTracks(playableCatalogTracks);

      return hydratedCatalogTracks.length > 0 ? hydratedCatalogTracks : playableCatalogTracks;
    }

    const liveTracks = await this.getTrackPool(true);
    if (this.lastLibraryContext.source === 'live' && liveTracks.length > 0) {
      const hydratedLiveTracks = await this.musicAdapter.hydrateTracks(liveTracks);
      return hydratedLiveTracks.length > 0 ? hydratedLiveTracks : liveTracks;
    }

    return [];
  }

  private createMockLibraryContext(): LibraryContext {
    return {
      source: 'mock',
      title: '演示歌库',
      subtitle: 'Mock queue',
      note: '当前还是演示歌库。'
    };
  }

  private createMockTasteProfile(): MusicTasteProfile {
    return {
      source: 'mock',
      model: 'mock-profile',
      generatedAt: nowIso(),
      archetype: '演示听众',
      summary: '真实网易云资料还没接通，所以现在还不能给你可靠的听歌画像。',
      signals: [
        '先连上你的真实歌单，再谈画像才有意义。',
        '当前页面只是结构和交互占位。',
        '一旦 bridge 在线，就会切到你的真实收藏。'
      ],
      stats: {
        playlistCount: 0,
        totalTrackEntries: 0,
        uniqueTrackCount: 0
      },
      topArtists: [],
      topAlbums: [],
      topYears: [],
      topPlaylists: []
    };
  }
}
