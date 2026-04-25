import path from 'node:path';
import { app, BrowserWindow, ipcMain, session } from 'electron';
import type { WindowPlatform, WindowState } from '../src/shared/contracts/bridge';
import { BridgeService } from '../src/main/bridge/bridge-service';
import { loadLocalEnv } from '../src/main/config/load-local-env';

const loadRuntimeEnv = () => {
  const candidates = [
    process.cwd(),
    path.dirname(process.execPath),
    app.isPackaged ? path.join(path.dirname(process.execPath), 'resources') : null
  ].filter((item): item is string => Boolean(item));

  for (const candidate of [...new Set(candidates)]) {
    loadLocalEnv(candidate);
  }
};

loadRuntimeEnv();

const bridgeService = new BridgeService();

let mainWindow: BrowserWindow | null = null;

const getPlatform = (): WindowPlatform => {
  if (process.platform === 'darwin') {
    return 'darwin';
  }

  if (process.platform === 'win32') {
    return 'win32';
  }

  return 'linux';
};

const createWindowState = (window: BrowserWindow): WindowState => ({
  maximized: window.isMaximized(),
  platform: getPlatform()
});

const broadcastWindowState = (window: BrowserWindow) => {
  window.webContents.send('cosic:window-state-changed', createWindowState(window));
};

const loadRenderer = async (window: BrowserWindow) => {
  if (app.isPackaged) {
    await window.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
    return;
  }

  try {
    await window.loadURL('http://127.0.0.1:5173');
  } catch {
    await window.loadFile(path.join(process.cwd(), 'dist', 'index.html'));
  }
};

const createMainWindow = async () => {
  const preloadPath = path.join(__dirname, 'preload.js');
  const window = new BrowserWindow({
    width: 1420,
    height: 920,
    minWidth: 760,
    minHeight: 620,
    backgroundColor: '#07080c',
    frame: false,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow = window;
  window.on('ready-to-show', () => {
    window.show();
  });
  window.on('maximize', () => broadcastWindowState(window));
  window.on('unmaximize', () => broadcastWindowState(window));
  window.on('enter-full-screen', () => broadcastWindowState(window));
  window.on('leave-full-screen', () => broadcastWindowState(window));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  await loadRenderer(window);
};

const configurePermissions = () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'geolocation');
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === 'geolocation');
};

const registerIpc = () => {
  ipcMain.handle('cosic:get-bootstrap', () => bridgeService.getBootstrap(getPlatform()));
  ipcMain.handle('cosic:load-library-playlist', (_event, playlistId) =>
    bridgeService.loadLibraryPlaylist(playlistId)
  );
  ipcMain.handle('cosic:analyze-music-taste', () => bridgeService.analyzeMusicTaste());
  ipcMain.handle('cosic:get-daily-station-brief', (_event, context) =>
    bridgeService.getDailyStationBrief(context)
  );
  ipcMain.handle('cosic:resolve-track-source', (_event, trackId) =>
    bridgeService.resolveTrackSource(trackId)
  );
  ipcMain.handle('cosic:get-track-lyrics', (_event, trackId) =>
    bridgeService.getTrackLyrics(trackId)
  );
  ipcMain.handle('cosic:refresh-bridge', () => bridgeService.refreshBridge());
  ipcMain.handle('cosic:ping-capability', (_event, capabilityId) =>
    bridgeService.pingCapability(capabilityId)
  );
  ipcMain.handle('cosic:generate-track-insight', (_event, trackId) =>
    bridgeService.generateTrackInsight(trackId)
  );
  ipcMain.handle('cosic:generate-curated-playlist', (_event, request) =>
    bridgeService.generateCuratedPlaylist({
      input: request?.input ?? '',
      context: request?.context
    })
  );
  ipcMain.handle('cosic:window-minimize', () => {
    mainWindow?.minimize();
  });
  ipcMain.handle('cosic:window-toggle-maximize', () => {
    if (!mainWindow) {
      return { maximized: false, platform: getPlatform() };
    }

    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }

    const state = createWindowState(mainWindow);
    broadcastWindowState(mainWindow);

    return state;
  });
  ipcMain.handle('cosic:window-close', () => {
    mainWindow?.close();
  });
  ipcMain.handle('cosic:window-state', () => {
    if (!mainWindow) {
      return { maximized: false, platform: getPlatform() };
    }

    return createWindowState(mainWindow);
  });
};

app.whenReady().then(async () => {
  configurePermissions();
  registerIpc();
  await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
