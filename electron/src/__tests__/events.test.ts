import { jest } from '@jest/globals';
import { BrowserWindow } from 'electron';

jest.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: jest.fn(),
  },
}));

const mockWebContents = { send: jest.fn() };
const mockWindow = {
  webContents: mockWebContents,
  isDestroyed: jest.fn().mockReturnValue(false)
} as unknown as Electron.BrowserWindow;

(BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockWindow]);

const mockServerState = {
  isStarted: false,
  bootMsg: '',
  initialURL: 'http://localhost',
  logs: [] as string[],
};

jest.mock('../state', () => ({
  getMainWindow: jest.fn(),
  serverState: mockServerState,
}));

jest.mock('../types.d', () => ({
  IpcChannels: {
    BOOT_MESSAGE: 'boot-message',
    SERVER_STARTED: 'server-started',
    SERVER_LOG: 'server-log',
    UPDATE_PROGRESS: 'update-progress',
    SERVER_ERROR: 'server-error',
    SHOW_PACKAGE_MANAGER: 'show-package-manager',
  },
}));

import { getMainWindow } from '../state';
import {
  emitBootMessage,
  emitServerStarted,
  emitServerLog,
  emitUpdateProgress,
} from '../events';

const getMainWindowMock = getMainWindow as jest.Mock;

describe('events module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockServerState.isStarted = false;
    mockServerState.bootMsg = '';
    mockServerState.logs.length = 0;
    mockWebContents.send.mockClear();
  });

  it('emitBootMessage updates state and sends message', () => {
    emitBootMessage('Ready');
    expect(mockServerState.bootMsg).toBe('Ready');
    expect(mockWebContents.send).toHaveBeenCalledWith('boot-message', 'Ready');
  });

  it('emitServerStarted updates state and notifies renderer', () => {
    emitServerStarted();
    expect(mockServerState.isStarted).toBe(true);
    expect(mockWebContents.send).toHaveBeenCalledWith('server-started');
  });

  it('emitServerLog pushes log and sends to renderer', () => {
    emitServerLog('log');
    expect(mockServerState.logs).toContain('log');
    expect(mockWebContents.send).toHaveBeenCalledWith('server-log', 'log');
  });

  it('emitUpdateProgress sends progress data', () => {
    emitUpdateProgress('comp', 50, 'downloading', '1m');
    expect(mockWebContents.send).toHaveBeenCalledWith('update-progress', {
      componentName: 'comp',
      progress: 50,
      action: 'downloading',
      eta: '1m',
    });
  });

  it('handles missing window gracefully', () => {
    (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([]);
    emitBootMessage('No window');
    expect(mockWebContents.send).not.toHaveBeenCalled();
  });
});

