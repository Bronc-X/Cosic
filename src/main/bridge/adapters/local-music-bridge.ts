import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type {
  BridgeHealth,
  CapabilityProbeResult,
  LibraryPlaylist,
  Track,
  TrackLyrics,
  TrackTheme
} from '../../../shared/contracts/bridge';

interface MusicBridgeHealth {
  ok: boolean;
  configured: boolean;
  account?: {
    userId: number;
    nickname: string;
    avatarUrl?: string | null;
  };
}

interface MusicBridgePlaylistList {
  account?: {
    userId: number;
    nickname: string;
  };
  items: LibraryPlaylist[];
}

interface MusicBridgePlaylistDetail {
  id: string;
  name: string;
  description: string;
  coverUrl: string;
  trackCount: number;
  tracks: Array<{
    id: string;
    title: string;
    artist: string;
    album: string;
    duration: number;
    year: string;
    coverUrl: string;
  }>;
}

interface MusicBridgeStream {
  trackId: string;
  url: string;
  bitrate: number;
  type: string;
  expiresAt: string;
}

interface MusicBridgeSearchTracks {
  query: string;
  items: Array<{
    id: string;
    title: string;
    artist: string;
    album: string;
    duration: number;
    year: string;
    coverUrl: string;
  }>;
}

interface MusicBridgeTrackCheck {
  success: boolean;
  message: string;
}

interface MusicBridgeLyrics {
  trackId: string;
  provider: string;
  lyric: string;
  translatedLyric?: string;
  fetchedAt: string;
}

export interface MusicCatalogResult {
  accountLabel: string;
  playlistId: string;
  playlistName: string;
  tracks: Track[];
}

export interface MusicBootstrapResult {
  accountLabel: string;
  playlistId: string;
  playlistName: string;
  tracks: Track[];
}

const PLAYLIST_MIN_TRACKS = 15;
const BOOTSTRAP_TRACK_LIMIT = 50;
const PLAYLIST_MAX_TRACKS = 50;
const PLAYABLE_SCAN_MULTIPLIER = 4;
const PLAYABLE_BATCH_SIZE = 8;
const REQUEST_TIMEOUT_MS = 12_000;
const DEFAULT_LOCAL_BRIDGE_URL = 'http://127.0.0.1:7878';
const fallbackTheme: TrackTheme = {
  primary: '#f4f1ea',
  secondary: '#181512',
  accent: '#f0b37a'
};

const moodPalette = ['Focused', 'Calm', 'Cinematic', 'Open'] as const;
const themePalette: TrackTheme[] = [
  {
    primary: '#f0c17a',
    secondary: '#24160e',
    accent: '#fff0cc'
  },
  {
    primary: '#9ec9ff',
    secondary: '#101826',
    accent: '#dcecff'
  },
  {
    primary: '#7bd4c9',
    secondary: '#0f211f',
    accent: '#d8fff8'
  },
  {
    primary: '#f49a8f',
    secondary: '#261312',
    accent: '#ffd6cf'
  }
];

const hasValue = (value: string | undefined) => Boolean(value && value.trim());

const clampPlaylistTrackLimit = (limit: number) => {
  const normalized = Math.floor(limit);
  return Number.isFinite(normalized)
    ? Math.max(PLAYLIST_MIN_TRACKS, Math.min(PLAYLIST_MAX_TRACKS, normalized))
    : BOOTSTRAP_TRACK_LIMIT;
};

const clampTracks = <T>(items: T[], limit: number) => items.slice(0, clampPlaylistTrackLimit(limit));

const getRandomUnit = () => {
  const values = new Uint32Array(1);
  globalThis.crypto?.getRandomValues(values);
  return values[0] ? values[0] / 0xffffffff : Math.random();
};

