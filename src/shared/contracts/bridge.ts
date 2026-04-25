export type WindowPlatform = 'darwin' | 'win32' | 'linux';

export type BridgeCapabilityId =
  | 'brain'
  | 'music'
  | 'voice'
  | 'calendar'
  | 'weather'
  | 'cast';

export type BridgeHealth = 'online' | 'configured' | 'mock' | 'offline';

export type DeviceStatus = 'ready' | 'standby' | 'offline';

export interface TrackTheme {
  primary: string;
  secondary: string;
  accent: string;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  source: string;
  coverUrl?: string;
  year: string;
  mood: string;
  tags: string[];
  theme: TrackTheme;
}

export interface LyricsLine {
  time: number;
  text: string;
  translation?: string;
}

export interface TrackLyrics {
  trackId: string;
  source: 'live';
  provider: string;
  lines: LyricsLine[];
  fetchedAt: string;
}

export interface BridgeCapability {
  id: BridgeCapabilityId;
  label: string;
  provider: string;
  summary: string;
  status: BridgeHealth;
  latencyMs: number;
  lastCheckedAt: string;
}

export interface BridgeDevice {
  id: string;
  name: string;
  zone: string;
  transport: string;
  status: DeviceStatus;
}

export interface BridgeServer {
  name: string;
  runtime: string;
  status: BridgeHealth;
  updatedAt: string;
}

export interface BridgeSnapshot {
  server: BridgeServer;
  capabilities: BridgeCapability[];
  devices: BridgeDevice[];
  notes: string[];
}

export interface CapabilityProbeResult {
  capabilityId: BridgeCapabilityId;
  status: BridgeHealth;
  latencyMs: number;
  message: string;
  checkedAt: string;
}

export interface TrackInsight {
  trackId: string;
  text: string;
  source: 'live' | 'mock';
  model: string;
  generatedAt: string;
}

export interface CurationContext {
  mode?: string;
  durationMinutes?: number;
  requestKind?: 'manual' | 'daily';
  locale?: string;
  timezone?: string;
  localTimeIso?: string;
  regionLabel?: string;
  latitude?: number;
  longitude?: number;
}

export interface CurationRequest {
  input: string;
  context?: CurationContext;
}

export interface DailyWeatherSnapshot {
  source: 'live' | 'mock';
  locationLabel: string;
  summary: string;
  temperatureC: number;
  feelsLikeC: number | null;
}

export interface DailyStationBrief {
  generatedAt: string;
  timezone: string;
  regionLabel: string;
  localTimeLabel: string;
  weekdayLabel: string;
  partOfDayLabel: string;
  moodGuess: string;
  moodReason: string;
  tasteAnchor: string;
  archetype: string;
  weather: DailyWeatherSnapshot | null;
}

export interface CuratedPlaylist {
  id: string;
  prompt: string;
  title: string;
  intent: string;
  note: string;
  reply: string;
  source: 'live' | 'mock';
  model: string;
  generatedAt: string;
  requestKind: 'manual' | 'daily';
  dailyBrief: DailyStationBrief | null;
  tracks: Track[];
}

export interface LibraryContext {
  source: 'live' | 'mock';
  title: string;
  subtitle: string;
  note: string;
}

export interface LibraryPlaylist {
  id: string;
  name: string;
  description: string;
  trackCount: number;
  coverUrl: string;
  updatedAt: string;
}

export interface LibraryLoadResult {
  tracks: Track[];
  libraryContext: LibraryContext;
  activePlaylistId: string | null;
}

export interface TasteFacet {
  label: string;
  count: number;
}

export interface MusicTasteProfile {
  source: 'live' | 'mock';
  model: string;
  generatedAt: string;
  archetype: string;
  summary: string;
  signals: string[];
  stats: {
    playlistCount: number;
    totalTrackEntries: number;
    uniqueTrackCount: number;
  };
  topArtists: TasteFacet[];
  topAlbums: TasteFacet[];
  topYears: TasteFacet[];
  topPlaylists: LibraryPlaylist[];
}

export interface BootstrapPayload {
  platform: WindowPlatform;
  tracks: Track[];
  bridge: BridgeSnapshot;
  libraryContext: LibraryContext;
  playlists: LibraryPlaylist[];
  activePlaylistId: string | null;
}

export interface WindowState {
  maximized: boolean;
  platform: WindowPlatform;
}

export interface CosicDesktopApi {
  getBootstrap(): Promise<BootstrapPayload>;
  loadLibraryPlaylist(playlistId: string): Promise<LibraryLoadResult>;
  analyzeMusicTaste(): Promise<MusicTasteProfile>;
  getDailyStationBrief(context?: CurationContext): Promise<DailyStationBrief>;
  resolveTrackSource(trackId: string): Promise<string | null>;
  getTrackLyrics(trackId: string): Promise<TrackLyrics | null>;
  refreshBridge(): Promise<BridgeSnapshot>;
  pingCapability(capabilityId: BridgeCapabilityId): Promise<CapabilityProbeResult>;
  generateTrackInsight(trackId: string): Promise<TrackInsight>;
  generateCuratedPlaylist(request: CurationRequest): Promise<CuratedPlaylist>;
  minimizeWindow(): Promise<void>;
  toggleMaximizeWindow(): Promise<WindowState>;
  closeWindow(): Promise<void>;
  getWindowState(): Promise<WindowState>;
  onWindowStateChange(callback: (state: WindowState) => void): () => void;
}
