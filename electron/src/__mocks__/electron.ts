// Mock for Electron modules
export const app = {
  getPath: jest.fn().mockImplementation((name: string) => {
    switch (name) {
      case 'userData':
        return '/mock/userData';
      case 'appData':
        return '/mock/appData';
      case 'temp':
        return '/mock/temp';
      case 'desktop':
        return '/mock/desktop';
      case 'documents':
        return '/mock/documents';
      case 'downloads':
        return '/mock/downloads';
      case 'home':
        return '/mock/home';
      case 'exe':
        return '/mock/exe';
      default:
        return `/mock/${name}`;
    }
  }),
  getName: jest.fn().mockReturnValue('nodetool-test'),
  getVersion: jest.fn().mockReturnValue('0.0.0-test'),
  on: jest.fn(),
  once: jest.fn(),
  whenReady: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn(),
  exit: jest.fn(),
  relaunch: jest.fn(),
  isReady: jest.fn().mockReturnValue(true),
  isPackaged: false,
  setAppUserModelId: jest.fn(),
  setActivationPolicy: jest.fn(),
  setLoginItemSettings: jest.fn(),
};

export const ipcMain = {
  on: jest.fn(),
  once: jest.fn(),
  handle: jest.fn(),
  handleOnce: jest.fn(),
  removeHandler: jest.fn(),
  removeAllListeners: jest.fn(),
};

export const ipcRenderer = {
  on: jest.fn(),
  once: jest.fn(),
  invoke: jest.fn().mockResolvedValue(undefined),
  send: jest.fn(),
  removeListener: jest.fn(),
  removeAllListeners: jest.fn(),
};

const mockWindow = {
  loadURL: jest.fn().mockResolvedValue(undefined),
  loadFile: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  once: jest.fn(),
  webContents: {
    on: jest.fn(),
    once: jest.fn(),
    send: jest.fn(),
    openDevTools: jest.fn(),
  },
  show: jest.fn(),
  hide: jest.fn(),
  close: jest.fn(),
  destroy: jest.fn(),
  isDestroyed: jest.fn().mockReturnValue(false),
  isVisible: jest.fn().mockReturnValue(true),
  setSize: jest.fn(),
  getSize: jest.fn().mockReturnValue([800, 600]),
  setPosition: jest.fn(),
  center: jest.fn(),
};

export const BrowserWindow = jest.fn().mockImplementation(() => mockWindow);

export const dialog = {
  showOpenDialog: jest.fn().mockResolvedValue({ canceled: false, filePaths: ['/mock/path/file.txt'] }),
  showSaveDialog: jest.fn().mockResolvedValue({ canceled: false, filePath: '/mock/path/save.txt' }),
  showMessageBox: jest.fn().mockResolvedValue({ response: 0 }),
  showErrorBox: jest.fn(),
};

export const shell = {
  openExternal: jest.fn().mockResolvedValue(undefined),
  openPath: jest.fn().mockResolvedValue(''),
  showItemInFolder: jest.fn(),
};

export const systemPreferences = {
  askForMediaAccess: jest.fn().mockResolvedValue(true),
  getMediaAccessStatus: jest.fn().mockReturnValue('granted'),
};

export const session = {
  defaultSession: {
    setPermissionRequestHandler: jest.fn(),
    setPermissionCheckHandler: jest.fn(),
    fromPartition: jest.fn(),
    webRequest: {
      onHeadersReceived: jest.fn(),
      onBeforeRequest: jest.fn(),
    },
    on: jest.fn(),
  },
  fromPartition: jest.fn(),
};

export const protocol = {
  handle: jest.fn(),
  registerFileProtocol: jest.fn(),
  registerStringProtocol: jest.fn(),
  registerSchemesAsPrivileged: jest.fn(),
};

export const Notification = jest.fn().mockImplementation(() => ({
  show: jest.fn(),
  on: jest.fn(),
  close: jest.fn(),
}));
(Notification as any).isSupported = jest.fn().mockReturnValue(true);

// Return an EventEmitter-backed fake so tests can `emit('spawn')` etc.
// Each fork() call produces a fresh emitter so lifecycle is isolated.
import { EventEmitter as _EE } from "events";
export const utilityProcess = {
  fork: jest.fn().mockImplementation(() => {
    const proc: any = Object.assign(new _EE(), {
      pid: 4242,
      stdout: new _EE(),
      stderr: new _EE(),
      kill: jest.fn().mockReturnValue(true),
      postMessage: jest.fn(),
    });
    // Auto-emit 'spawn' on next tick so tests that don't explicitly
    // trigger it still unblock the Watchdog startup path.
    process.nextTick(() => proc.emit("spawn"));
    return proc;
  }),
};

export const contextBridge = {
  exposeInMainWorld: jest.fn(),
};

export const Tray = jest.fn().mockImplementation(() => ({
  on: jest.fn(),
  setToolTip: jest.fn(),
  setContextMenu: jest.fn(),
  setIgnoreDoubleClickEvents: jest.fn(),
  popUpContextMenu: jest.fn(),
  setImage: jest.fn(),
  destroy: jest.fn(),
  isDestroyed: jest.fn().mockReturnValue(false),
}));

export const Menu = {
  buildFromTemplate: jest.fn().mockReturnValue({
    popup: jest.fn(),
    closePopup: jest.fn(),
  }),
  setApplicationMenu: jest.fn(),
};

export const nativeImage = {
  createFromPath: jest.fn().mockReturnValue({}),
};

export const autoUpdater = {
  on: jest.fn(),
  once: jest.fn(),
  checkForUpdatesAndNotify: jest.fn().mockResolvedValue(undefined),
  quitAndInstall: jest.fn(),
};

export const powerMonitor = {
  on: jest.fn(),
};

export const globalShortcut = {
  register: jest.fn(),
  unregister: jest.fn(),
  unregisterAll: jest.fn(),
  isRegistered: jest.fn().mockReturnValue(false),
};