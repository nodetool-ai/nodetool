
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
    SERVER_ERROR: 'server-error',
    SHOW_ITEM_IN_FOLDER: 'show-item-in-folder',
    START_SERVER: 'start-server',
    RESTART_SERVER: 'restart-server',
    SHOW_PACKAGE_MANAGER: 'show-package-manager',
    PACKAGE_LIST_AVAILABLE: 'package-list-available',
    PACKAGE_LIST_INSTALLED: 'package-list-installed',
    PACKAGE_INSTALL: 'package-install',
    PACKAGE_UNINSTALL: 'package-uninstall',
    PACKAGE_UPDATE: 'package-update',
    PACKAGE_SEARCH_NODES: 'package-search-nodes',
    PACKAGE_OPEN_EXTERNAL: 'package-open-external',
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
}));

jest.mock('../window', () => ({
  createPackageManagerWindow: jest.fn(),
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
    },
    globalShortcut: {
      unregister: jest.fn(),
    },
    shell: {
      openExternal: jest.fn(),
    },
  };
});

import { ipcMain, BrowserWindow, clipboard, globalShortcut, shell } from 'electron';
import { getServerState, openLogFile, runApp, showItemInFolder, initializeBackendServer, stopServer } from '../server';
import { logMessage } from '../logger';
import { registerWorkflowShortcut, setupWorkflowShortcuts } from '../shortcuts';
import { updateTrayMenu } from '../tray';
import { createPackageManagerWindow } from '../window';
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
  SERVER_ERROR: 'server-error',
  SHOW_ITEM_IN_FOLDER: 'show-item-in-folder',
  START_SERVER: 'start-server',
  RESTART_SERVER: 'restart-server',
  SHOW_PACKAGE_MANAGER: 'show-package-manager',
  PACKAGE_LIST_AVAILABLE: 'package-list-available',
  PACKAGE_LIST_INSTALLED: 'package-list-installed',
  PACKAGE_INSTALL: 'package-install',
  PACKAGE_UNINSTALL: 'package-uninstall',
  PACKAGE_UPDATE: 'package-update',
  PACKAGE_SEARCH_NODES: 'package-search-nodes',
  PACKAGE_OPEN_EXTERNAL: 'package-open-external',
  PACKAGE_UPDATES_AVAILABLE: 'package-updates-available',
};

const ipcMainMock = ipcMain as jest.Mocked<typeof ipcMain>;
const browserWindowMock = BrowserWindow as jest.Mocked<typeof BrowserWindow>;
const clipboardMock = clipboard as jest.Mocked<typeof clipboard>;
const globalShortcutMock = globalShortcut as jest.Mocked<typeof globalShortcut>;

const serverMock = {
  getServerState: getServerState as jest.MockedFunction<typeof getServerState>,
  openLogFile: openLogFile as jest.MockedFunction<typeof openLogFile>,
  runApp: runApp as jest.MockedFunction<typeof runApp>,
  showItemInFolder: showItemInFolder as jest.MockedFunction<typeof showItemInFolder>,
  initializeBackendServer: initializeBackendServer as jest.MockedFunction<typeof initializeBackendServer>,
  stopServer: stopServer as jest.MockedFunction<typeof stopServer>,
};

const packageManagerMock = {
  fetchAvailablePackages: fetchAvailablePackages as jest.MockedFunction<typeof fetchAvailablePackages>,
  listInstalledPackages: listInstalledPackages as jest.MockedFunction<typeof listInstalledPackages>,
  installPackage: installPackage as jest.MockedFunction<typeof installPackage>,
  uninstallPackage: uninstallPackage as jest.MockedFunction<typeof uninstallPackage>,
  updatePackage: updatePackage as jest.MockedFunction<typeof updatePackage>,
  validateRepoId: validateRepoId as jest.MockedFunction<typeof validateRepoId>,
  searchNodes: searchNodes as jest.MockedFunction<typeof searchNodes>,
  checkForPackageUpdates: checkForPackageUpdates as jest.MockedFunction<
    typeof checkForPackageUpdates
  >,
};

