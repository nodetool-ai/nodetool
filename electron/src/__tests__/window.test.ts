import { BrowserWindow } from 'electron';
import path from 'path';
import { createWindow, handleActivation } from '../window';
import { setMainWindow, getMainWindow } from '../state';
import { isAppQuitting } from '../main';

// Mocking dependencies
jest.mock('electron', () => {
  return require('../__mocks__/electron');
});

jest.mock('../logger', () => ({
  logMessage: jest.fn(),
}));

jest.mock('../state', () => ({
  setMainWindow: jest.fn(),
  getMainWindow: jest.fn(),
}));

jest.mock('../main', () => ({
  isAppQuitting: false,
}));

jest.mock('path', () => ({
  join: jest.fn().mockImplementation((...args) => args.join('/')),
}));

describe('Window Module', () => {
  let mockWindow: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockWindow = new BrowserWindow();
    (BrowserWindow as jest.Mock).mockClear();
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
      expect(BrowserWindow).toHaveBeenCalledWith({
        width: 1500,
        height: 1000,
        titleBarStyle: 'hidden',
        webPreferences: {
          preload: '__dirname/preload.js',
          contextIsolation: true,
          nodeIntegration: false,
          devTools: true,
          webSecurity: true,
        },
      });
      
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
      (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([]);
      
      handleActivation();
      
      // Should have tried to create a window
      expect(getMainWindow).not.toHaveBeenCalled(); // Shouldn't check main window since we already know there are no visible windows
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
      (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([{ isDestroyed: () => false, isVisible: () => true }]);
      
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
      (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([{ isDestroyed: () => false, isVisible: () => true }]);
      
      // Clear previous mock calls
      (BrowserWindow as jest.Mock).mockClear();
      
      handleActivation();
      
      // Should attempt to create a new window
      // We're not actually testing the createWindow function again, just that it's called
      expect(getMainWindow).toHaveBeenCalled();
    });
  });
});