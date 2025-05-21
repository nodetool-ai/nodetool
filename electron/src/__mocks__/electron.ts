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
  isPackaged: false,
};

export const ipcMain = {
  on: jest.fn(),
  once: jest.fn(),
  handle: jest.fn(),
  removeHandler: jest.fn(),
  removeAllListeners: jest.fn(),
};

export const ipcRenderer = {
  on: jest.fn(),
  once: jest.fn(),
  invoke: jest.fn(),
  send: jest.fn(),
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
};

export const shell = {
  openExternal: jest.fn().mockResolvedValue(undefined),
};

export const Tray = jest.fn().mockImplementation(() => ({
  on: jest.fn(),
  setToolTip: jest.fn(),
  setContextMenu: jest.fn(),
  destroy: jest.fn(),
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