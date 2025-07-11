jest.mock('electron', () => {
  return {
    app: {
      isPackaged: false,
      getPath: jest.fn().mockReturnValue('/mock/userData'),
    },
    ipcMain: {
      handle: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
    },
    BrowserWindow: {
      getFocusedWindow: jest.fn(),
    },
    clipboard: {
      writeText: jest.fn(),
      readText: jest.fn(),
    },
    globalShortcut: {
      unregister: jest.fn(),
    },
  };
});

// Provide runtime values for the enums defined in the declaration file
jest.mock('../types.d', () => ({
  IpcChannels: {
    GET_SERVER_STATE: 'get-server-state',
    OPEN_LOG_FILE: 'open-log-file',
    RUN_APP: 'run-app',
    WINDOW_CLOSE: 'window-close',
    WINDOW_MINIMIZE: 'window-minimize',
    WINDOW_MAXIMIZE: 'window-maximize',
    CLIPBOARD_WRITE_TEXT: 'clipboard-write-text',
    CLIPBOARD_READ_TEXT: 'clipboard-read-text',
    ON_CREATE_WORKFLOW: 'on-create-workflow',
    ON_UPDATE_WORKFLOW: 'on-update-workflow',
    ON_DELETE_WORKFLOW: 'on-delete-workflow',
    BOOT_MESSAGE: 'boot-message',
  },
  IpcEvents: {},
  IpcResponse: {},
}));

jest.mock('../server', () => ({
  getServerState: jest.fn(),
  openLogFile: jest.fn(),
  runApp: jest.fn(),
}));

jest.mock('../logger', () => ({
  logMessage: jest.fn(),
}));

jest.mock('../shortcuts', () => ({
  registerWorkflowShortcut: jest.fn(),
}));

jest.mock('../tray', () => ({
  updateTrayMenu: jest.fn(),
}));

import { ipcMain, BrowserWindow, clipboard, globalShortcut } from 'electron';
import { getServerState, openLogFile, runApp } from '../server';
import { logMessage } from '../logger';
import { registerWorkflowShortcut } from '../shortcuts';
import { updateTrayMenu } from '../tray';
import {
  createIpcMainHandler,
  createIpcOnceHandler,
  initializeIpcHandlers,
} from '../ipc';

const Channels = {
  CLIPBOARD_WRITE_TEXT: 'clipboard-write-text',
  CLIPBOARD_READ_TEXT: 'clipboard-read-text',
  GET_SERVER_STATE: 'get-server-state',
  OPEN_LOG_FILE: 'open-log-file',
  RUN_APP: 'run-app',
  ON_CREATE_WORKFLOW: 'on-create-workflow',
  ON_UPDATE_WORKFLOW: 'on-update-workflow',
  ON_DELETE_WORKFLOW: 'on-delete-workflow',
  WINDOW_CLOSE: 'window-close',
  WINDOW_MINIMIZE: 'window-minimize',
  WINDOW_MAXIMIZE: 'window-maximize',
  BOOT_MESSAGE: 'boot-message',
};

const ipcMainMock = ipcMain as jest.Mocked<typeof ipcMain>;
const browserWindowMock = BrowserWindow as jest.Mocked<typeof BrowserWindow>;
const clipboardMock = clipboard as jest.Mocked<typeof clipboard>;
const globalShortcutMock = globalShortcut as jest.Mocked<typeof globalShortcut>;

const serverMock = {
  getServerState: getServerState as jest.MockedFunction<typeof getServerState>,
  openLogFile: openLogFile as jest.MockedFunction<typeof openLogFile>,
  runApp: runApp as jest.MockedFunction<typeof runApp>,
};

const loggerMock = logMessage as jest.MockedFunction<typeof logMessage>;
const registerWorkflowShortcutMock = registerWorkflowShortcut as jest.MockedFunction<typeof registerWorkflowShortcut>;
const updateTrayMenuMock = updateTrayMenu as jest.MockedFunction<typeof updateTrayMenu>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('IPC utilities', () => {
  it('createIpcMainHandler registers handler with ipcMain.handle', () => {
    const handler = jest.fn();
    createIpcMainHandler(Channels.CLIPBOARD_READ_TEXT as any, handler);
    expect(ipcMainMock.handle).toHaveBeenCalledWith(
      Channels.CLIPBOARD_READ_TEXT,
      handler
    );
  });

  it('createIpcOnceHandler registers handler with ipcMain.once', () => {
    const handler = jest.fn();
    createIpcOnceHandler(Channels.BOOT_MESSAGE as any, handler as any);
    expect(ipcMainMock.once).toHaveBeenCalledWith(
      Channels.BOOT_MESSAGE,
      handler
    );
  });
});

