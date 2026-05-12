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

export type ScoreInstrument = 'piano' | 'violin' | 'orchestra' | 'voice' | 'unknown';

export type ClassicalScoreRole = 'original' | 'authoritative_full_score' | 'reduction' | 'arrangement';

export type ClassicalScorePriority = 'preferred' | 'optional';

export type ClassicalScoreCoverageStatus = 'covered' | 'partial' | 'missing';

export type ClassicalScoreMissingReason = 'no_catalog_match' | 'no_legal_source' | 'needs_review';

export type ClassicalMatchStatus = 'catalog' | 'heuristic';

export interface ClassicalScoreSource {
  instrument: ScoreInstrument;
  role: ClassicalScoreRole;
  priority: ClassicalScorePriority;
  title: string;
  format: 'svg' | 'pdf' | 'musicxml';
  pages: string[];
  sourceLabel: string;
  sourceUrl?: string;
  licenseLabel: string;
}

export interface ClassicalScoreCoverage {
  status: ClassicalScoreCoverageStatus;
  hasPreferredSource: boolean;
  hasOptionalArrangement: boolean;
  missingReason?: ClassicalScoreMissingReason;
}

export interface ClassicalWorkNote {
  composer: string;
  workTitle: string;
  period: string;
  background: string;
  innerWeather: string;
  listeningGuide: string;
  emotionalThesis: string;
  sources: string[];
}

export interface ClassicalWorkProfile {
  isClassical: boolean;
  isScoreReady: boolean;
  matchStatus: ClassicalMatchStatus;
  workId?: string;
  note?: ClassicalWorkNote;
  scores: ClassicalScoreSource[];
  coverage: ClassicalScoreCoverage;
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
  classical?: ClassicalWorkProfile;
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

export interface NarrationAudio {
  source: 'live';
  provider: string;
  mimeType: 'audio/wav';
  audioBase64: string;
  sampleRateHz: number;
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

export interface CurationChatMessage {
  role: 'assistant' | 'user';
  text: string;
}

export interface CurationRequest {
  input: string;
  context?: CurationContext;
  chatHistory?: CurationChatMessage[];
}

export type AgentTurnKind = 'conversation' | 'playlist' | 'refinement';

export interface AgentTurnResponse {
  kind: AgentTurnKind;
  reply: string;
  playlist?: CuratedPlaylist;
}

export type DesignReferenceMode = 'dark' | 'light';

export interface DesignReferenceRequest {
  prompt: string;
  mode?: DesignReferenceMode;
  size?: '1024x1024' | '1536x1024' | '1024x1536';
  quality?: 'low' | 'medium' | 'high';
}

export interface DesignReferenceImage {
  id: string;
  prompt: string;
  revisedPrompt?: string;
  model: string;
  mimeType: 'image/png';
  imageBase64: string;
  size: '1024x1024' | '1536x1024' | '1024x1536';
  quality: 'low' | 'medium' | 'high';
  mode: DesignReferenceMode;
  generatedAt: string;
}

export interface DailyWeatherSnapshot {
  source: 'live' | 'mock';
  locationLabel: string;
  summary: string;
  temperatureC: number;
  feelsLikeC: number | null;
  weatherCode?: number | null;
  isDay?: boolean | null;
  humidityPercent?: number | null;
  precipitationMm?: number | null;
  rainMm?: number | null;
  snowfallCm?: number | null;
  precipitationProbabilityPercent?: number | null;
  windSpeedKmh?: number | null;
  windDirectionDeg?: number | null;
  windGustKmh?: number | null;
  uvIndex?: number | null;
  temperatureMaxC?: number | null;
  temperatureMinC?: number | null;
  feelsLikeMaxC?: number | null;
  feelsLikeMinC?: number | null;
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

export interface ClassicalCoverageReportItem {
  track: Track;
  count: number;
  playlistIds: string[];
  playlistNames: string[];
  matchStatus: ClassicalMatchStatus;
  coverage: ClassicalScoreCoverage;
}

export interface ClassicalCoverageReport {
  source: 'live' | 'mock';
  generatedAt: string;
  totalClassicalTracks: number;
  coveredCount: number;
  partialCount: number;
  missingCount: number;
  items: ClassicalCoverageReportItem[];
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
  getClassicalCoverageReport(): Promise<ClassicalCoverageReport>;
  analyzeMusicTaste(): Promise<MusicTasteProfile>;
  getDailyStationBrief(context?: CurationContext): Promise<DailyStationBrief>;
  resolveTrackSource(trackId: string): Promise<string | null>;
  getTrackLyrics(trackId: string): Promise<TrackLyrics | null>;
  refreshBridge(): Promise<BridgeSnapshot>;
  pingCapability(capabilityId: BridgeCapabilityId): Promise<CapabilityProbeResult>;
  generateTrackInsight(trackId: string): Promise<TrackInsight>;
  generatePlaylistTrackInsights(trackIds: string[]): Promise<TrackInsight[]>;
  generateNarrationAudio(text: string): Promise<NarrationAudio>;
  handleAgentTurn(request: CurationRequest): Promise<AgentTurnResponse>;
  generateCuratedPlaylist(request: CurationRequest): Promise<CuratedPlaylist>;
  generateDesignReference(request: DesignReferenceRequest): Promise<DesignReferenceImage>;
  minimizeWindow(): Promise<void>;
  toggleMaximizeWindow(): Promise<WindowState>;
  closeWindow(): Promise<void>;
  getWindowState(): Promise<WindowState>;
  onWindowStateChange(callback: (state: WindowState) => void): () => void;
}
