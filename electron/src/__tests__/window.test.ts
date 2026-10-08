import { BrowserWindow, dialog, session } from 'electron';
import { createWindow, handleActivation, forceQuit, _resetPermissionHandlersForTesting } from '../window';
import { setMainWindow, getMainWindow } from '../state';
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
      setWindowOpenHandler: jest.fn(),
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
    shell: {
      openExternal: jest.fn().mockResolvedValue(undefined),
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
  serverState: { serverPort: 7777 },
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

/**
 * The BrowserWindow members these tests drive. Typing the listener registrars
 * is what lets `.mock.calls.find(...)` read `call[0]` as the event name.
 */
type Listener = (...args: never[]) => void;

interface MockWindow {
  setBackgroundColor: jest.Mock;
  loadFile: jest.Mock;
  webContents: {
    on: jest.Mock<void, [string, Listener]>;
    setWindowOpenHandler: jest.Mock;
    openDevTools: jest.Mock;
    closeDevTools: jest.Mock;
    isDevToolsOpened: jest.Mock<boolean, []>;
  };
  on: jest.Mock<void, [string, Listener]>;
  focus: jest.Mock;
  destroy: jest.Mock;
  isDestroyed: jest.Mock<boolean, []>;
  isVisible: jest.Mock<boolean, []>;
  isMinimized: jest.Mock<boolean, []>;
  restore: jest.Mock;
  show: jest.Mock;
}

describe('Window Module', () => {
  let mockWindow: MockWindow;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a mock window with all required methods for testing
    mockWindow = {
      setBackgroundColor: jest.fn(),
      loadFile: jest.fn(),
      webContents: {
        on: jest.fn(),
        setWindowOpenHandler: jest.fn(),
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

      // Migration guard (Electron 35 → 39): the secure webPreferences set
      // must remain locked. Electron 39 deprecates `nodeIntegration`
      // permissively but still requires `contextIsolation: true`. Pin
      // the exact values so a regression at upgrade time is loud.
      const ctorArgs = (BrowserWindow as any).mock.calls[0][0];
      expect(ctorArgs.webPreferences).toEqual(
        expect.objectContaining({
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
          devTools: true,
        }),
      );
      expect(ctorArgs.webPreferences.preload).toEqual(expect.any(String));
      expect(ctorArgs.webPreferences.preload).toMatch(/preload\.js$/);
      
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
      (BrowserWindow as any).mockClear();

      handleActivation();

      expect(BrowserWindow).toHaveBeenCalled();
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

  describe('window event handlers', () => {
    beforeEach(() => {
      (getMainWindow as jest.Mock).mockReturnValue(null);
    });

    it('should handle devtools shortcut in main window', () => {
      createWindow();
      
      // Get the before-input-event handler
      const beforeInputCall = mockWindow.webContents.on.mock.calls.find(
(call) => call[0] === 'before-input-event'
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
      const closeCall = mockWindow.on.mock.calls.find((call) => call[0] === 'close');
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
      const closeCall = mockWindow.on.mock.calls.find((call) => call[0] === 'close');
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
      _resetPermissionHandlersForTesting();
    });

    it('should initialize permission handlers when creating window', () => {
      createWindow();

      expect(session.defaultSession.setPermissionRequestHandler).toHaveBeenCalled();
      expect(session.defaultSession.setPermissionCheckHandler).toHaveBeenCalled();
      expect(logMessage).toHaveBeenCalledWith('Permission handlers initialized with device enumeration support');
    });

    const requestHandler = () =>
      (session.defaultSession.setPermissionRequestHandler as jest.Mock).mock.calls[0][0];
    const checkHandler = () =>
      (session.defaultSession.setPermissionCheckHandler as jest.Mock).mock.calls[0][0];
    const headersHandler = () =>
      (session.defaultSession.webRequest.onHeadersReceived as jest.Mock).mock.calls[0][1];

    const request = (permission: string, requestingUrl: string): boolean => {
      const callback = jest.fn();
      requestHandler()({}, permission, callback, { requestingUrl });
      return callback.mock.calls[0][0];
    };

    it('grants device and clipboard permissions to the app pages', () => {
      createWindow();

      for (const url of ['http://127.0.0.1:7777/editor/test', 'file:///app/dist-web/index.html']) {
        expect(request('media', url)).toBe(true);
        expect(request('enumerate-devices', url)).toBe(true);
        expect(request('clipboard-sanitized-write', url)).toBe(true);
      }
      expect(checkHandler()(null, 'media', 'http://127.0.0.1:7777')).toBe(true);
      expect(logMessage).toHaveBeenCalledWith('Granting permission: media');
    });

    it('denies device and clipboard permissions to third-party frames', () => {
      createWindow();

      for (const url of ['https://example.com', 'http://127.0.0.1:11434/', 'data:text/html,x']) {
        expect(request('media', url)).toBe(false);
        expect(request('enumerate-devices', url)).toBe(false);
        expect(request('clipboard-sanitized-write', url)).toBe(false);
      }
      expect(checkHandler()(null, 'media', 'https://example.com')).toBe(false);
      expect(checkHandler()(null, 'enumerate-devices', 'https://example.com')).toBe(false);
      expect(logMessage).toHaveBeenCalledWith('Denying permission: media');
    });

    it('grants fullscreen and mediaKeySystem to any frame', () => {
      createWindow();

      expect(request('fullscreen', 'https://example.com')).toBe(true);
      expect(request('mediaKeySystem', 'https://example.com')).toBe(true);
      expect(checkHandler()(null, 'mediaKeySystem', 'https://example.com')).toBe(true);
    });

    it('denies permissions outside the allow-lists', () => {
      createWindow();

      expect(request('camera', 'http://127.0.0.1:7777/')).toBe(false);
      expect(request('geolocation', 'http://127.0.0.1:7777/')).toBe(false);
      expect(checkHandler()(null, 'camera', 'https://example.com')).toBe(false);
    });

    describe('CORS relaxation', () => {
      const respond = (frame: { url: string } | null | undefined) => {
        const callback = jest.fn();
        headersHandler()(
          { frame, responseHeaders: { 'content-type': ['application/json'] } },
          callback,
        );
        return callback.mock.calls[0][0].responseHeaders;
      };

      it('adds CORS headers for requests from the app pages', () => {
        createWindow();

        expect(respond({ url: 'http://127.0.0.1:7777/' })['Access-Control-Allow-Origin']).toEqual(['*']);
        expect(respond({ url: 'file:///app/dist-web/pages/logs.html' })['Access-Control-Allow-Origin']).toEqual(['*']);
      });

      it('leaves headers untouched for third-party or frameless requests', () => {
        createWindow();

        for (const frame of [{ url: 'https://example.com/' }, null, undefined]) {
          expect(respond(frame)).toEqual({ 'content-type': ['application/json'] });
        }
      });
    });
  });
});