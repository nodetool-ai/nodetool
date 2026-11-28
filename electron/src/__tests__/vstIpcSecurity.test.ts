/**
 * F4 & F13 regression tests:
 * - VST IPC handlers reject the isolated cloud window and untrusted origins.
 * - VST_EVENT broadcasts never leak plugin state to the cloud window.
 * - VST state-bearing IPC channels are quiet (no payload serialization/logging).
 */
const IpcChannels = {
  VST_STATUS: "vst-status",
  VST_SCAN: "vst-scan",
  VST_RENDER: "vst-render",
  VST_OPEN_EDITOR: "vst-open-editor",
  VST_CLOSE_EDITOR: "vst-close-editor",
  VST_LIST_PRESETS: "vst-list-presets",
  VST_SELECT_PRESET: "vst-select-preset",
  VST_GET_PARAMETERS: "vst-get-parameters",
  VST_SET_PARAMETERS: "vst-set-parameters",
  VST_EVENT: "vst-event",
  GET_SERVER_STATE: "get-server-state",
  OPEN_LOG_FILE: "open-log-file",
  SHOW_ITEM_IN_FOLDER: "show-item-in-folder",
  START_SERVER: "start-server",
  RESTART_SERVER: "restart-server",
  RUN_APP: "run-app",
  WINDOW_CLOSE: "window-close",
  WINDOW_MINIMIZE: "window-minimize",
  WINDOW_MAXIMIZE: "window-maximize",
  CLIPBOARD_WRITE_TEXT: "clipboard-write-text",
  CLIPBOARD_READ_TEXT: "clipboard-read-text",
  CLIPBOARD_READ_FILE_PATHS: "clipboard-read-file-paths",
  CLIPBOARD_READ_BUFFER: "clipboard-read-buffer",
  CLIPBOARD_GET_CONTENT_INFO: "clipboard-get-content-info",
  CLIPBOARD_AVAILABLE_FORMATS: "clipboard-available-formats",
  ON_CREATE_WORKFLOW: "on-create-workflow",
  ON_UPDATE_WORKFLOW: "on-update-workflow",
  ON_DELETE_WORKFLOW: "on-delete-workflow",
  PACKAGE_LIST_AVAILABLE: "package-list-available",
  PACKAGE_LIST_INSTALLED: "package-list-installed",
  PACKAGE_INSTALL: "package-install",
  PACKAGE_UNINSTALL: "package-uninstall",
  PACKAGE_UPDATE: "package-update",
  PACKAGE_OPEN_EXTERNAL: "package-open-external",
  PACKAGE_SEARCH_NODES: "package-search-nodes",
  PACKAGE_VERSION_CHECK: "package-version-check",
  PACKAGE_STALE_LIST: "package-stale-list",
  NODE_PACK_LIST_INSTALLED: "node-pack-list-installed",
  NODE_PACK_INSTALL: "node-pack-install",
  NODE_PACK_UNINSTALL: "node-pack-uninstall",
  NODE_PACK_TRUST: "node-pack-trust",
  NODE_PACK_GET_INSTALL_DIR: "node-pack-get-install-dir",
  BUILTIN_PACK_LIST: "builtin-pack-list",
  BUILTIN_PACK_SET_ENABLED: "builtin-pack-set-enabled",
  RUNTIME_PACKAGE_STATUSES: "runtime-package-statuses",
  RUNTIME_PACKAGE_INSTALL: "runtime-package-install",
  RUNTIME_PACKAGE_UNINSTALL: "runtime-package-UNINSTALL",
  RUNTIME_PACKAGE_UPDATE: "runtime-package-update",
  RUNTIME_GET_INSTALL_LOCATION: "runtime-get-install-location",
  RUNTIME_SELECT_INSTALL_LOCATION: "runtime-select-install-location",
  GET_LOGS: "get-logs",
  CLEAR_LOGS: "clear-logs",
  SHELL_SHOW_ITEM_IN_FOLDER: "shell-show-item-in-folder",
  SHELL_OPEN_PATH: "shell-open-path",
  SHELL_OPEN_EXTERNAL: "shell-open-external",
  SHELL_BEEP: "shell-beep",
  SETTINGS_GET_CLOSE_BEHAVIOR: "settings-get-close-behavior",
  SETTINGS_SET_CLOSE_BEHAVIOR: "settings-set-close-behavior",
  SETTINGS_GET_AUTO_UPDATES: "settings-get-auto-updates",
  SETTINGS_SET_AUTO_UPDATES: "settings-set-auto-updates",
  SETTINGS_GET_UPDATE_CHANNEL: "settings-get-update-channel",
  SETTINGS_SET_UPDATE_CHANNEL: "settings-set-update-channel",
  SHOW_SETTINGS: "show-settings",
  VAULT_LIST: "vault-list",
  VAULT_CREATE: "vault-create",
  VAULT_RENAME: "vault-rename",
  VAULT_DELETE: "vault-delete",
  VAULT_SWITCH: "vault-switch",
  FILE_EXPLORER_OPEN_PATH: "file-explorer-open-path",
  FILE_EXPLORER_OPEN_DIRECTORY: "file-explorer-open-directory",
  FILE_EXPLORER_OPEN_SYSTEM_DIRECTORY: "file-explorer-open-system-directory",
  GET_SYSTEM_INFO: "get-system-info",
  DIALOG_OPEN_FILE: "dialog-open-file",
  DIALOG_OPEN_FOLDER: "dialog-open-folder",
  FILE_READ_AS_DATA_URL: "file-read-as-data-url",
  FILE_READ_BUFFER: "file-read-buffer",
  FRONTEND_LOG: "frontend-log",
  MCP_INSTALL_BUNDLE: "mcp-install-bundle",
  CLOUD_ACCOUNT_STATE: "cloud-account-state",
  CLOUD_ACCOUNT_SIGN_IN: "cloud-account-sign-in",
  CLOUD_ACCOUNT_CANCEL_SIGN_IN: "cloud-account-cancel-sign-in",
  CLOUD_ACCOUNT_SIGN_OUT: "cloud-account-sign-out",
  CLOUD_REQUEST: "cloud-request",
  CLOUD_TRANSFER: "cloud-transfer",
  CLOUD_SOCKET_OPEN: "cloud-socket-open",
  CLOUD_SOCKET_SEND: "cloud-socket-send",
  CLOUD_SOCKET_CLOSE: "cloud-socket-close",
  CLOUD_WINDOW_OPEN: "cloud-window-open",
  CLOUD_WINDOW_ORIGIN: "cloud-window-origin",
  CLOUD_WINDOW_READY: "cloud-window-ready",
  CLOUD_WINDOW_FLUSHED: "cloud-window-flushed",
  CLOUD_LOCAL_CALL: "cloud-local-call",
  SYSTEM_NOTIFICATION_SHOW: "system-notification-show",
  MENU_SET_SNAP_TO_GRID: "menu-set-snap-to-grid",
  MENU_SET_CLOUD_TRANSFER: "menu-set-cloud-transfer",
};

