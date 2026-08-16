
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
    CLIPBOARD_READ_FILE_PATHS: 'clipboard-read-file-paths',
    CLIPBOARD_READ_BUFFER: 'clipboard-read-buffer',
    CLIPBOARD_GET_CONTENT_INFO: 'clipboard-get-content-info',
    CLIPBOARD_AVAILABLE_FORMATS: 'clipboard-available-formats',
    ON_CREATE_WORKFLOW: 'on-create-workflow',
    ON_UPDATE_WORKFLOW: 'on-update-workflow',
    ON_DELETE_WORKFLOW: 'on-delete-workflow',
    BOOT_MESSAGE: 'boot-message',
    SERVER_ERROR: 'server-error',
    SHOW_ITEM_IN_FOLDER: 'show-item-in-folder',
    START_SERVER: 'start-server',
    RESTART_SERVER: 'restart-server',
    PACKAGE_LIST_AVAILABLE: 'package-list-available',
    PACKAGE_LIST_INSTALLED: 'package-list-installed',
    PACKAGE_INSTALL: 'package-install',
    PACKAGE_UNINSTALL: 'package-uninstall',
    PACKAGE_UPDATE: 'package-update',
    PACKAGE_SEARCH_NODES: 'package-search-nodes',
    PACKAGE_OPEN_EXTERNAL: 'package-open-external',
    DIALOG_OPEN_FILE: 'dialog-open-file',
    DIALOG_OPEN_FOLDER: 'dialog-open-folder',
  },
  IpcEvents: {},
  IpcResponse: {},
}));

jest.mock('../server', () => ({
  getServerState: jest.fn(),
  openLogFile: jest.fn(),
  runApp: jest.fn(),
  showItemInFolder: jest.fn(),
  initializeBackendServer: jest.fn(),
  stopServer: jest.fn(),
}));

jest.mock('../logger', () => ({
  logMessage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../shortcuts', () => ({
  registerWorkflowShortcut: jest.fn(),
  setupWorkflowShortcuts: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../tray', () => ({
  updateTrayMenu: jest.fn(),
  emitWorkflowsChanged: jest.fn(),
}));

jest.mock('../window', () => ({
  openSettingsInMainWindow: jest.fn(),
}));

jest.mock('../packageManager', () => ({
  fetchAvailablePackages: jest.fn(),
  listInstalledPackages: jest.fn(),
  installPackage: jest.fn(),
  uninstallPackage: jest.fn(),
  updatePackage: jest.fn(),
  validateRepoId: jest.fn(),
  searchNodes: jest.fn(),
  checkForPackageUpdates: jest.fn(),
}));

jest.mock('electron', () => {
  return {
    app: {
      isPackaged: false,
      getPath: jest.fn().mockReturnValue('/mock/userData'),
      on: jest.fn(),
    },
    ipcMain: {
      handle: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      removeHandler: jest.fn(),
    },
    BrowserWindow: {
      getFocusedWindow: jest.fn(),
    },
    clipboard: {
      writeText: jest.fn(),
      readText: jest.fn(),
      read: jest.fn(),
      readBuffer: jest.fn(),
      availableFormats: jest.fn().mockReturnValue([]),
    },
    globalShortcut: {
      unregister: jest.fn(),
    },
    shell: {
      openExternal: jest.fn(),
    },
    dialog: {
      showOpenDialog: jest.fn(),
    },
  };
});

import { ipcMain, BrowserWindow, clipboard, globalShortcut, shell, dialog } from 'electron';
import { getServerState, openLogFile, runApp, showItemInFolder, initializeBackendServer, stopServer } from '../server';
import { logMessage } from '../logger';
import { registerWorkflowShortcut, setupWorkflowShortcuts } from '../shortcuts';
import { emitWorkflowsChanged } from '../tray';
import {
  fetchAvailablePackages,
  listInstalledPackages,
  installPackage,
  uninstallPackage,
  updatePackage,
  validateRepoId,
  searchNodes,
  checkForPackageUpdates,
} from '../packageManager';
import {
  createIpcMainHandler,
  initializeIpcHandlers,
} from '../ipc';
import type {
  ClipboardContentInfo,
  DialogOpenResult,
  IpcRequest,
  ServerState,
} from '../types.d';

