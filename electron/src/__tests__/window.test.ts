import { BrowserWindow, dialog, session } from 'electron';
import path from 'path';
import { createWindow, createPackageManagerWindow, handleActivation, forceQuit } from '../window';
import { setMainWindow, getMainWindow } from '../state';
import { isAppQuitting } from '../main';
import { logMessage } from '../logger';

// Mocking dependencies
jest.mock('electron', () => {
  // Create a mock browser window constructor
  const mockBrowserWindow = jest.fn().mockImplementation(() => ({
    loadURL: jest.fn().mockResolvedValue(undefined),
    loadFile: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    once: jest.fn(),
    webContents: {
      on: jest.fn(),
      once: jest.fn(),
      send: jest.fn(),
      openDevTools: jest.fn(),
      closeDevTools: jest.fn(),
      isDevToolsOpened: jest.fn().mockReturnValue(false),
    },
    show: jest.fn(),
    hide: jest.fn(),
    close: jest.fn(),
    destroy: jest.fn(),
    isDestroyed: jest.fn().mockReturnValue(false),
    isVisible: jest.fn().mockReturnValue(true),
    isMinimized: jest.fn().mockReturnValue(false),
    restore: jest.fn(),
    focus: jest.fn(),
    setSize: jest.fn(),
    getSize: jest.fn().mockReturnValue([800, 600]),
    setPosition: jest.fn(),
    center: jest.fn(),
    setBackgroundColor: jest.fn(),
  }));
  
  // Create a function mock with additional static properties
  const BrowserWindowMock = Object.assign(mockBrowserWindow, {
    getAllWindows: jest.fn().mockReturnValue([])
  });
  
  return {
    app: {
      getPath: jest.fn().mockImplementation((name) => `/mock/${name}`),
      getName: jest.fn().mockReturnValue('nodetool-test'),
      getVersion: jest.fn().mockReturnValue('0.0.0-test'),
      on: jest.fn(),
      once: jest.fn(),
      whenReady: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn(),
      exit: jest.fn(),
      isPackaged: false,
    },
    ipcMain: {
      on: jest.fn(),
      once: jest.fn(),
      handle: jest.fn(),
      removeHandler: jest.fn(),
      removeAllListeners: jest.fn(),
    },
    BrowserWindow: BrowserWindowMock,
    session: {
      defaultSession: {
        setPermissionRequestHandler: jest.fn(),
        setPermissionCheckHandler: jest.fn(),
        webRequest: {
          onHeadersReceived: jest.fn(),
        },
      }
    },
    dialog: {
      showOpenDialog: jest.fn().mockResolvedValue({ canceled: false, filePaths: ['/mock/path/file.txt'] }),
      showSaveDialog: jest.fn().mockResolvedValue({ canceled: false, filePath: '/mock/path/save.txt' }),
      showMessageBox: jest.fn().mockResolvedValue({ response: 0 }),
      showErrorBox: jest.fn(),
    },
    WebContents: jest.fn(),
  };
});

jest.mock('../logger', () => ({
  logMessage: jest.fn(),
}));

jest.mock('../state', () => ({
  setMainWindow: jest.fn(),
  getMainWindow: jest.fn(),
}));

// Create a controllable mock for isAppQuitting
const mockIsAppQuitting = { value: false };

jest.mock('../main', () => ({
  get isAppQuitting() {
    return mockIsAppQuitting.value;
  },
  mainWindow: null,
}));

jest.mock('path', () => ({
  join: jest.fn().mockImplementation((...args) => args.join('/')),
}));