const loggerMock = logMessage as jest.MockedFunction<typeof logMessage>;
const registerWorkflowShortcutMock = registerWorkflowShortcut as jest.MockedFunction<typeof registerWorkflowShortcut>;
const setupWorkflowShortcutsMock = setupWorkflowShortcuts as jest.MockedFunction<typeof setupWorkflowShortcuts>;
const updateTrayMenuMock = updateTrayMenu as jest.MockedFunction<typeof updateTrayMenu>;
const createPackageManagerWindowMock = createPackageManagerWindow as jest.MockedFunction<typeof createPackageManagerWindow>;
const shellMock = shell as jest.Mocked<typeof shell>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('IPC utilities', () => {
  it('createIpcMainHandler registers handler with ipcMain.handle', () => {
    const handler = jest.fn();
    createIpcMainHandler(Channels.CLIPBOARD_READ_TEXT as any, handler);
    expect(ipcMainMock.handle).toHaveBeenCalledWith(
      Channels.CLIPBOARD_READ_TEXT,
      expect.any(Function)
    );
  });

  it('createIpcOnceHandler registers handler with ipcMain.once', () => {
    const handler = jest.fn();
    createIpcOnceHandler(Channels.BOOT_MESSAGE as any, handler as any);
    expect(ipcMainMock.once).toHaveBeenCalledWith(
      Channels.BOOT_MESSAGE,
      expect.any(Function)
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

  it('should handle createIpcMainHandler with removeHandler error', () => {
    const handler = jest.fn();
    ipcMainMock.removeHandler.mockImplementation(() => {
      throw new Error('Remove handler error');
    });
    
    createIpcMainHandler(Channels.CLIPBOARD_READ_TEXT as any, handler);
    
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
      const showItemHandler = ipcMainMock.handle.mock.calls.find(
        ([channel]) => channel === Channels.SHOW_ITEM_IN_FOLDER
      )?.[1] as any;

      await showItemHandler({}, '/path/to/file');
      expect(serverMock.showItemInFolder).toHaveBeenCalledWith('/path/to/file');
    });

    it('should handle START_SERVER', async () => {
      const startServerHandler = ipcMainMock.handle.mock.calls.find(
        ([channel]) => channel === Channels.START_SERVER
      )?.[1] as any;

      await startServerHandler({});
      expect(serverMock.initializeBackendServer).toHaveBeenCalled();
      expect(setupWorkflowShortcutsMock).toHaveBeenCalled();
    });

    it('should handle RESTART_SERVER', async () => {
      const restartServerHandler = ipcMainMock.handle.mock.calls.find(
        ([channel]) => channel === Channels.RESTART_SERVER
      )?.[1] as any;

      await restartServerHandler({});
      expect(serverMock.stopServer).toHaveBeenCalled();
      expect(serverMock.initializeBackendServer).toHaveBeenCalled();
      expect(setupWorkflowShortcutsMock).toHaveBeenCalled();
    });

    it('should handle RESTART_SERVER with stop server error', async () => {
      serverMock.stopServer.mockRejectedValue(new Error('Stop error'));
      
      const restartServerHandler = ipcMainMock.handle.mock.calls.find(
        ([channel]) => channel === Channels.RESTART_SERVER
      )?.[1] as any;

      await restartServerHandler({});
      expect(loggerMock).toHaveBeenCalledWith(
        expect.stringContaining('Error while stopping server for restart'),
        'warn'
      );
    });

    it('should handle SHOW_PACKAGE_MANAGER', async () => {
      const showPackageManagerHandler = ipcMainMock.handle.mock.calls.find(
        ([channel]) => channel === Channels.SHOW_PACKAGE_MANAGER
      )?.[1] as any;

      await showPackageManagerHandler({}, 'search-term');
      expect(createPackageManagerWindowMock).toHaveBeenCalledWith('search-term');

      await showPackageManagerHandler({}, undefined);
      expect(createPackageManagerWindowMock).toHaveBeenCalledWith(undefined);
    });

    it('should handle PACKAGE_LIST_AVAILABLE', async () => {
      const packages = [{ id: 'pkg1', name: 'Package 1' }];
      packageManagerMock.fetchAvailablePackages.mockResolvedValue(packages);
      
      const listAvailableHandler = ipcMainMock.handle.mock.calls.find(
        ([channel]) => channel === Channels.PACKAGE_LIST_AVAILABLE
      )?.[1] as any;

      const result = await listAvailableHandler({});
      expect(packageManagerMock.fetchAvailablePackages).toHaveBeenCalled();
      expect(result).toBe(packages);
    });

    it('should handle PACKAGE_LIST_INSTALLED', async () => {
      const packages = [{ id: 'installed1', name: 'Installed 1' }];
      packageManagerMock.listInstalledPackages.mockResolvedValue(packages);
      
      const listInstalledHandler = ipcMainMock.handle.mock.calls.find(
        ([channel]) => channel === Channels.PACKAGE_LIST_INSTALLED
      )?.[1] as any;

      const result = await listInstalledHandler({});
      expect(packageManagerMock.listInstalledPackages).toHaveBeenCalled();
      expect(result).toBe(packages);
    });

    it('should handle PACKAGE_INSTALL with valid repo', async () => {
      packageManagerMock.validateRepoId.mockReturnValue({ valid: true });
      packageManagerMock.installPackage.mockResolvedValue({ success: true });
      
      const installHandler = ipcMainMock.handle.mock.calls.find(
        ([channel]) => channel === Channels.PACKAGE_INSTALL
      )?.[1] as any;

      const result = await installHandler({}, { repo_id: 'valid-repo' });
      expect(packageManagerMock.validateRepoId).toHaveBeenCalledWith('valid-repo');
      expect(packageManagerMock.installPackage).toHaveBeenCalledWith('valid-repo');
      expect(result).toEqual({ success: true });
    });

    it('should handle PACKAGE_INSTALL with invalid repo', async () => {
      packageManagerMock.validateRepoId.mockReturnValue({ valid: false, error: 'Invalid repo' });
      
      const installHandler = ipcMainMock.handle.mock.calls.find(
        ([channel]) => channel === Channels.PACKAGE_INSTALL
      )?.[1] as any;

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
      
      const uninstallHandler = ipcMainMock.handle.mock.calls.find(
        ([channel]) => channel === Channels.PACKAGE_UNINSTALL
      )?.[1] as any;

      const result = await uninstallHandler({}, { repo_id: 'valid-repo' });
      expect(packageManagerMock.validateRepoId).toHaveBeenCalledWith('valid-repo');
      expect(packageManagerMock.uninstallPackage).toHaveBeenCalledWith('valid-repo');
      expect(result).toEqual({ success: true });
    });

    it('should handle PACKAGE_UPDATE with valid repo', async () => {
      packageManagerMock.validateRepoId.mockReturnValue({ valid: true });
      packageManagerMock.updatePackage.mockResolvedValue({ success: true });
      
      const updateHandler = ipcMainMock.handle.mock.calls.find(
        ([channel]) => channel === Channels.PACKAGE_UPDATE
      )?.[1] as any;

      const result = await updateHandler({}, 'valid-repo');
      expect(packageManagerMock.validateRepoId).toHaveBeenCalledWith('valid-repo');
      expect(packageManagerMock.updatePackage).toHaveBeenCalledWith('valid-repo');
      expect(result).toEqual({ success: true });
    });

    it('should handle PACKAGE_SEARCH_NODES', async () => {
      const searchResults = [{ id: 'node1', name: 'Node 1' }];
      packageManagerMock.searchNodes.mockResolvedValue(searchResults);
      
      const searchHandler = ipcMainMock.handle.mock.calls.find(
        ([channel]) => channel === Channels.PACKAGE_SEARCH_NODES
      )?.[1] as any;

      const result = await searchHandler({}, 'search-query');
      expect(packageManagerMock.searchNodes).toHaveBeenCalledWith('search-query');
      expect(result).toBe(searchResults);

      // Test with empty query
      await searchHandler({}, '');
      expect(packageManagerMock.searchNodes).toHaveBeenCalledWith('');
    });

    it('should handle PACKAGE_SEARCH_NODES with error', async () => {
      packageManagerMock.searchNodes.mockRejectedValue(new Error('Search error'));
      
      const searchHandler = ipcMainMock.handle.mock.calls.find(
        ([channel]) => channel === Channels.PACKAGE_SEARCH_NODES
      )?.[1] as any;

      const result = await searchHandler({}, 'query');
      expect(loggerMock).toHaveBeenCalledWith(
        expect.stringContaining('Error in PACKAGE_SEARCH_NODES'),
        'warn'
      );
      expect(result).toEqual([]);
    });

    it('should handle PACKAGE_OPEN_EXTERNAL', async () => {
      const openExternalHandler = ipcMainMock.handle.mock.calls.find(
        ([channel]) => channel === Channels.PACKAGE_OPEN_EXTERNAL
      )?.[1] as any;

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

      const closeHandler = ipcMainMock.on.mock.calls.find(
        ([channel]) => channel === Channels.WINDOW_CLOSE
      )?.[1] as any;

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

      const minimizeHandler = ipcMainMock.on.mock.calls.find(
        ([channel]) => channel === Channels.WINDOW_MINIMIZE
      )?.[1] as any;

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

      const maximizeHandler = ipcMainMock.on.mock.calls.find(
        ([channel]) => channel === Channels.WINDOW_MAXIMIZE
      )?.[1] as any;

      maximizeHandler({});
      expect(loggerMock).toHaveBeenCalledWith(
        expect.stringContaining('Error in window maximize'),
        'error'
      );
    });

    it('should handle null window in close', () => {
      browserWindowMock.getFocusedWindow.mockReturnValue(null);

      const closeHandler = ipcMainMock.on.mock.calls.find(
        ([channel]) => channel === Channels.WINDOW_CLOSE
      )?.[1] as any;

      closeHandler({});
      // Should not throw or call window methods
    });
  });
});