jest.mock("../types.d", () => ({ IpcChannels, IpcEvents: {}, IpcResponse: {} }));
jest.mock("../logger", () => ({ logMessage: jest.fn() }));
jest.mock("../server", () => ({
  getServerState: jest.fn(),
  openLogFile: jest.fn(),
  runApp: jest.fn(),
  showItemInFolder: jest.fn(),
  initializeBackendServer: jest.fn(),
  restartServer: jest.fn(),
}));
jest.mock("../shortcuts", () => ({
  registerWorkflowShortcut: jest.fn(),
  unregisterWorkflowShortcut: jest.fn(),
  setupWorkflowShortcuts: jest.fn(),
}));
jest.mock("../tray", () => ({ emitWorkflowsChanged: jest.fn(), emitServerStateChanged: jest.fn() }));
jest.mock("../window", () => ({ openSettingsInMainWindow: jest.fn() }));
jest.mock("../menu", () => ({ setMenuCloudTransfer: jest.fn(), setMenuSnapToGrid: jest.fn() }));
jest.mock("../mcpBundle", () => ({ installMcpBundle: jest.fn() }));
jest.mock("../vaults", () => ({
  createVault: jest.fn(),
  renameVault: jest.fn(),
  deleteVault: jest.fn(),
  getVaultList: jest.fn(),
}));
jest.mock("../vaultSwitch", () => ({ applyVaultSwitch: jest.fn() }));
jest.mock("../systemNotifications", () => ({ showSystemNotification: jest.fn() }));
jest.mock("../settings", () => ({
  readSettingsAsync: jest.fn(),
  updateSetting: jest.fn(),
  getUpdateChannel: jest.fn(),
  normalizeUpdateChannel: jest.fn(),
  setUpdateChannel: jest.fn(),
}));
jest.mock("../packageManager", () => ({
  fetchAvailablePackages: jest.fn(),
  listInstalledPackages: jest.fn(),
  installPackage: jest.fn(),
  uninstallPackage: jest.fn(),
  updatePackage: jest.fn(),
  validateRepoId: jest.fn(),
  searchNodes: jest.fn(),
  checkForPackageUpdates: jest.fn(),
  listStalePackages: jest.fn(),
  getRuntimePackageStatuses: jest.fn(),
  installRuntimePackage: jest.fn(),
  uninstallRuntimePackage: jest.fn(),
  updateRuntimePackage: jest.fn(),
  getRuntimeInstallLocation: jest.fn(),
  selectRuntimeInstallLocation: jest.fn(),
}));
jest.mock("../nodePackManager", () => ({
  listInstalledNodePacks: jest.fn(),
  installNodePack: jest.fn(),
  uninstallNodePack: jest.fn(),
  trustNodePack: jest.fn(),
  getNodePackInstallDir: jest.fn(),
}));
jest.mock("../builtinPacks", () => ({
  listBuiltinPacks: jest.fn(),
  setBuiltinPackEnabled: jest.fn(),
}));
jest.mock("../cloudAccount", () => ({
  getCloudAccount: jest.fn(() => ({ state: jest.fn(), signIn: jest.fn(), cancelSignIn: jest.fn(), signOut: jest.fn(), request: jest.fn() })),
  getCloudSockets: jest.fn(() => ({ open: jest.fn(), send: jest.fn(), close: jest.fn() })),
}));