const Channels = {
  CLIPBOARD_WRITE_TEXT: 'clipboard-write-text',
  CLIPBOARD_READ_TEXT: 'clipboard-read-text',
  CLIPBOARD_READ_FILE_PATHS: 'clipboard-read-file-paths',
  CLIPBOARD_READ_BUFFER: 'clipboard-read-buffer',
  CLIPBOARD_GET_CONTENT_INFO: 'clipboard-get-content-info',
  CLIPBOARD_AVAILABLE_FORMATS: 'clipboard-available-formats',
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
  SERVER_ERROR: 'server-error',
  SHOW_ITEM_IN_FOLDER: 'show-item-in-folder',
  START_SERVER: 'start-server',
  RESTART_SERVER: 'restart-server',
  PACKAGE_LIST_AVAILABLE: 'package-list-available',
  PACKAGE_LIST_INSTALLED: 'package-list-installed',
  PACKAGE_INSTALL: 'package-install',
  PACKAGE_UNINSTALL: 'package-uninstall',
  PACKAGE_UPDATE: 'package-update',
  PACKAGE_SEARCH_NODES: 'package-search-nodes',
  PACKAGE_OPEN_EXTERNAL: 'package-open-external',
  PACKAGE_UPDATES_AVAILABLE: 'package-updates-available',
  DIALOG_OPEN_FILE: 'dialog-open-file',
  DIALOG_OPEN_FOLDER: 'dialog-open-folder',
};

const ipcMainMock = jest.mocked(ipcMain);
const browserWindowMock = jest.mocked(BrowserWindow);
const dialogMock = jest.mocked(dialog);
const clipboardMock = jest.mocked(clipboard);
const globalShortcutMock = jest.mocked(globalShortcut);

const serverMock = {
  getServerState: jest.mocked(getServerState),
  openLogFile: jest.mocked(openLogFile),
  runApp: jest.mocked(runApp),
  showItemInFolder: jest.mocked(showItemInFolder),
  initializeBackendServer: jest.mocked(initializeBackendServer),
  stopServer: jest.mocked(stopServer),
};

const packageManagerMock = {
  fetchAvailablePackages: jest.mocked(fetchAvailablePackages),
  listInstalledPackages: jest.mocked(listInstalledPackages),
  installPackage: jest.mocked(installPackage),
  uninstallPackage: jest.mocked(uninstallPackage),
  updatePackage: jest.mocked(updatePackage),
  validateRepoId: jest.mocked(validateRepoId),
  searchNodes: jest.mocked(searchNodes),
  checkForPackageUpdates: jest.mocked(checkForPackageUpdates),
};

const loggerMock = jest.mocked(logMessage);
const registerWorkflowShortcutMock = jest.mocked(registerWorkflowShortcut);
const setupWorkflowShortcutsMock = jest.mocked(setupWorkflowShortcuts);
const emitWorkflowsChangedMock = jest.mocked(emitWorkflowsChanged);
const shellMock = jest.mocked(shell);

/**
 * The callbacks `initializeIpcHandlers` registered, read back off the mocked
 * `ipcMain`. Their real signatures are per-channel generics over `IpcRequest`;
 * these tests drive one channel at a time with hand-built payloads.
 */
type IpcInvokeHandler<R> = (
  event: unknown,
  ...args: unknown[]
) => Promise<R> | R;
type IpcListener = (event: unknown, ...args: unknown[]) => void;

