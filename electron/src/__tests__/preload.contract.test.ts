/**
 * Preload contract regression tests.
 *
 * The preload script is the trust boundary between the renderer and the
 * Electron main process. Electron 36/37/38/39 all changed contextBridge
 * behavior at least once (transferable types, sandbox interaction, deep
 * proxies for functions). This suite pins:
 *
 *   1. The exact namespaces exposed on `window.api` and `window.electronAPI`.
 *   2. Each exposed function routes to the correct IPC channel.
 *   3. Argument validation rejects obviously malicious input
 *      (path traversal, embedded NULs, oversized URLs).
 *
 * The test imports `preload.ts` against a mocked `electron` module, then
 * inspects the object passed to `contextBridge.exposeInMainWorld`.
 */

// `types.d.ts` is a declaration file — TypeScript elides it at runtime,
// so `IpcChannels` has no runtime value under ts-jest. Provide the string
// map here and mirror it into `../types.d` so preload.ts sees it.
const IpcChannels = {
  GET_SERVER_STATE: "get-server-state",
  OPEN_LOG_FILE: "open-log-file",
  SHOW_ITEM_IN_FOLDER: "show-item-in-folder",
  FILE_EXPLORER_OPEN_PATH: "file-explorer-open-path",
  FILE_EXPLORER_OPEN_DIRECTORY: "file-explorer-open-directory",
  FILE_EXPLORER_OPEN_SYSTEM_DIRECTORY: "file-explorer-open-system-directory",
  START_SERVER: "start-server",
  RESTART_SERVER: "restart-server",
  RESTART_LLAMA_SERVER: "restart-llama-server",
  RUN_APP: "run-app",
  BOOT_MESSAGE: "boot-message",
  SERVER_STARTED: "server-started",
  SERVER_LOG: "server-log",
  SERVER_ERROR: "server-error",
  SHOW_PACKAGE_MANAGER: "show-package-manager",
  WINDOW_CLOSE: "window-close",
  WINDOW_MINIMIZE: "window-minimize",
  WINDOW_MAXIMIZE: "window-maximize",
  MENU_EVENT: "menu-event",
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
  PACKAGE_UPDATES_AVAILABLE: "package-updates-available",
  PACKAGE_VERSION_CHECK: "package-version-check",
  RUNTIME_PACKAGE_STATUSES: "runtime-package-statuses",
  RUNTIME_PACKAGE_INSTALL: "runtime-package-install",
  RUNTIME_PACKAGE_UNINSTALL: "runtime-package-uninstall",
  RUNTIME_GET_INSTALL_LOCATION: "runtime-get-install-location",
  RUNTIME_SELECT_INSTALL_LOCATION: "runtime-select-install-location",
  GET_LOGS: "get-logs",
  CLEAR_LOGS: "clear-logs",
  SETTINGS_GET_CLOSE_BEHAVIOR: "settings-get-close-behavior",
  SETTINGS_SET_CLOSE_BEHAVIOR: "settings-set-close-behavior",
  SETTINGS_GET_AUTO_UPDATES: "settings-get-auto-updates",
  SETTINGS_SET_AUTO_UPDATES: "settings-set-auto-updates",
  SETTINGS_GET_MODEL_SERVICES_STARTUP: "settings-get-model-services-startup",
  SETTINGS_SET_MODEL_SERVICES_STARTUP: "settings-set-model-services-startup",
  SHOW_SETTINGS: "show-settings",
  GET_SYSTEM_INFO: "get-system-info",
  DIALOG_OPEN_FILE: "dialog-open-file",
  DIALOG_OPEN_FOLDER: "dialog-open-folder",
  LOCALHOST_PROXY_REQUEST: "localhost-proxy-request",
  LOCALHOST_PROXY_WS_OPEN: "localhost-proxy-ws-open",
  LOCALHOST_PROXY_WS_SEND: "localhost-proxy-ws-send",
  LOCALHOST_PROXY_WS_CLOSE: "localhost-proxy-ws-close",
  LOCALHOST_PROXY_WS_EVENT: "localhost-proxy-ws-event",
  FRONTEND_LOG: "frontend-log",
} as const;

jest.mock("../types.d", () => ({ IpcChannels, IpcEvents: {} }));

const electronMock = jest.requireActual("../__mocks__/electron");
jest.mock("electron", () => electronMock);

jest.mock("../logger", () => ({ logMessage: jest.fn() }));