const mockCloudWindow = {
  isCloudWindow: jest.fn((id: number) => id === 99),
  originFor: jest.fn((id: number) => (id === 99 ? { server: "https://cloud.example", account: "acc-1" } : null)),
  mayCallCloud: jest.fn(() => true),
  open: jest.fn(),
  takePending: jest.fn(),
  flushed: jest.fn(),
};
jest.mock("../cloudWindowHost", () => ({
  getCloudWindow: () => mockCloudWindow,
  cloudWindowLocalCall: jest.fn(),
}));

const mockVstHost = {
  status: jest.fn(() => ({ available: true, path: "/bin/NodeToolVstHost" })),
  scan: jest.fn(async () => []),
  render: jest.fn(async () => ({ frames: 0, pcm: new Float32Array(0) })),
  openEditor: jest.fn(async () => undefined),
  closeEditor: jest.fn(async () => undefined),
  listPresets: jest.fn(async () => ({ currentPresetIndex: 0, presets: [] })),
  selectPreset: jest.fn(async () => ({ preset: { index: 0, name: "Init" }, state: "c2V0" })),
  getParameters: jest.fn(async () => ({ parameters: [] })),
  setParameters: jest.fn(async () => ({ parameters: [], state: "c2V0" })),
};

const registeredHandlers = new Map<string, (event: unknown, data?: unknown) => Promise<unknown>>();
const mockWindows: Array<{ isDestroyed: () => boolean; webContents: { id: number; getURL: () => string; send: jest.Mock } }> = [];

jest.mock("electron", () => ({
  app: { isPackaged: false, getPath: jest.fn(() => "/mock/userData"), getAppPath: jest.fn(() => "/mock/app"), on: jest.fn() },
  ipcMain: {
    handle: jest.fn((channel: string, fn: (event: unknown, data?: unknown) => Promise<unknown>) => {
      registeredHandlers.set(channel, fn);
    }),
    on: jest.fn(),
    once: jest.fn(),
    removeHandler: jest.fn(),
    removeAllListeners: jest.fn(),
  },
  BrowserWindow: {
    getAllWindows: jest.fn(() => mockWindows),
    fromWebContents: jest.fn(),
  },
  clipboard: { writeText: jest.fn(), readText: jest.fn(), availableFormats: jest.fn(() => []) },
  shell: { openExternal: jest.fn(), openPath: jest.fn(), showItemInFolder: jest.fn(), beep: jest.fn() },
  dialog: { showOpenDialog: jest.fn() },
}));

jest.mock("../vstHost", () => {
  const actual = jest.requireActual("../vstHost");
  return {
    ...actual,
    getVstHost: jest.fn(() => mockVstHost),
  };
});

import { initializeIpcHandlers } from "../ipc";
import { logMessage } from "../logger";
import * as vstHostModule from "../vstHost";

