/**
 * Main process lifecycle regression tests.
 *
 * Pins the contract between `main.ts` and the Electron `app` module:
 * which events are subscribed, what each handler does on quit, second
 * instance, activation, and unhandled errors. Electron 36+ tightened
 * `before-quit` semantics and renamed several `app` events; this suite
 * locks current behavior so the migration surfaces breakage.
 */

const electronMock = jest.requireActual("../__mocks__/electron");

jest.mock("electron", () => electronMock);

jest.mock("../logger", () => ({
  logMessage: jest.fn(),
  closeLogStream: jest.fn(),
  LOG_FILE: "/mock/userData/nodetool.log",
}));

jest.mock("../window", () => ({
  createWindow: jest.fn().mockReturnValue({
    on: jest.fn(),
    show: jest.fn(),
    focus: jest.fn(),
    isDestroyed: jest.fn().mockReturnValue(false),
    webContents: { send: jest.fn() },
    loadURL: jest.fn(),
  }),
  forceQuit: jest.fn(),
  handleActivation: jest.fn(),
}));

jest.mock("../updater", () => ({
  setupAutoUpdater: jest.fn(),
}));

jest.mock("../server", () => ({
  initializeBackendServer: jest.fn().mockResolvedValue(undefined),
  stopServer: jest.fn().mockResolvedValue(undefined),
  serverState: { status: "idle", initialURL: "http://127.0.0.1:7777" },
}));

jest.mock("../python", () => ({
  verifyApplicationPaths: jest.fn().mockResolvedValue({ errors: [] }),
  isCondaEnvironmentInstalled: jest.fn().mockResolvedValue(true),
}));

jest.mock("../events", () => ({
  emitBootMessage: jest.fn(),
}));

jest.mock("../keychainPrompt", () => ({
  showKeychainExplanationIfNeeded: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../tray", () => ({
  createTray: jest.fn().mockResolvedValue({}),
  cleanupTrayEvents: jest.fn(),
}));

jest.mock("../ipc", () => ({
  initializeIpcHandlers: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../menu", () => ({
  buildMenu: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../packageManager", () => ({
  checkForPackageUpdates: jest.fn().mockResolvedValue([]),
  installExpectedPackages: jest.fn().mockResolvedValue({
    success: true,
    packagesUpdated: 0,
    packagesChecked: 0,
    failures: [],
  }),
  checkExpectedPackageVersions: jest.fn().mockResolvedValue([]),
}));

jest.mock("../settings", () => ({
  updateSetting: jest.fn(),
  readSettingsAsync: jest.fn().mockResolvedValue({ windowCloseAction: "ask" }),
}));

jest.mock("../devMode", () => ({
  isElectronDevMode: jest.fn().mockReturnValue(false),
  getWebDevServerUrl: jest.fn().mockReturnValue("http://127.0.0.1:3000"),
}));

