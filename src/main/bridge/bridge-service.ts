import { mockTracks } from '../../shared/mock/tracks';
import type {
  BootstrapPayload,
  BridgeCapability,
  BridgeCapabilityId,
  BridgeSnapshot,
  CapabilityProbeResult,
  CurationRequest,
  DailyStationBrief,
  CuratedPlaylist,
  LibraryContext,
  LibraryLoadResult,
  LibraryPlaylist,
  MusicTasteProfile,
  TasteFacet,
  Track,
  TrackInsight,
  TrackLyrics,
  WindowPlatform
} from '../../shared/contracts/bridge';
import { LocalMusicBridgeAdapter, type MusicBootstrapResult } from './adapters/local-music-bridge';
import { MockBridgeAdapter } from './adapters/mock-adapter';
import { OpenAiCompatibleLlmAdapter } from './adapters/openai-compatible-llm';
import { OpenWeatherAdapter } from './adapters/open-weather-adapter';
import { getProviderReadiness } from './provider-readiness';

interface LibraryTrackEntry {
  track: Track;
  count: number;
  playlistIds: string[];
}

interface LibraryCatalogSnapshot {
  accountLabel: string;
  playlists: LibraryPlaylist[];
  totalTrackEntries: number;
  generatedAt: string;
  trackEntries: LibraryTrackEntry[];
  trackEntryMap: Map<string, LibraryTrackEntry>;
}

const nowIso = () => new Date().toISOString();

