import { jest } from '@jest/globals';

const mockServerState = {
  isStarted: false,
  bootMsg: '',
  initialURL: 'http://localhost',
  logs: [] as string[],
};

const mockWebContents = { send: jest.fn() };
const mockWindow = { webContents: mockWebContents, isDestroyed: jest.fn().mockReturnValue(false) } as any;

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
  });

  it('emitBootMessage updates state and sends message', () => {
    getMainWindowMock.mockReturnValue(mockWindow);
    emitBootMessage('Ready');
    expect(mockServerState.bootMsg).toBe('Ready');
    expect(mockWebContents.send).toHaveBeenCalledWith('boot-message', 'Ready');
  });

  it('emitServerStarted updates state and notifies renderer', () => {
    getMainWindowMock.mockReturnValue(mockWindow);
    emitServerStarted();
    expect(mockServerState.isStarted).toBe(true);
    expect(mockWebContents.send).toHaveBeenCalledWith('server-started');
  });

  it('emitServerLog pushes log and sends to renderer', () => {
    getMainWindowMock.mockReturnValue(mockWindow);
    emitServerLog('log');
    expect(mockServerState.logs).toContain('log');
    expect(mockWebContents.send).toHaveBeenCalledWith('server-log', 'log');
  });

  it('emitUpdateProgress sends progress data', () => {
    getMainWindowMock.mockReturnValue(mockWindow);
    emitUpdateProgress('comp', 50, 'downloading', '1m');
    expect(mockWebContents.send).toHaveBeenCalledWith('update-progress', {
      componentName: 'comp',
      progress: 50,
      action: 'downloading',
      eta: '1m',
    });
  });

  it('handles missing window gracefully', () => {
    getMainWindowMock.mockReturnValue(null);
    emitBootMessage('No window');
    expect(mockWebContents.send).not.toHaveBeenCalled();
  });
});