describe("main.ts lifecycle wiring", () => {
  type EventHandler = (...args: unknown[]) => unknown;

  let appOn: jest.Mock;
  let ipcHandle: jest.Mock;
  let processOn: jest.SpyInstance;
  const appHandlers: Record<string, EventHandler> = {};
  const ipcHandlers: Record<string, EventHandler> = {};
  const processHandlers: Record<string, EventHandler> = {};

  beforeAll(() => {
    process.env.NODE_ENV = "test";

    // Capture handler registrations *before* main.ts runs.
    appOn = electronMock.app.on as jest.Mock;
    appOn.mockImplementation((event: string, handler: EventHandler) => {
      appHandlers[event] = handler;
      return electronMock.app;
    });

    ipcHandle = electronMock.ipcMain.handle as jest.Mock;
    ipcHandle.mockImplementation((channel: string, handler: EventHandler) => {
      ipcHandlers[channel] = handler;
    });

    processOn = jest
      .spyOn(process, "on")
      .mockImplementation((event: string, handler: EventHandler) => {
        processHandlers[event] = handler;
        return process;
      });

    // Importing main.ts registers all top-level lifecycle handlers as a side effect.
    require("../main");
  });

  afterAll(() => {
    processOn.mockRestore();
  });

  test("registers the app lifecycle events the migration must preserve", () => {
    // Electron 36/37/38/39 keep these names — pin them so a rename surfaces.
    expect(appHandlers).toHaveProperty("ready");
    expect(appHandlers).toHaveProperty("before-quit");
    expect(appHandlers).toHaveProperty("window-all-closed");
    expect(appHandlers).toHaveProperty("activate");
    expect(appHandlers).toHaveProperty("will-quit");
  });

  test("registers process-level error handlers (uncaught + unhandledRejection)", () => {
    expect(processHandlers).toHaveProperty("uncaughtException");
    expect(processHandlers).toHaveProperty("unhandledRejection");
  });

  test("update-installed IPC handler is registered", () => {
    expect(ipcHandlers).toHaveProperty("update-installed");
  });

  describe("before-quit handler", () => {
    test("first invocation calls stopServer; subsequent invocations do not", async () => {
      const { stopServer } = require("../server");
      (stopServer as jest.Mock).mockClear();

      await appHandlers["before-quit"]({ preventDefault: jest.fn() });
      expect(stopServer).toHaveBeenCalledTimes(1);

      await appHandlers["before-quit"]({ preventDefault: jest.fn() });
      // isAppQuitting flag should suppress further calls
      expect(stopServer).toHaveBeenCalledTimes(1);
    });
  });

  describe("window-all-closed handler", () => {
    test("'quit' setting bypasses dialog and calls app.quit", async () => {
      const { readSettingsAsync } = require("../settings");
      (readSettingsAsync as jest.Mock).mockResolvedValueOnce({
        windowCloseAction: "quit",
      });
      (electronMock.app.quit as jest.Mock).mockClear();
      (electronMock.dialog.showMessageBox as jest.Mock).mockClear();

      await appHandlers["window-all-closed"]();
      expect(electronMock.app.quit).toHaveBeenCalledTimes(1);
      expect(electronMock.dialog.showMessageBox).not.toHaveBeenCalled();
    });

    test("'background' setting keeps app running (no quit, no dialog)", async () => {
      const { readSettingsAsync } = require("../settings");
      (readSettingsAsync as jest.Mock).mockResolvedValueOnce({
        windowCloseAction: "background",
      });
      (electronMock.app.quit as jest.Mock).mockClear();
      (electronMock.dialog.showMessageBox as jest.Mock).mockClear();

      await appHandlers["window-all-closed"]();
      expect(electronMock.app.quit).not.toHaveBeenCalled();
      expect(electronMock.dialog.showMessageBox).not.toHaveBeenCalled();
    });

    test("'ask' setting opens a question dialog", async () => {
      const { readSettingsAsync } = require("../settings");
      (readSettingsAsync as jest.Mock).mockResolvedValueOnce({
        windowCloseAction: "ask",
      });
      (electronMock.dialog.showMessageBox as jest.Mock)
        .mockClear()
        .mockResolvedValueOnce({ response: 1, checkboxChecked: false });

      await appHandlers["window-all-closed"]();
      expect(electronMock.dialog.showMessageBox).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "question",
          buttons: ["Quit", "Keep Running in Background"],
        }),
      );
    });
  });

  describe("will-quit handler", () => {
    test("unregisters globalShortcut and tears down tray + log stream", () => {
      const { closeLogStream } = require("../logger");
      const { cleanupTrayEvents } = require("../tray");
      (electronMock.globalShortcut.unregisterAll as jest.Mock).mockClear();
      (cleanupTrayEvents as jest.Mock).mockClear();
      (closeLogStream as jest.Mock).mockClear();

      appHandlers["will-quit"]();

      expect(electronMock.globalShortcut.unregisterAll).toHaveBeenCalledTimes(1);
      expect(cleanupTrayEvents).toHaveBeenCalledTimes(1);
      expect(closeLogStream).toHaveBeenCalledTimes(1);
    });
  });

  describe("activate handler", () => {
    test("delegates to handleActivation from window module", () => {
      const { handleActivation } = require("../window");
      (handleActivation as jest.Mock).mockClear();

      appHandlers["activate"]();

      expect(handleActivation).toHaveBeenCalledTimes(1);
    });
  });

  describe("update-installed IPC handler", () => {
    test("opens a 'Restart Now' dialog", async () => {
      (electronMock.dialog.showMessageBox as jest.Mock)
        .mockClear()
        .mockResolvedValueOnce({ response: 0 });

      await ipcHandlers["update-installed"]();

      expect(electronMock.dialog.showMessageBox).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "info",
          title: "Update Installed",
          buttons: ["Restart Now"],
        }),
      );
    });
  });
});