describe('initializeIpcHandlers', () => {
  it('registers handlers and triggers clipboard functions', async () => {
    clipboardMock.readText.mockReturnValue('clipboard');
    serverMock.getServerState.mockReturnValue({ running: true } as any);

    initializeIpcHandlers();

    const handleCalls = ipcMainMock.handle.mock.calls;

    const writeHandler = handleCalls.find(
      ([channel]) => channel === Channels.CLIPBOARD_WRITE_TEXT
    )?.[1] as any;
    const readHandler = handleCalls.find(
      ([channel]) => channel === Channels.CLIPBOARD_READ_TEXT
    )?.[1] as any;
    const stateHandler = handleCalls.find(
      ([channel]) => channel === Channels.GET_SERVER_STATE
    )?.[1] as any;
    const logHandler = handleCalls.find(
      ([channel]) => channel === Channels.OPEN_LOG_FILE
    )?.[1] as any;

    await writeHandler({}, 'text');
    expect(clipboardMock.writeText).toHaveBeenCalledWith('text');

    const text = await readHandler({});
    expect(clipboardMock.readText).toHaveBeenCalled();
    expect(text).toBe('clipboard');

    const state = await stateHandler({});
    expect(serverMock.getServerState).toHaveBeenCalled();
    expect(state).toEqual({ running: true });

    await logHandler({});
    expect(serverMock.openLogFile).toHaveBeenCalled();
  });

  it('runs app handler and workflow handlers', async () => {
    initializeIpcHandlers();

    const runHandler = ipcMainMock.handle.mock.calls.find(
      ([channel]) => channel === Channels.RUN_APP
    )?.[1] as any;

    await runHandler({}, '42');
    expect(loggerMock).toHaveBeenCalledWith(
      'Running app with workflow ID: 42'
    );
    expect(serverMock.runApp).toHaveBeenCalledWith('42');

    const createHandler = ipcMainMock.handle.mock.calls.find(
      ([channel]) => channel === Channels.ON_CREATE_WORKFLOW
    )?.[1] as any;
    await createHandler({}, { name: 'wf' });
    expect(registerWorkflowShortcutMock).toHaveBeenCalled();
    expect(updateTrayMenuMock).toHaveBeenCalled();

    const updateHandler = ipcMainMock.handle.mock.calls.find(
      ([channel]) => channel === Channels.ON_UPDATE_WORKFLOW
    )?.[1] as any;
    await updateHandler({}, { name: 'wf2' });
    expect(registerWorkflowShortcutMock).toHaveBeenCalledTimes(2);

    const deleteHandler = ipcMainMock.handle.mock.calls.find(
      ([channel]) => channel === Channels.ON_DELETE_WORKFLOW
    )?.[1] as any;
    await deleteHandler({}, { name: 'wf3', settings: { shortcut: 's' } });
    expect(globalShortcutMock.unregister).toHaveBeenCalledWith('s');
    expect(updateTrayMenuMock).toHaveBeenCalledTimes(3);
  });

  it('handles window events correctly', () => {
    initializeIpcHandlers();

    const closeHandler = ipcMainMock.on.mock.calls.find(
      ([channel]) => channel === Channels.WINDOW_CLOSE
    )?.[1] as any;
    const minimizeHandler = ipcMainMock.on.mock.calls.find(
      ([channel]) => channel === Channels.WINDOW_MINIMIZE
    )?.[1] as any;
    const maximizeHandler = ipcMainMock.on.mock.calls.find(
      ([channel]) => channel === Channels.WINDOW_MAXIMIZE
    )?.[1] as any;

    const mockWindow: any = {
      close: jest.fn(),
      minimize: jest.fn(),
      maximize: jest.fn(),
      unmaximize: jest.fn(),
      isMaximized: jest.fn().mockReturnValue(false),
    };
    browserWindowMock.getFocusedWindow.mockReturnValue(mockWindow);

    closeHandler({});
    expect(mockWindow.close).toHaveBeenCalled();

    minimizeHandler({});
    expect(mockWindow.minimize).toHaveBeenCalled();

    maximizeHandler({});
    expect(mockWindow.maximize).toHaveBeenCalled();

    mockWindow.isMaximized.mockReturnValue(true);
    maximizeHandler({});
    expect(mockWindow.unmaximize).toHaveBeenCalled();
  });
});