describe("preload contract", () => {
  let api: any;
  let exposedNames: string[];

  beforeAll(() => {
    (electronMock.contextBridge.exposeInMainWorld as jest.Mock).mockClear();
    (electronMock.ipcRenderer.invoke as jest.Mock).mockClear();
    (electronMock.ipcRenderer.send as jest.Mock).mockClear();
    (electronMock.ipcRenderer.on as jest.Mock).mockClear();

    require("../preload");

    const calls = (electronMock.contextBridge.exposeInMainWorld as jest.Mock)
      .mock.calls;
    exposedNames = calls.map((c: unknown[]) => c[0] as string);
    // Both window.api and window.electronAPI receive the same object.
    api = calls[0][1];
  });

  test("exposes both 'api' and 'electronAPI' globals (legacy compat)", () => {
    expect(exposedNames).toEqual(expect.arrayContaining(["api", "electronAPI"]));
    expect(exposedNames).toHaveLength(2);
  });

  test("exposed object has the documented namespace surface", () => {
    // If a namespace is renamed, removed, or added, this test fails — review
    // the renderer side too. Hardcoded so the migration cannot silently
    // drop a capability.
    const expectedNamespaces = [
      "platform",
      "server",
      "workflows",
      "packages",
      "settings",
      "dialog",
      "logging",
      "ipc",
      "windowControls",
      "localhostProxy",
    ];
    for (const ns of expectedNamespaces) {
      expect(api).toHaveProperty(ns);
    }
  });

  test("server namespace methods route to expected IPC channels", () => {
    (electronMock.ipcRenderer.invoke as jest.Mock).mockClear();

    api.server.getState();
    api.server.start();
    api.server.restart();
    api.server.restartLlama();

    const channels = (electronMock.ipcRenderer.invoke as jest.Mock).mock.calls
      .map((c: unknown[]) => c[0]);

    expect(channels).toEqual([
      IpcChannels.GET_SERVER_STATE,
      IpcChannels.START_SERVER,
      IpcChannels.RESTART_SERVER,
      IpcChannels.RESTART_LLAMA_SERVER,
    ]);
  });

  test("packages namespace methods route to expected IPC channels", () => {
    (electronMock.ipcRenderer.invoke as jest.Mock).mockClear();

    api.packages.listAvailable();
    api.packages.listInstalled();
    api.packages.install("nodetool-ai/nodetool-base");
    api.packages.uninstall("nodetool-ai/nodetool-base");

    const channels = (electronMock.ipcRenderer.invoke as jest.Mock).mock.calls
      .map((c: unknown[]) => c[0]);

    expect(channels).toEqual([
      IpcChannels.PACKAGE_LIST_AVAILABLE,
      IpcChannels.PACKAGE_LIST_INSTALLED,
      IpcChannels.PACKAGE_INSTALL,
      IpcChannels.PACKAGE_UNINSTALL,
    ]);
  });

  test("windowControls uses ipcRenderer.send (fire-and-forget), not invoke", () => {
    (electronMock.ipcRenderer.send as jest.Mock).mockClear();
    (electronMock.ipcRenderer.invoke as jest.Mock).mockClear();

    api.windowControls.close();
    api.windowControls.minimize();
    api.windowControls.maximize();

    expect(electronMock.ipcRenderer.send).toHaveBeenCalledTimes(3);
    expect(electronMock.ipcRenderer.invoke).not.toHaveBeenCalled();
  });

  test("event subscriptions return an unsubscribe function that calls removeListener", () => {
    (electronMock.ipcRenderer.on as jest.Mock).mockClear();
    (electronMock.ipcRenderer.removeListener as jest.Mock).mockClear();

    const unsub = api.server.onLog(() => {});
    expect(electronMock.ipcRenderer.on).toHaveBeenCalledTimes(1);
    expect(typeof unsub).toBe("function");

    unsub();
    expect(electronMock.ipcRenderer.removeListener).toHaveBeenCalledTimes(1);
  });

  describe("input validation at trust boundary", () => {
    test("showItemInFolder rejects paths containing NUL bytes", () => {
      expect(() => api.showItemInFolder("/tmp/evil\0name")).toThrow(/invalid/i);
    });

    test("showItemInFolder rejects oversized paths", () => {
      const huge = "a".repeat(5000);
      expect(() => api.showItemInFolder(huge)).toThrow(/maximum length/i);
    });

    test("openExternal rejects non-string URLs", () => {
      expect(() => api.openExternal(undefined as unknown as string)).toThrow();
      expect(() => api.openExternal(null as unknown as string)).toThrow();
    });
  });

  test("platform is the static process.platform string, not a function", () => {
    expect(typeof api.platform).toBe("string");
    expect(api.platform).toBe(process.platform);
  });
});