describe("VST IPC isolation (F4) and quiet logging (F13)", () => {
  beforeAll(() => {
    initializeIpcHandlers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockWindows.length = 0;
  });

  it("F4: blocks the isolated cloud window from every VST IPC channel", async () => {
    const cloudEvent = {
      sender: { id: 99, getURL: () => "http://127.0.0.1:7777/" },
      senderFrame: { url: "http://127.0.0.1:7777/" },
    };
    const vstChannels = [
      IpcChannels.VST_STATUS,
      IpcChannels.VST_SCAN,
      IpcChannels.VST_RENDER,
      IpcChannels.VST_OPEN_EDITOR,
      IpcChannels.VST_CLOSE_EDITOR,
      IpcChannels.VST_LIST_PRESETS,
      IpcChannels.VST_SELECT_PRESET,
      IpcChannels.VST_GET_PARAMETERS,
      IpcChannels.VST_SET_PARAMETERS,
    ];
    for (const ch of vstChannels) {
      const handler = registeredHandlers.get(ch);
      expect(handler).toBeDefined();
      await expect(handler!(cloudEvent, {})).rejects.toThrow(/cloud window|trusted local/i);
    }
    expect(mockVstHost.scan).not.toHaveBeenCalled();
    expect(mockVstHost.listPresets).not.toHaveBeenCalled();
    expect(mockVstHost.selectPreset).not.toHaveBeenCalled();
    expect(mockVstHost.getParameters).not.toHaveBeenCalled();
    expect(mockVstHost.setParameters).not.toHaveBeenCalled();
  });

  it("F4: blocks untrusted origins from calling VST IPC channels", async () => {
    const evilEvent = {
      sender: { id: 12, getURL: () => "https://evil.example/" },
      senderFrame: { url: "https://evil.example/" },
    };
    const handler = registeredHandlers.get(IpcChannels.VST_SCAN)!;
    await expect(handler(evilEvent, { rescan: false })).rejects.toThrow(/trusted local/i);
    expect(mockVstHost.scan).not.toHaveBeenCalled();
  });

  it("F4: does not broadcast VST_EVENT plugin state to the cloud window", () => {
    const localSend = jest.fn();
    const cloudSend = jest.fn();
    mockWindows.push(
      { isDestroyed: () => false, webContents: { id: 1, getURL: () => "http://127.0.0.1:7777/", send: localSend } },
      { isDestroyed: () => false, webContents: { id: 99, getURL: () => "http://127.0.0.1:7777/", send: cloudSend } },
    );

    const actualGetVstHost = jest.requireActual("../vstHost").getVstHost as typeof vstHostModule.getVstHost;
    const actualDispose = jest.requireActual("../vstHost").disposeVstHost as typeof vstHostModule.disposeVstHost;
    actualDispose();
    const host = actualGetVstHost();
    (host as unknown as { onEvent: (e: unknown) => void }).onEvent({
      event: "state",
      instance: "track:t1",
      state: "U0VDUkVUX1BBVENI",
    });
    actualDispose();

    expect(localSend).toHaveBeenCalledWith(IpcChannels.VST_EVENT, {
      event: "state",
      instance: "track:t1",
      state: "U0VDUkVUX1BBVENI",
    });
    expect(cloudSend).not.toHaveBeenCalled();
  });

  it("F13: keeps state-bearing VST IPC channels quiet so 8 MB state blobs are not serialized to logs", async () => {
    const localEvent = {
      sender: { id: 1, getURL: () => "http://127.0.0.1:7777/" },
      senderFrame: { url: "http://127.0.0.1:7777/" },
    };
    const payload = {
      instance: "track:t1",
      plugin: { path: "/plugins/Pad.vst3", uid: "VST3-Pad" },
      state: "SECRET_STATE_BLOB_DATA",
    };
    for (const ch of [
      IpcChannels.VST_OPEN_EDITOR,
      IpcChannels.VST_LIST_PRESETS,
      IpcChannels.VST_SELECT_PRESET,
      IpcChannels.VST_GET_PARAMETERS,
      IpcChannels.VST_SET_PARAMETERS,
    ]) {
      await registeredHandlers.get(ch)!(localEvent, payload);
    }
    const logged = jest.mocked(logMessage).mock.calls.map((c) => String(c[0]));
    expect(logged.filter((line) => line.includes("SECRET_STATE_BLOB_DATA"))).toEqual([]);
    expect(logged.filter((line) => line.startsWith("IPC → vst-"))).toEqual([]);
  });
});
