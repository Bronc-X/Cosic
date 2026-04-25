import { contextBridge, ipcRenderer } from 'electron';
import type {
  BridgeCapabilityId,
  BridgeSnapshot,
  BootstrapPayload,
  CapabilityProbeResult,
  CurationRequest,
  CuratedPlaylist,
  CosicDesktopApi,
  DailyStationBrief,
  LibraryLoadResult,
  MusicTasteProfile,
  TrackInsight,
  TrackLyrics,
  WindowState
} from '../src/shared/contracts/bridge';

const desktopApi: CosicDesktopApi = {
  getBootstrap: () => ipcRenderer.invoke('cosic:get-bootstrap') as Promise<BootstrapPayload>,
  loadLibraryPlaylist: (playlistId: string) =>
    ipcRenderer.invoke('cosic:load-library-playlist', playlistId) as Promise<LibraryLoadResult>,
  analyzeMusicTaste: () => ipcRenderer.invoke('cosic:analyze-music-taste') as Promise<MusicTasteProfile>,
  getDailyStationBrief: (context) =>
    ipcRenderer.invoke('cosic:get-daily-station-brief', context) as Promise<DailyStationBrief>,
  resolveTrackSource: (trackId: string) =>
    ipcRenderer.invoke('cosic:resolve-track-source', trackId) as Promise<string | null>,
  getTrackLyrics: (trackId: string) =>
    ipcRenderer.invoke('cosic:get-track-lyrics', trackId) as Promise<TrackLyrics | null>,
  refreshBridge: () => ipcRenderer.invoke('cosic:refresh-bridge') as Promise<BridgeSnapshot>,
  pingCapability: (capabilityId: BridgeCapabilityId) =>
    ipcRenderer.invoke('cosic:ping-capability', capabilityId) as Promise<CapabilityProbeResult>,
  generateTrackInsight: (trackId: string) =>
    ipcRenderer.invoke('cosic:generate-track-insight', trackId) as Promise<TrackInsight>,
  generateCuratedPlaylist: (request: CurationRequest) =>
    ipcRenderer.invoke('cosic:generate-curated-playlist', request) as Promise<CuratedPlaylist>,
  minimizeWindow: () => ipcRenderer.invoke('cosic:window-minimize') as Promise<void>,
  toggleMaximizeWindow: () =>
    ipcRenderer.invoke('cosic:window-toggle-maximize') as Promise<WindowState>,
  closeWindow: () => ipcRenderer.invoke('cosic:window-close') as Promise<void>,
  getWindowState: () => ipcRenderer.invoke('cosic:window-state') as Promise<WindowState>,
  onWindowStateChange: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: WindowState) => callback(state);
    ipcRenderer.on('cosic:window-state-changed', listener);

    return () => {
      ipcRenderer.removeListener('cosic:window-state-changed', listener);
    };
  }
};

contextBridge.exposeInMainWorld('cosic', desktopApi);