/** Pass the channel's `IpcResponse` type when the test reads the result. */
const invokeHandlerFor = <R = unknown>(channel: string): IpcInvokeHandler<R> => {
  const registration = ipcMainMock.handle.mock.calls.find(
    ([registered]) => registered === channel
  );
  if (!registration) {
    throw new Error(`no invoke handler registered for channel ${channel}`);
  }
  // SAFETY: the recorded callback is the channel's real handler; `R` is the
  // response type of the one channel this call names, which the test picks.
  return registration[1] as IpcInvokeHandler<R>;
};

const listenerFor = (channel: string): IpcListener => {
  const registration = ipcMainMock.on.mock.calls.find(
    ([registered]) => registered === channel
  );
  if (!registration) {
    throw new Error(`no listener registered for channel ${channel}`);
  }
  // SAFETY: the recorded callback is the channel's real listener; the tests
  // drive it with hand-built payloads instead of a real `IpcMainEvent`.
  return registration[1] as IpcListener;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('IPC utilities', () => {
  it('createIpcMainHandler registers handler with ipcMain.handle', () => {
    const handler = jest.fn();
    createIpcMainHandler(
      Channels.CLIPBOARD_READ_TEXT as keyof IpcRequest,
      handler
    );
    expect(ipcMainMock.handle).toHaveBeenCalledWith(
      Channels.CLIPBOARD_READ_TEXT,
      expect.any(Function)
    );
  });

});

describe('initializeIpcHandlers', () => {
  it('registers handlers and triggers clipboard functions', async () => {
    clipboardMock.readText.mockReturnValue('clipboard');
    // The handler returns whatever getServerState gave it, verbatim.
    const stubState: ServerState = {
      isStarted: true,
      status: "started",
      bootMsg: "",
      initialURL: "http://127.0.0.1:7777",
      logs: [],
    };
    serverMock.getServerState.mockReturnValue(stubState);

    initializeIpcHandlers();

    const writeHandler = invokeHandlerFor(Channels.CLIPBOARD_WRITE_TEXT);
    const readHandler = invokeHandlerFor(Channels.CLIPBOARD_READ_TEXT);
    const stateHandler = invokeHandlerFor(Channels.GET_SERVER_STATE);
    const logHandler = invokeHandlerFor(Channels.OPEN_LOG_FILE);

    await writeHandler({}, { text: 'text' });
    expect(clipboardMock.writeText).toHaveBeenCalledWith('text', undefined);

    const text = await readHandler({});
    expect(clipboardMock.readText).toHaveBeenCalled();
    expect(text).toBe('clipboard');

    const state = await stateHandler({});
    expect(serverMock.getServerState).toHaveBeenCalled();
    expect(state).toBe(stubState);

    await logHandler({});
    expect(serverMock.openLogFile).toHaveBeenCalled();
  });

  it('runs app handler and workflow handlers', async () => {
    initializeIpcHandlers();

    const runHandler = invokeHandlerFor(Channels.RUN_APP);

    await runHandler({}, '42');
    expect(loggerMock).toHaveBeenCalledWith(
      'Running app with workflow ID: 42'
    );
    expect(serverMock.runApp).toHaveBeenCalledWith('42');

    const createHandler = invokeHandlerFor(Channels.ON_CREATE_WORKFLOW);
    await createHandler({}, { name: 'wf' });
    expect(registerWorkflowShortcutMock).toHaveBeenCalled();
    expect(emitWorkflowsChangedMock).toHaveBeenCalled();

    const updateHandler = invokeHandlerFor(Channels.ON_UPDATE_WORKFLOW);
    await updateHandler({}, { name: 'wf2' });
    expect(registerWorkflowShortcutMock).toHaveBeenCalledTimes(2);

    const deleteHandler = invokeHandlerFor(Channels.ON_DELETE_WORKFLOW);
    await deleteHandler({}, { name: 'wf3', settings: { shortcut: 's' } });
    expect(globalShortcutMock.unregister).toHaveBeenCalledWith('s');
    expect(emitWorkflowsChangedMock).toHaveBeenCalledTimes(3);
  });

  it('handles window events correctly', () => {
    initializeIpcHandlers();

    const closeHandler = listenerFor(Channels.WINDOW_CLOSE);
    const minimizeHandler = listenerFor(Channels.WINDOW_MINIMIZE);
    const maximizeHandler = listenerFor(Channels.WINDOW_MAXIMIZE);

    const mockWindow = {
      close: jest.fn(),
      minimize: jest.fn(),
      maximize: jest.fn(),
      unmaximize: jest.fn(),
      isMaximized: jest.fn().mockReturnValue(false),
    };
    // SAFETY: `getFocusedWindow` is a `jest.fn()` in this file's electron
    // mock; the window handlers only call close/minimize/maximize/unmaximize/
    // isMaximized, all of which this stub provides.
    jest.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(mockWindow);

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

  it('should handle createIpcMainHandler with removeHandler error', () => {
    const handler = jest.fn();
    ipcMainMock.removeHandler.mockImplementation(() => {
      throw new Error('Remove handler error');
    });
    
    createIpcMainHandler(
      Channels.CLIPBOARD_READ_TEXT as keyof IpcRequest,
      handler
    );
    
    expect(loggerMock).toHaveBeenCalledWith(
      expect.stringContaining('Warning removing existing IPC handler'),
      'warn'
    );
    expect(ipcMainMock.handle).toHaveBeenCalledWith(
      Channels.CLIPBOARD_READ_TEXT,
      expect.any(Function)
    );
  });

  describe('additional IPC handlers', () => {
    beforeEach(() => {
      initializeIpcHandlers();
    });

    it('should handle SHOW_ITEM_IN_FOLDER', async () => {
      const showItemHandler = invokeHandlerFor(Channels.SHOW_ITEM_IN_FOLDER);

      await showItemHandler({}, '/path/to/file');
      expect(serverMock.showItemInFolder).toHaveBeenCalledWith('/path/to/file');
    });

    it('should handle START_SERVER', async () => {
      const startServerHandler = invokeHandlerFor(Channels.START_SERVER);

      await startServerHandler({});
      expect(serverMock.initializeBackendServer).toHaveBeenCalled();
      expect(setupWorkflowShortcutsMock).toHaveBeenCalled();
    });

    it('should handle RESTART_SERVER', async () => {
      const restartServerHandler = invokeHandlerFor(Channels.RESTART_SERVER);

      await restartServerHandler({});
      expect(serverMock.stopServer).toHaveBeenCalled();
      expect(serverMock.initializeBackendServer).toHaveBeenCalled();
      expect(setupWorkflowShortcutsMock).toHaveBeenCalled();
    });

    it('should handle RESTART_SERVER with stop server error', async () => {
      serverMock.stopServer.mockRejectedValue(new Error('Stop error'));
      
      const restartServerHandler = invokeHandlerFor(Channels.RESTART_SERVER);

      await restartServerHandler({});
      expect(loggerMock).toHaveBeenCalledWith(
        expect.stringContaining('Error while stopping server for restart'),
        'warn'
      );
    });

    it('should handle PACKAGE_LIST_AVAILABLE', async () => {
      const packages = [{ id: 'pkg1', name: 'Package 1' }];
      packageManagerMock.fetchAvailablePackages.mockResolvedValue(packages);
      
      const listAvailableHandler = invokeHandlerFor(Channels.PACKAGE_LIST_AVAILABLE);

      const result = await listAvailableHandler({});
      expect(packageManagerMock.fetchAvailablePackages).toHaveBeenCalled();
      expect(result).toBe(packages);
    });

    it('should handle PACKAGE_LIST_INSTALLED', async () => {
      const packages = [{ id: 'installed1', name: 'Installed 1' }];
      packageManagerMock.listInstalledPackages.mockResolvedValue(packages);
      
      const listInstalledHandler = invokeHandlerFor(Channels.PACKAGE_LIST_INSTALLED);

      const result = await listInstalledHandler({});
      expect(packageManagerMock.listInstalledPackages).toHaveBeenCalled();
      expect(result).toBe(packages);
    });

    it('should handle PACKAGE_INSTALL with valid repo', async () => {
      packageManagerMock.validateRepoId.mockReturnValue({ valid: true });
      packageManagerMock.installPackage.mockResolvedValue({ success: true });
      
      const installHandler = invokeHandlerFor(Channels.PACKAGE_INSTALL);

      const result = await installHandler({}, { repo_id: 'valid-repo' });
      expect(packageManagerMock.validateRepoId).toHaveBeenCalledWith('valid-repo');
      expect(packageManagerMock.installPackage).toHaveBeenCalledWith('valid-repo');
      expect(result).toEqual({ success: true });
    });

    it('should handle PACKAGE_INSTALL with invalid repo', async () => {
      packageManagerMock.validateRepoId.mockReturnValue({ valid: false, error: 'Invalid repo' });
      
      const installHandler = invokeHandlerFor(Channels.PACKAGE_INSTALL);

      const result = await installHandler({}, { repo_id: 'invalid-repo' });
      expect(result).toEqual({
        success: false,
        message: 'Invalid repo'
      });
      expect(packageManagerMock.installPackage).not.toHaveBeenCalled();
    });

    it('should handle PACKAGE_UNINSTALL with valid repo', async () => {
      packageManagerMock.validateRepoId.mockReturnValue({ valid: true });
      packageManagerMock.uninstallPackage.mockResolvedValue({ success: true });
      
      const uninstallHandler = invokeHandlerFor(Channels.PACKAGE_UNINSTALL);

      const result = await uninstallHandler({}, { repo_id: 'valid-repo' });
      expect(packageManagerMock.validateRepoId).toHaveBeenCalledWith('valid-repo');
      expect(packageManagerMock.uninstallPackage).toHaveBeenCalledWith('valid-repo');
      expect(result).toEqual({ success: true });
    });

    it('should handle PACKAGE_UPDATE with valid repo', async () => {
      packageManagerMock.validateRepoId.mockReturnValue({ valid: true });
      packageManagerMock.updatePackage.mockResolvedValue({ success: true });
      
      const updateHandler = invokeHandlerFor(Channels.PACKAGE_UPDATE);

      const result = await updateHandler({}, 'valid-repo');
      expect(packageManagerMock.validateRepoId).toHaveBeenCalledWith('valid-repo');
      expect(packageManagerMock.updatePackage).toHaveBeenCalledWith('valid-repo');
      expect(result).toEqual({ success: true });
    });

    it('should handle PACKAGE_SEARCH_NODES', async () => {
      const searchResults = [{ id: 'node1', name: 'Node 1' }];
      packageManagerMock.searchNodes.mockResolvedValue(searchResults);
      
      const searchHandler = invokeHandlerFor(Channels.PACKAGE_SEARCH_NODES);

      const result = await searchHandler({}, 'search-query');
      expect(packageManagerMock.searchNodes).toHaveBeenCalledWith('search-query');
      expect(result).toBe(searchResults);

      // Test with empty query
      await searchHandler({}, '');
      expect(packageManagerMock.searchNodes).toHaveBeenCalledWith('');
    });

    it('should handle PACKAGE_SEARCH_NODES with error', async () => {
      packageManagerMock.searchNodes.mockRejectedValue(new Error('Search error'));
      
      const searchHandler = invokeHandlerFor(Channels.PACKAGE_SEARCH_NODES);

      const result = await searchHandler({}, 'query');
      expect(loggerMock).toHaveBeenCalledWith(
        expect.stringContaining('Error in PACKAGE_SEARCH_NODES'),
        'warn'
      );
      expect(result).toEqual([]);
    });

    it('should handle PACKAGE_OPEN_EXTERNAL', async () => {
      const openExternalHandler = invokeHandlerFor(Channels.PACKAGE_OPEN_EXTERNAL);

      await openExternalHandler({}, 'https://example.com');
      expect(shellMock.openExternal).toHaveBeenCalledWith('https://example.com');
    });
  });

  describe('window event error handling', () => {
    beforeEach(() => {
      initializeIpcHandlers();
    });

    it('should handle errors in window close', () => {
      browserWindowMock.getFocusedWindow.mockImplementation(() => {
        throw new Error('Window error');
      });

      const closeHandler = listenerFor(Channels.WINDOW_CLOSE);

      closeHandler({});
      expect(loggerMock).toHaveBeenCalledWith(
        expect.stringContaining('Error in window close'),
        'error'
      );
    });

    it('should handle errors in window minimize', () => {
      browserWindowMock.getFocusedWindow.mockImplementation(() => {
        throw new Error('Minimize error');
      });

      const minimizeHandler = listenerFor(Channels.WINDOW_MINIMIZE);

      minimizeHandler({});
      expect(loggerMock).toHaveBeenCalledWith(
        expect.stringContaining('Error in window minimize'),
        'error'
      );
    });

    it('should handle errors in window maximize', () => {
      browserWindowMock.getFocusedWindow.mockImplementation(() => {
        throw new Error('Maximize error');
      });

      const maximizeHandler = listenerFor(Channels.WINDOW_MAXIMIZE);

      maximizeHandler({});
      expect(loggerMock).toHaveBeenCalledWith(
        expect.stringContaining('Error in window maximize'),
        'error'
      );
    });

    it('should handle null window in close', () => {
      browserWindowMock.getFocusedWindow.mockReturnValue(null);

      const closeHandler = listenerFor(Channels.WINDOW_CLOSE);

      closeHandler({});
      // Should not throw or call window methods
    });
  });

  describe('dialog handlers', () => {
    beforeEach(() => {
      initializeIpcHandlers();
    });

    it('should handle DIALOG_OPEN_FILE', async () => {
      const mockResult = { canceled: false, filePaths: ['/path/to/file.txt'] };
      dialogMock.showOpenDialog.mockResolvedValue(mockResult);

      const dialogHandler = invokeHandlerFor<DialogOpenResult>(Channels.DIALOG_OPEN_FILE);

      const result = await dialogHandler({}, { title: 'Select File', defaultPath: '/home' });
      
      expect(dialogMock.showOpenDialog).toHaveBeenCalledWith({
        title: 'Select File',
        defaultPath: '/home',
        filters: undefined,
        properties: ['openFile'],
      });
      expect(result).toEqual(mockResult);
    });

    it('should handle DIALOG_OPEN_FILE with multi-selection', async () => {
      const mockResult = { canceled: false, filePaths: ['/path/to/file1.txt', '/path/to/file2.txt'] };
      dialogMock.showOpenDialog.mockResolvedValue(mockResult);

      const dialogHandler = invokeHandlerFor<DialogOpenResult>(Channels.DIALOG_OPEN_FILE);

      const result = await dialogHandler({}, { title: 'Select Files', multiSelections: true });
      
      expect(dialogMock.showOpenDialog).toHaveBeenCalledWith({
        title: 'Select Files',
        defaultPath: undefined,
        filters: undefined,
        properties: ['openFile', 'multiSelections'],
      });
      expect(result).toEqual(mockResult);
    });

    it('should handle DIALOG_OPEN_FILE canceled', async () => {
      const mockResult = { canceled: true, filePaths: [] };
      dialogMock.showOpenDialog.mockResolvedValue(mockResult);

      const dialogHandler = invokeHandlerFor<DialogOpenResult>(Channels.DIALOG_OPEN_FILE);

      const result = await dialogHandler({}, {});
      
      expect(result.canceled).toBe(true);
      expect(result.filePaths).toEqual([]);
    });

    it('should handle DIALOG_OPEN_FOLDER', async () => {
      const mockResult = { canceled: false, filePaths: ['/path/to/folder'] };
      dialogMock.showOpenDialog.mockResolvedValue(mockResult);

      const dialogHandler = invokeHandlerFor<DialogOpenResult>(Channels.DIALOG_OPEN_FOLDER);

      const result = await dialogHandler({}, { title: 'Select Folder', defaultPath: '/home' });
      
      expect(dialogMock.showOpenDialog).toHaveBeenCalledWith({
        title: 'Select Folder',
        defaultPath: '/home',
        buttonLabel: 'Select Folder',
        properties: ['openDirectory', 'createDirectory'],
      });
      expect(result).toEqual(mockResult);
    });

    it('should handle DIALOG_OPEN_FOLDER with custom button label', async () => {
      const mockResult = { canceled: false, filePaths: ['/path/to/folder'] };
      dialogMock.showOpenDialog.mockResolvedValue(mockResult);

      const dialogHandler = invokeHandlerFor<DialogOpenResult>(Channels.DIALOG_OPEN_FOLDER);

      const result = await dialogHandler({}, { title: 'Pick Folder', buttonLabel: 'Choose' });
      
      expect(dialogMock.showOpenDialog).toHaveBeenCalledWith({
        title: 'Pick Folder',
        defaultPath: undefined,
        buttonLabel: 'Choose',
        properties: ['openDirectory', 'createDirectory'],
      });
      expect(result).toEqual(mockResult);
    });

    it('should handle DIALOG_OPEN_FOLDER canceled', async () => {
      const mockResult = { canceled: true, filePaths: [] };
      dialogMock.showOpenDialog.mockResolvedValue(mockResult);

      const dialogHandler = invokeHandlerFor<DialogOpenResult>(Channels.DIALOG_OPEN_FOLDER);

      const result = await dialogHandler({}, {});
      
      expect(result.canceled).toBe(true);
      expect(result.filePaths).toEqual([]);
    });
  });

  describe('clipboard file path handlers', () => {
    beforeEach(() => {
      initializeIpcHandlers();
    });

    it('should handle CLIPBOARD_READ_FILE_PATHS with no files', async () => {
      clipboardMock.availableFormats.mockReturnValue([]);
      clipboardMock.readText.mockReturnValue('');

      const handler = invokeHandlerFor(Channels.CLIPBOARD_READ_FILE_PATHS);

      const result = await handler({});
      expect(result).toEqual([]);
    });

    it('should handle CLIPBOARD_GET_CONTENT_INFO', async () => {
      clipboardMock.availableFormats.mockReturnValue(['text/plain', 'text/html']);

      const handler = invokeHandlerFor<ClipboardContentInfo>(Channels.CLIPBOARD_GET_CONTENT_INFO);

      const result = await handler({});
      expect(result.formats).toEqual(['text/plain', 'text/html']);
      expect(result.hasText).toBe(true);
      expect(result.hasHtml).toBe(true);
      expect(result.hasImage).toBe(false);
      expect(result.hasFiles).toBe(false);
    });

    it('should handle CLIPBOARD_READ_BUFFER', async () => {
      const mockBuffer = Buffer.from('test data');
      clipboardMock.readBuffer.mockReturnValue(mockBuffer);

      const handler = invokeHandlerFor(Channels.CLIPBOARD_READ_BUFFER);

      const result = await handler({}, 'text/plain');
      expect(result).toBe(mockBuffer.toString('base64'));
    });

    it('should handle CLIPBOARD_READ_BUFFER with empty buffer', async () => {
      clipboardMock.readBuffer.mockReturnValue(Buffer.alloc(0));

      const handler = invokeHandlerFor(Channels.CLIPBOARD_READ_BUFFER);

      const result = await handler({}, 'text/plain');
      expect(result).toBeNull();
    });
  });
});
