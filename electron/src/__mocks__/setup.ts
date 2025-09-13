// Global test setup file
// This file is run before all test files and sets up global mocks

// Mock the logger module globally to prevent async logging warnings
jest.mock('../logger', () => ({
  logMessage: jest.fn().mockResolvedValue(undefined),
  LOG_FILE: '/mock/userData/nodetool.log'
}));

// Mock electron globally for modules that import it
jest.mock('electron', () => {
  return {
    app: {
      isPackaged: false,
      getPath: jest.fn().mockReturnValue('/mock/userData'),
      on: jest.fn(),
      quit: jest.fn(),
    },
    ipcMain: {
      handle: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
    },
    BrowserWindow: {
      getFocusedWindow: jest.fn(),
      fromId: jest.fn(),
    },
    clipboard: {
      writeText: jest.fn(),
      readText: jest.fn(),
    },
    globalShortcut: {
      register: jest.fn(),
      unregister: jest.fn(),
      unregisterAll: jest.fn(),
    },
    shell: {
      openPath: jest.fn(),
      openExternal: jest.fn(),
    },
    dialog: {
      showMessageBox: jest.fn(),
      showOpenDialog: jest.fn(),
      showSaveDialog: jest.fn(),
    },
    systemPreferences: {
      askForMediaAccess: jest.fn().mockResolvedValue(true),
    },
  };
});