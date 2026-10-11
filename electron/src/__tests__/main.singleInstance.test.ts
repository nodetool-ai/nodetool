/**
 * A second launch must exit before it can reach "ready". `app.quit()` is not
 * enough: main.ts's before-quit handler defers the quit to a backend
 * shutdown, so the quit is postponed and the duplicate could open a window.
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

describe("main.ts single-instance lock", () => {
  const savedNodeEnv = process.env.NODE_ENV;

  afterAll(() => {
    process.env.NODE_ENV = savedNodeEnv;
  });

  test("a second instance exits at once instead of quitting", () => {
    process.env.NODE_ENV = "production";
    const app = electronMock.app as typeof electronMock.app & {
      requestSingleInstanceLock?: jest.Mock;
    };
    app.requestSingleInstanceLock = jest.fn().mockReturnValue(false);
    jest.spyOn(process, "on").mockImplementation(() => process);

    require("../main");

    expect(app.requestSingleInstanceLock).toHaveBeenCalled();
    expect(app.exit).toHaveBeenCalledWith(0);
    expect(app.quit).not.toHaveBeenCalled();
  });
});
