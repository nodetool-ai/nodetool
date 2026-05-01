import { getMainWindow, setMainWindow, serverState } from '../state';
import { BrowserWindow } from 'electron';

// Mock BrowserWindow
const mockBrowserWindow = {} as BrowserWindow;

describe('State', () => {
  beforeEach(() => {
    // Reset main window to null
    setMainWindow(null);
  });

  describe('serverState', () => {
    it('should have default values', () => {
      expect(serverState.isStarted).toBe(false);
      expect(serverState.bootMsg).toBe('Initializing...');
      expect(serverState.initialURL).toBe('http://127.0.0.1:7777');
      expect(serverState.logs).toEqual([]);
      expect(serverState.serverPort).toBe(7777);
    });

  });

  describe('mainWindow management', () => {
    it('should return null initially', () => {
      expect(getMainWindow()).toBeNull();
    });

    it('should set and get main window', () => {
      setMainWindow(mockBrowserWindow);
      expect(getMainWindow()).toBe(mockBrowserWindow);
    });

    it('should set main window to null', () => {
      setMainWindow(mockBrowserWindow);
      expect(getMainWindow()).toBe(mockBrowserWindow);
      
      setMainWindow(null);
      expect(getMainWindow()).toBeNull();
    });
  });
});