const shuffleTracks = <T>(items: T[]) => {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(getRandomUnit() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
};

const compiledProjectRoot = () => path.resolve(__dirname, '../../../../..');

const toUnpackedAsarPath = (value: string) =>
  value.replace(/app\.asar(?=$|[\\/])/, 'app.asar.unpacked');

const resolveBridgeProjectRoot = () => toUnpackedAsarPath(compiledProjectRoot());

const shouldUseElectronNodeRuntime = (bridgeRoot: string) =>
  bridgeRoot.includes('app.asar.unpacked') && Boolean(process.versions.electron);

const resolveAsarNodeModules = (bridgeRoot: string) =>
  shouldUseElectronNodeRuntime(bridgeRoot)
    ? path.join(bridgeRoot.replace('app.asar.unpacked', 'app.asar'), 'node_modules')
    : null;

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const pickTheme = (seed: string) => themePalette[hashString(seed) % themePalette.length] ?? fallbackTheme;

const pickMood = (seed: string) => moodPalette[hashString(seed) % moodPalette.length] ?? 'Focused';

const toTags = (playlistName: string, track: MusicBridgePlaylistDetail['tracks'][number]) =>
  [playlistName, track.artist.split('/')[0]?.trim(), track.album]
    .filter((value): value is string => Boolean(value && value.trim()))
    .slice(0, 3);

const parseTimestamp = (minutes: string, seconds: string, fraction = '0') => {
  const paddedFraction = fraction.padEnd(3, '0').slice(0, 3);
  return Number(minutes) * 60 + Number(seconds) + Number(paddedFraction) / 1000;
};

const parseLrc = (value: string) => {
  const lines: Array<{ time: number; text: string }> = [];

  for (const rawLine of value.split(/\r?\n/)) {
    const timeMatches = [...rawLine.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    if (!timeMatches.length) {
      continue;
    }

    const text = rawLine.replace(/\[[^\]]+\]/g, '').trim();
    if (!text) {
      continue;
    }

    for (const match of timeMatches) {
      lines.push({
        time: parseTimestamp(match[1] ?? '0', match[2] ?? '0', match[3]),
        text
      });
    }
  }

  return lines.sort((left, right) => left.time - right.time);
};

const mergeLrcTranslations = (
  lyrics: ReturnType<typeof parseLrc>,
  translations: ReturnType<typeof parseLrc>
) => {
  const translatedByTime = new Map(translations.map((line) => [Math.round(line.time * 1000), line.text]));

  return lyrics.map((line) => ({
    time: line.time,
    text: line.text,
    translation: translatedByTime.get(Math.round(line.time * 1000))
  }));
};

export class LocalMusicBridgeAdapter {
  private readonly provider = process.env.COSIC_MUSIC_PROVIDER?.trim() || 'netease';

  private readonly baseUrl = process.env.COSIC_MUSIC_BASE_URL?.trim() || '';

  private readonly projectRoot = resolveBridgeProjectRoot();

  private readonly bridgeExecutable = shouldUseElectronNodeRuntime(this.projectRoot) ? process.execPath : 'node';

  private lastAccountLabel = 'NetEase';

  private bridgeStartPromise: Promise<boolean> | null = null;

  isConfigured() {
    return this.provider === 'netease' && hasValue(this.baseUrl);
  }

  getPublicScoreUrl(localUrl: string) {
    const normalized = localUrl.trim();
    if (!normalized.startsWith('/scores/')) {
      return '';
    }

    return `${(this.baseUrl || DEFAULT_LOCAL_BRIDGE_URL).replace(/\/+$/, '')}${normalized}`;
  }

  async probe(): Promise<CapabilityProbeResult> {
    const checkedAt = new Date().toISOString();

    if (!this.isConfigured()) {
      return {
        capabilityId: 'music',
        status: 'mock',
        latencyMs: 0,
        checkedAt,
        message: 'Music bridge URL is not configured yet.'
      };
    }

    const startedAt = Date.now();

    try {
      const payload = await this.request<MusicBridgeHealth>('/health');
      const latencyMs = Date.now() - startedAt;
      const status: BridgeHealth = payload.ok && payload.configured ? 'online' : 'configured';

      return {
        capabilityId: 'music',
        status,
        latencyMs,
        checkedAt,
        message:
          payload.ok && payload.account?.nickname
            ? `Music bridge is live for ${payload.account.nickname}.`
            : 'Music bridge responded, but login is not complete yet.'
      };
    } catch (error) {
      return {
        capabilityId: 'music',
        status: 'offline',
        latencyMs: 0,
        checkedAt,
        message: error instanceof Error ? error.message : 'Music bridge is unreachable.'
      };
    }
  }

  async loadBootstrapTracks(limit = BOOTSTRAP_TRACK_LIMIT): Promise<MusicBootstrapResult | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const trackLimit = clampPlaylistTrackLimit(limit);
    const playlists = await this.listPlaylists();
    const chosenPlaylist = playlists.items.find((item) => item.trackCount > 0) ?? playlists.items[0] ?? null;

    if (!chosenPlaylist) {
      return null;
    }

    return this.loadPlaylist(chosenPlaylist.id, trackLimit, playlists.account?.nickname || 'NetEase');
  }

  async listPlaylists(): Promise<MusicBridgePlaylistList> {
    if (!this.isConfigured()) {
      return {
        items: []
      };
    }

    const payload = await this.request<MusicBridgePlaylistList>('/user/playlists');
    this.lastAccountLabel = payload.account?.nickname || this.lastAccountLabel;

    return payload;
  }

  async loadPlaylist(
    playlistId: string,
    limit = BOOTSTRAP_TRACK_LIMIT,
    accountLabel = this.lastAccountLabel
  ): Promise<MusicBootstrapResult | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const trackLimit = clampPlaylistTrackLimit(limit);
    const detail = await this.request<MusicBridgePlaylistDetail>(`/playlists/${playlistId}`);
    const scanLimit = Math.min(detail.tracks.length, Math.max(trackLimit * PLAYABLE_SCAN_MULTIPLIER, 36));
    const hydrated = await this.collectPlayablePlaylistTracks(detail, trackLimit, scanLimit);

    if (!hydrated.length) {
      return null;
    }

    return {
      accountLabel,
      playlistId: detail.id,
      playlistName: detail.name,
      tracks: shuffleTracks(hydrated)
    };
  }

  async loadPlaylistCatalog(
    playlistId: string,
    accountLabel = this.lastAccountLabel
  ): Promise<MusicCatalogResult | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const detail = await this.request<MusicBridgePlaylistDetail>(`/playlists/${playlistId}`);

    return {
      accountLabel,
      playlistId: detail.id,
      playlistName: detail.name,
      tracks: detail.tracks.map((track) => this.toTrack(track, detail.name, ''))
    };
  }

  async hydrateTracks(tracks: Track[]): Promise<Track[]> {
    const hydrated = await Promise.all(
      tracks.map(async (track) => {
        try {
          const available = await this.checkTrackAvailability(track.id);
          if (!available) {
            return null;
          }

          const source = await this.resolveTrackSource(track.id);

          return source
            ? {
                ...track,
                source
              }
            : null;
        } catch {
          return null;
        }
      })
    );

    return hydrated.filter((track): track is Track => Boolean(track));
  }

  async prioritizePlayableTracks(tracks: Track[], limit: number, scanLimit = Math.max(limit * 2, 24)) {
    if (!this.isConfigured()) {
      return tracks.slice(0, limit);
    }

    const maxScan = Math.min(tracks.length, Math.max(limit, scanLimit));
    const playable: Track[] = [];
    const seen = new Set<string>();

    for (let index = 0; index < maxScan && playable.length < limit; index += PLAYABLE_BATCH_SIZE) {
      const batch = tracks.slice(index, Math.min(index + PLAYABLE_BATCH_SIZE, maxScan));
      const checked = await Promise.all(
        batch.map(async (track) => ({
          track,
          ok: await this.checkTrackAvailability(track.id).catch(() => false)
        }))
      );

      for (const item of checked) {
        if (!item.ok || seen.has(item.track.id)) {
          continue;
        }

        seen.add(item.track.id);
        playable.push(item.track);

        if (playable.length >= limit) {
          break;
        }
      }
    }

    if (playable.length > 0) {
      return playable;
    }

    return tracks.slice(0, Math.min(limit, tracks.length));
  }

  async resolveTrackSource(trackId: string): Promise<string | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const stream = await this.request<MusicBridgeStream>(`/tracks/${trackId}/stream`);

    return stream.url || null;
  }

  async getTrackLyrics(trackId: string): Promise<TrackLyrics | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const payload = await this.request<MusicBridgeLyrics>(`/tracks/${encodeURIComponent(trackId)}/lyrics`);
    const lines = mergeLrcTranslations(parseLrc(payload.lyric || ''), parseLrc(payload.translatedLyric || ''));

    if (!lines.length) {
      return null;
    }

    return {
      trackId: payload.trackId,
      source: 'live',
      provider: payload.provider || this.provider,
      lines,
      fetchedAt: payload.fetchedAt || new Date().toISOString()
    };
  }

  async checkTrackAvailability(trackId: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    const payload = await this.request<MusicBridgeTrackCheck>(
      `/check/music?id=${encodeURIComponent(trackId)}`
    );

    return Boolean(payload.success);
  }

  async searchTracks(query: string, limit = 8): Promise<Track[]> {
    if (!this.isConfigured()) {
      return [];
    }

    const payload = await this.request<MusicBridgeSearchTracks>(
      `/search/tracks?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(limit)}`
    );

    return payload.items.map((track) => {
      const themeSeed = `search:${query}:${track.id}:${track.artist}`;

      return {
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        duration: track.duration,
        source: '',
        coverUrl: track.coverUrl || undefined,
        year: track.year || '',
        mood: pickMood(themeSeed),
        tags: [query, '外部相似搜索', track.artist.split('/')[0]?.trim() || '']
          .filter(Boolean)
          .slice(0, 3),
        theme: pickTheme(themeSeed)
      };
    });
  }

  private toTrack(
    track: MusicBridgePlaylistDetail['tracks'][number],
    playlistName: string,
    source: string
  ): Track {
    const themeSeed = `${playlistName}:${track.id}:${track.artist}`;

    return {
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      source,
      coverUrl: track.coverUrl || undefined,
      year: track.year || '',
      mood: pickMood(themeSeed),
      tags: toTags(playlistName, track),
      theme: pickTheme(themeSeed)
    };
  }

  private async collectPlayablePlaylistTracks(
    detail: MusicBridgePlaylistDetail,
    limit: number,
    scanLimit: number
  ): Promise<Track[]> {
    const result: Track[] = [];

    for (let index = 0; index < scanLimit && result.length < limit; index += PLAYABLE_BATCH_SIZE) {
      const batch = detail.tracks.slice(index, index + PLAYABLE_BATCH_SIZE);
      const hydratedBatch = await Promise.all(batch.map((track) => this.hydratePlaylistTrack(track, detail.name)));

      for (const track of hydratedBatch) {
        if (!track) {
          continue;
        }

        result.push(track);
        if (result.length >= limit) {
          break;
        }
      }
    }

    if (result.length > 0) {
      return result;
    }

    const optimistic = clampTracks(detail.tracks, limit);
    const fallback = await Promise.all(
      optimistic.map(async (track) => {
        try {
          const stream = await this.request<MusicBridgeStream>(`/tracks/${track.id}/stream`);
          return this.toTrack(track, detail.name, stream.url);
        } catch {
          return null;
        }
      })
    );

    return fallback.filter((track): track is Track => Boolean(track));
  }

  private async hydratePlaylistTrack(
    track: MusicBridgePlaylistDetail['tracks'][number],
    playlistName: string
  ): Promise<Track | null> {
    try {
      const available = await this.checkTrackAvailability(track.id);
      if (!available) {
        return null;
      }

      const stream = await this.request<MusicBridgeStream>(`/tracks/${track.id}/stream`);
      return this.toTrack(track, playlistName, stream.url);
    } catch {
      return null;
    }
  }

  private async request<T>(pathname: string): Promise<T> {
    try {
      return await this.executeRequest<T>(pathname);
    } catch (error) {
      if (!this.shouldAttemptBridgeBoot(error)) {
        throw error;
      }

      this.bridgeStartPromise = null;
      const started = await this.ensureLocalBridgeRunning();
      if (!started) {
        throw error;
      }

      return this.executeRequest<T>(pathname);
    }
  }

  private async executeRequest<T>(pathname: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    const text = await response.text();
    let payload: unknown;

    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`Music bridge returned non-JSON for ${pathname}.`);
    }

    if (!response.ok) {
      const message =
        typeof payload === 'object' && payload && 'message' in payload
          ? String((payload as { message?: string }).message || '')
          : '';

      throw new Error(message || `Music bridge request failed for ${pathname}.`);
    }

    return payload as T;
  }

  private shouldAttemptBridgeBoot(error: unknown) {
    if (!this.isLocalBridgeUrl()) {
      return false;
    }

    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();

    return (
      error.name === 'TypeError' ||
      message.includes('fetch failed') ||
      message.includes('econnrefused') ||
      message.includes('network') ||
      message.includes('timeout')
    );
  }

  private isLocalBridgeUrl() {
    if (!hasValue(this.baseUrl)) {
      return false;
    }

    try {
      const url = new URL(this.baseUrl);
      return ['127.0.0.1', 'localhost'].includes(url.hostname);
    } catch {
      return false;
    }
  }

  private async ensureLocalBridgeRunning() {
    if (!this.isLocalBridgeUrl()) {
      return false;
    }

    if (await this.isLocalBridgeHealthy()) {
      return true;
    }

    if (!this.bridgeStartPromise) {
      this.bridgeStartPromise = this.startLocalBridge();
    }

    const result = await this.bridgeStartPromise;
    if (!result) {
      this.bridgeStartPromise = null;
    }

    return result;
  }

  private async isLocalBridgeHealthy() {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(1_500)
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  private async startLocalBridge() {
    const scriptPath = path.join(this.projectRoot, 'local-bridge', 'music-bridge.mjs');
    if (!fs.existsSync(scriptPath)) {
      return false;
    }

    try {
      const stdout = fs.openSync(path.join(this.projectRoot, 'bridge-music.out.log'), 'a');
      const stderr = fs.openSync(path.join(this.projectRoot, 'bridge-music.err.log'), 'a');

      const child = spawn(this.bridgeExecutable, [scriptPath], {
        cwd: this.projectRoot,
        detached: true,
        env: this.createBridgeEnv(),
        stdio: ['ignore', stdout, stderr],
        windowsHide: true
      });

      child.unref();
    } catch {
      return false;
    }

    for (let attempt = 0; attempt < 16; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));

      if (await this.isLocalBridgeHealthy()) {
        return true;
      }
    }

    return false;
  }

  private createBridgeEnv(): NodeJS.ProcessEnv {
    if (!shouldUseElectronNodeRuntime(this.projectRoot)) {
      return process.env;
    }

    const asarNodeModules = resolveAsarNodeModules(this.projectRoot);
    const nodePath = [asarNodeModules, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);

    return {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      ...(nodePath ? { NODE_PATH: nodePath } : {})
    };
  }
}