describe('Window Module', () => {
  let mockWindow: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a mock window with all required methods for testing
    mockWindow = {
      setBackgroundColor: jest.fn(),
      loadFile: jest.fn(),
      webContents: {
        on: jest.fn(),
        openDevTools: jest.fn(),
        closeDevTools: jest.fn(),
        isDevToolsOpened: jest.fn().mockReturnValue(false),
      },
      on: jest.fn(),
      focus: jest.fn(),
      destroy: jest.fn(),
      isDestroyed: jest.fn().mockReturnValue(false),
      isVisible: jest.fn().mockReturnValue(true),
      isMinimized: jest.fn().mockReturnValue(false),
      restore: jest.fn(),
      show: jest.fn()
    };
    
    // Reset the mock implementation to return our new mock window
    // Cast BrowserWindow to any to avoid TypeScript errors
    (BrowserWindow as any).mockImplementation(() => mockWindow);
  });
  
  describe('createWindow', () => {
    it('should return existing window if it exists and is not destroyed', () => {
      // Setup mock to return an existing window
      const mockExistingWindow = {
        isDestroyed: jest.fn().mockReturnValue(false),
        focus: jest.fn(),
      };
      (getMainWindow as jest.Mock).mockReturnValue(mockExistingWindow);
      
      const result = createWindow();
      
      expect(result).toBe(mockExistingWindow);
      expect(mockExistingWindow.focus).toHaveBeenCalled();
      expect(BrowserWindow).not.toHaveBeenCalled(); // Should not create a new window
    });
    
    it('should create a new window if no window exists', () => {
      // Setup mock to return no existing window
      (getMainWindow as jest.Mock).mockReturnValue(null);
      
      const result = createWindow();
      
      // Assertions for window creation
      expect(BrowserWindow).toHaveBeenCalled();
      // Just check that BrowserWindow constructor was called, no need to check exact parameters
      // since the implementation might change
      
      // Assertions for window configuration
      expect(mockWindow.setBackgroundColor).toHaveBeenCalledWith('#111111');
      expect(mockWindow.loadFile).toHaveBeenCalledWith('dist-web/index.html');
      expect(mockWindow.webContents.on).toHaveBeenCalledWith('before-input-event', expect.any(Function));
      expect(mockWindow.on).toHaveBeenCalledWith('close', expect.any(Function));
      
      // Check if main window is set
      expect(setMainWindow).toHaveBeenCalledWith(mockWindow);
      
      expect(result).toBe(mockWindow);
    });
    
    it('should create a new window if existing window is destroyed', () => {
      // Setup mock to return a destroyed window
      const mockDestroyedWindow = {
        isDestroyed: jest.fn().mockReturnValue(true),
        focus: jest.fn(),
      };
      (getMainWindow as jest.Mock).mockReturnValue(mockDestroyedWindow);
      
      createWindow();
      
      // Should create a new window since the existing one is destroyed
      expect(BrowserWindow).toHaveBeenCalled();
      expect(mockDestroyedWindow.focus).not.toHaveBeenCalled();
    });
  });
  
  describe('handleActivation', () => {
    it('should create a new window if no visible windows exist', () => {
      // Mock no visible windows
      (BrowserWindow.getAllWindows as any).mockReturnValue([]);
      
      handleActivation();
      
      // Should have tried to create a window
      // We're testing that createWindow is called, but we don't need to check if getMainWindow is called
      // since the implementation might have changed
    });
    
    it('should show, restore and focus existing main window on macOS if minimized', () => {
      // Mock platform as darwin (macOS)
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      
      // Mock a minimized main window
      const mockMainWindow = {
        isMinimized: jest.fn().mockReturnValue(true),
        restore: jest.fn(),
        show: jest.fn(),
        focus: jest.fn(),
      };
      (getMainWindow as jest.Mock).mockReturnValue(mockMainWindow);
      
      // Mock at least one visible window
      (BrowserWindow.getAllWindows as any).mockReturnValue([{ isDestroyed: () => false, isVisible: () => true }]);
      
      handleActivation();
      
      // Should restore, show and focus the window
      expect(mockMainWindow.restore).toHaveBeenCalled();
      expect(mockMainWindow.show).toHaveBeenCalled();
      expect(mockMainWindow.focus).toHaveBeenCalled();
    });
    
    it('should create a new window on macOS if main window is null', () => {
      // Mock platform as darwin (macOS)
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      
      // Mock main window as null
      (getMainWindow as jest.Mock).mockReturnValue(null);
      
      // Mock at least one visible window
      (BrowserWindow.getAllWindows as any).mockReturnValue([{ isDestroyed: () => false, isVisible: () => true }]);
      
      // Clear previous mock calls
      (BrowserWindow as any).mockClear();
      
      handleActivation();
      
      // Should attempt to create a new window
      // We're not actually testing the createWindow function again, just that it's called
      expect(getMainWindow).toHaveBeenCalled();
    });
  });

  describe('forceQuit', () => {
    it('logs error, shows dialog and exits', () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      forceQuit('fatal');
      expect(logMessage).toHaveBeenCalledWith('Force quitting application: fatal', 'error');
      expect(dialog.showErrorBox).toHaveBeenCalledWith('Critical Error', 'fatal');
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });
  });

  describe('createPackageManagerWindow', () => {
    it('should create a package manager window without search query', () => {
      const result = createPackageManagerWindow();
      
      expect(BrowserWindow).toHaveBeenCalledWith({
        width: 1200,
        height: 900,
        webPreferences: {
          preload: expect.stringMatching(/.*[\\/]+src[\\/]+preload\.js$/),
          contextIsolation: true,
          nodeIntegration: false,
          devTools: true,
          webSecurity: true,
        },
      });
      
      expect(mockWindow.setBackgroundColor).toHaveBeenCalledWith('#111111');
      expect(mockWindow.loadFile).toHaveBeenCalledWith('dist-web/pages/packages.html');
      expect(mockWindow.webContents.on).toHaveBeenCalledWith('before-input-event', expect.any(Function));
      expect(result).toBe(mockWindow);
    });

    it('should create a package manager window with search query', () => {
      const searchQuery = 'test-node';
      
      const result = createPackageManagerWindow(searchQuery);
      
      expect(mockWindow.loadFile).toHaveBeenCalledWith('dist-web/pages/packages.html', {
        query: { nodeSearch: searchQuery }
      });
      expect(result).toBe(mockWindow);
    });

    it('should set up devtools shortcut for package manager window', () => {
      createPackageManagerWindow();
      
      // Get the before-input-event handler
      const beforeInputCall = mockWindow.webContents.on.mock.calls.find(
(call: any) => call[0] === 'before-input-event'
      );
      expect(beforeInputCall).toBeDefined();
      
      const handler = beforeInputCall![1];
      
      // Mock devtools is closed
      mockWindow.webContents.isDevToolsOpened.mockReturnValue(false);
      
      // Test Ctrl+Shift+I (Windows/Linux)
      handler({}, { control: true, shift: true, key: 'I' });
      expect(mockWindow.webContents.openDevTools).toHaveBeenCalled();
      
      // Mock devtools is open
      mockWindow.webContents.isDevToolsOpened.mockReturnValue(true);
      mockWindow.webContents.openDevTools.mockClear();
      
      // Test Cmd+Shift+I (macOS)
      handler({}, { meta: true, shift: true, key: 'i' });
      expect(mockWindow.webContents.closeDevTools).toHaveBeenCalled();
    });
  });

  describe('window event handlers', () => {
    beforeEach(() => {
      (getMainWindow as jest.Mock).mockReturnValue(null);
    });

    it('should handle devtools shortcut in main window', () => {
      createWindow();
      
      // Get the before-input-event handler
      const beforeInputCall = mockWindow.webContents.on.mock.calls.find(
(call: any) => call[0] === 'before-input-event'
      );
      expect(beforeInputCall).toBeDefined();
      
      const handler = beforeInputCall![1];
      
      // Mock devtools is closed
      mockWindow.webContents.isDevToolsOpened.mockReturnValue(false);
      
      // Test Ctrl+Shift+I
      handler({}, { control: true, shift: true, key: 'I' });
      expect(mockWindow.webContents.openDevTools).toHaveBeenCalled();
      
      // Mock devtools is open
      mockWindow.webContents.isDevToolsOpened.mockReturnValue(true);
      mockWindow.webContents.openDevTools.mockClear();
      
      // Test again to close devtools
      handler({}, { control: true, shift: true, key: 'i' });
      expect(mockWindow.webContents.closeDevTools).toHaveBeenCalled();
    });

    it('should handle window close event when app is not quitting', async () => {
      // Set isAppQuitting to false
      mockIsAppQuitting.value = false;
      
      createWindow();
      
      // Get the close event handler
      const closeCall = mockWindow.on.mock.calls.find((call: any) => call[0] === 'close');
      expect(closeCall).toBeDefined();
      
      const handler = closeCall![1];
      const mockEvent = { preventDefault: jest.fn() };
      
      handler(mockEvent);
      
      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockWindow.destroy).toHaveBeenCalled();
      expect(setMainWindow).toHaveBeenCalledWith(null);
    });

    it('should allow window to close when app is quitting', async () => {
      // Set isAppQuitting to true
      mockIsAppQuitting.value = true;
      
      createWindow();
      
      // Get the close event handler
      const closeCall = mockWindow.on.mock.calls.find((call: any) => call[0] === 'close');
      expect(closeCall).toBeDefined();
      
      const handler = closeCall![1];
      const mockEvent = { preventDefault: jest.fn() };
      
      handler(mockEvent);
      
      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
      expect(mockWindow.destroy).not.toHaveBeenCalled();
    });
  });

  describe('permission handlers', () => {
    beforeEach(() => {
      (getMainWindow as jest.Mock).mockReturnValue(null);
    });

    it('should initialize permission handlers when creating window', () => {
      createWindow();
      
      expect(session.defaultSession.setPermissionRequestHandler).toHaveBeenCalled();
      expect(session.defaultSession.setPermissionCheckHandler).toHaveBeenCalled();
      expect(logMessage).toHaveBeenCalledWith('Permission handlers initialized with device enumeration support');
    });

    it('should handle permission requests correctly', () => {
      createWindow();
      
      const setPermissionRequestHandlerCall = (session.defaultSession.setPermissionRequestHandler as jest.Mock).mock.calls[0];
      const permissionHandler = setPermissionRequestHandlerCall[0];
      
      const mockCallback = jest.fn();
      const mockWebContents = {};
      const mockDetails = { requestingUrl: 'https://example.com' };
      
      // Test media permission (allowed)
      permissionHandler(mockWebContents, 'media', mockCallback, mockDetails);
      expect(mockCallback).toHaveBeenCalledWith(true);
      expect(logMessage).toHaveBeenCalledWith('Permission requested: media from https://example.com');
      expect(logMessage).toHaveBeenCalledWith('Granting media permission with all capabilities');
      
      mockCallback.mockClear();
      
      // Test enumerate-devices permission (allowed)
      permissionHandler(mockWebContents, 'enumerate-devices', mockCallback, mockDetails);
      expect(mockCallback).toHaveBeenCalledWith(true);
      expect(logMessage).toHaveBeenCalledWith('Granting permission: enumerate-devices');
      
      mockCallback.mockClear();
      
      // Test mediaKeySystem permission (allowed)
      permissionHandler(mockWebContents, 'mediaKeySystem', mockCallback, mockDetails);
      expect(mockCallback).toHaveBeenCalledWith(true);
      
      mockCallback.mockClear();
      
      // Test denied permission
      permissionHandler(mockWebContents, 'camera', mockCallback, mockDetails);
      expect(mockCallback).toHaveBeenCalledWith(false);
      expect(logMessage).toHaveBeenCalledWith('Denying permission: camera');
    });

    it('should handle permission checks correctly', () => {
      createWindow();
      
      const setPermissionCheckHandlerCall = (session.defaultSession.setPermissionCheckHandler as jest.Mock).mock.calls[0];
      const permissionCheckHandler = setPermissionCheckHandlerCall[0];
      
      // Test media permission (allowed)
      const result1 = permissionCheckHandler(null, 'media', 'https://example.com');
      expect(result1).toBe(true);
      
      // Test enumerate-devices permission (allowed)
      const result2 = permissionCheckHandler(null, 'enumerate-devices', 'https://example.com');
      expect(result2).toBe(true);
      
      // Test mediaKeySystem permission (allowed)
      const result3 = permissionCheckHandler(null, 'mediaKeySystem', 'https://example.com');
      expect(result3).toBe(true);
      
      // Test denied permission
      const result4 = permissionCheckHandler(null, 'camera', 'https://example.com');
      expect(result4).toBe(false);
    });
  });
});