const chunk = <T>(items: T[], size: number) => {
  const groups: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }

  return groups;
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
    `你不是单点收藏，${artistLead} 只是入口，不是全部。`,
    `你的专辑取向很明显，像《${albumLead}》这种整张作品会反复出现。`,
    `你的年代分布会回到 ${yearLead} 附近，但不会只停在一个时期。`
  ];
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
        moodGuess: '想稳住而不是兴奋',
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
      moodReason: '这个时间更适合从控制感过渡到放松感，而不是突然塌下去。'
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

  private readonly weatherAdapter = new OpenWeatherAdapter();

  private lastKnownTracks: Track[] = [];

  private lastLibraryContext: LibraryContext = this.createMockLibraryContext();

  private lastPlaylists: LibraryPlaylist[] = [];

  private activePlaylistId: string | null = null;

  private libraryCatalog: LibraryCatalogSnapshot | null = null;

  private libraryCatalogPromise: Promise<LibraryCatalogSnapshot | null> | null = null;

  private lastTasteProfile: MusicTasteProfile | null = null;

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

  async analyzeMusicTaste(): Promise<MusicTasteProfile> {
    const catalog = await this.ensureLibraryCatalog();

    if (!catalog) {
      return this.createMockTasteProfile();
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
    const tasteProfile = await this.analyzeMusicTaste().catch(() => this.createMockTasteProfile());
    const weather = await this.weatherAdapter
      .getCurrent({
        regionLabel,
        latitude: request?.latitude,
        longitude: request?.longitude
      })
      .catch(() => null);
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
    const hasRealConfig = capabilities.some(
      (capability) => capability.status === 'online' || capability.status === 'configured'
    );

    return {
      ...snapshot,
      server: {
        ...snapshot.server,
        status:
          musicProbe.status === 'online' ? 'online' : hasRealConfig ? 'configured' : snapshot.server.status,
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

    const readiness = getProviderReadiness(capabilityId);
    const fallback = this.mockAdapter.probeCapability(capabilityId);

    return {
      ...fallback,
      status: readiness.status,
      message: readiness.message
    };
  }

  async generateTrackInsight(trackId: string): Promise<TrackInsight> {
    const tracks = await this.getTrackPool();
    const track = tracks.find((item) => item.id === trackId) ?? this.findKnownTrack(trackId);
    if (!track) {
      throw new Error(`Track ${trackId} was not found.`);
    }

    if (!this.llmAdapter.isConfigured()) {
      throw new Error('LLM env is required for track notes.');
    }

    return this.llmAdapter.generateTrackInsight(track);
  }

  async generateCuratedPlaylist(request: CurationRequest): Promise<CuratedPlaylist> {
    const prompt = request.input.trim();
    if (!prompt) {
      throw new Error('Curation prompt is empty.');
    }

    const tasteProfile = await this.analyzeMusicTaste();
    const dailyBrief = await this.getDailyStationBrief(request.context).catch(() => null);
    const libraryTracks = await this.getCurationTrackPool(prompt);
    const discovery = await this.getDiscoveryTracks(prompt, tasteProfile);
    const candidateTracks = this.mergeCandidateTracks(libraryTracks, discovery.tracks);
    const requestKind = request.context?.requestKind ?? 'manual';

    if (!this.llmAdapter.isConfigured()) {
      throw new Error('LLM env is required for AI playlist generation.');
    }

    try {
      const result = await this.llmAdapter.generateCuratedPlaylist(prompt, candidateTracks, {
        tasteProfile,
        discoveryQueries: discovery.queries,
        dailyBrief,
        requestKind
      });

      return this.hydrateCuratedPlaylist(result);
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

  private async getTrackPool(forceRefresh = false, playlistId?: string): Promise<Track[]> {
    if (!forceRefresh && this.lastKnownTracks.length > 0) {
      return this.lastKnownTracks;
    }

    const liveLibrary = await this.loadLiveLibrary(playlistId);

    if (liveLibrary?.tracks.length) {
      this.lastKnownTracks = liveLibrary.tracks;
      this.activePlaylistId = liveLibrary.playlistId;
      this.lastLibraryContext = {
        source: 'live',
        title: liveLibrary.playlistName,
        subtitle: `${liveLibrary.accountLabel} / 网易云歌库`,
        note: `当前播放来自《${liveLibrary.playlistName}》。`
      };
      return this.lastKnownTracks;
    }

    this.lastKnownTracks = mockTracks;
    this.lastLibraryContext = this.createMockLibraryContext();
    this.activePlaylistId = null;

    return this.lastKnownTracks;
  }

  private async loadLiveLibrary(playlistId?: string): Promise<MusicBootstrapResult | null> {
    try {
      const playlists = await this.getLibraryPlaylists(true);
      const playlistCandidates = playlistId
        ? [playlistId]
        : [
            this.activePlaylistId,
            ...playlists
              .filter((item) => item.trackCount > 0)
              .sort((left, right) => right.trackCount - left.trackCount)
              .map((item) => item.id)
          ].filter((value, index, items): value is string => Boolean(value) && items.indexOf(value) === index);

      for (const candidateId of playlistCandidates.slice(0, 10)) {
        const result = await this.musicAdapter.loadPlaylist(candidateId);
        if (result?.tracks.length) {
          return result;
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
            continue;
          }

          trackEntryMap.set(track.id, {
            track,
            count: 1,
            playlistIds: [result.playlistId]
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
      summary: `${catalog.accountLabel} 的歌单不是单一流派收藏，而是按场景、年代和情绪做过长期沉淀。`,
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

  private async getCurationTrackPool(prompt: string): Promise<Track[]> {
    const catalog = await this.ensureLibraryCatalog();

    if (!catalog) {
      return this.getTrackPool();
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

    return this.musicAdapter.prioritizePlayableTracks(candidateTracks, 48, 160);
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

    return [...queries]
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 4);
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
          return await this.musicAdapter.searchTracks(query, 8);
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
      maxTracks: 24,
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
          maxTracks: 18,
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

  private async hydrateCuratedPlaylist(playlist: CuratedPlaylist): Promise<CuratedPlaylist> {
    const normalizedTracks = dedupeTracks(playlist.tracks, {
      maxTracks: 12,
      maxPerArtist: 1,
      maxPerAlbum: 1
    });
    const needsHydration = normalizedTracks.some((track) => !track.source);

    if (!needsHydration) {
      return {
        ...playlist,
        tracks: normalizedTracks
      };
    }

    const hydratedTracks = dedupeTracks(await this.musicAdapter.hydrateTracks(normalizedTracks), {
      maxTracks: 12,
      maxPerArtist: 1,
      maxPerAlbum: 1
    });
    if (hydratedTracks.length >= Math.min(normalizedTracks.length, 4)) {
      return {
        ...playlist,
        tracks: hydratedTracks
      };
    }

    const fallbackPool = await this.getRealTrackFallbackPool();
    const fallbackTracks = dedupeTracks(
      fallbackPool.filter(
        (track) => !hydratedTracks.some((item) => getTrackSignature(item) === getTrackSignature(track))
      ),
      {
        maxTracks: Math.max(0, 10 - hydratedTracks.length),
        maxPerArtist: 1,
        maxPerAlbum: 1
      }
    );

    const mergedTracks = dedupeTracks([...hydratedTracks, ...fallbackTracks], {
      maxTracks: 12,
      maxPerArtist: 1,
      maxPerAlbum: 1
    });

    return {
      ...playlist,
      note:
        hydratedTracks.length < normalizedTracks.length
          ? `${playlist.note} 已自动跳过部分当前不可播的歌曲。`
          : playlist.note,
      tracks: mergedTracks.length > 0 ? mergedTracks : normalizedTracks
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
        36,
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
