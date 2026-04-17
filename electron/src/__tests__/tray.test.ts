/**
 * Tray module regression tests.
 *
 * Electron 39 keeps the Tray API surface stable, but: (1) macOS template
 * image handling changed in Electron 36+, (2) `setIgnoreDoubleClickEvents`
 * is the only way to debounce clicks on Win32 — these are easy to drop
 * during a refactor. This suite locks platform branch behavior, the
 * event-emitter contract that other modules depend on, and the icon
 * path resolution.
 */

const electronMock = jest.requireActual("../__mocks__/electron");
jest.mock("electron", () => electronMock);

jest.mock("../logger", () => ({
  logMessage: jest.fn(),
  LOG_FILE: "/mock/userData/nodetool.log",
}));

jest.mock("../state", () => ({
  getMainWindow: jest.fn().mockReturnValue(null),
  serverState: { serverPort: 7777, llamaPort: undefined, status: "running" },
}));

jest.mock("../window", () => ({
  createPackageManagerWindow: jest.fn(),
  createWindow: jest.fn(),
  createLogViewerWindow: jest.fn(),
  createSettingsWindow: jest.fn(),
  handleActivation: jest.fn(),
}));

jest.mock("../server", () => ({
  stopServer: jest.fn(),
  initializeBackendServer: jest.fn(),
  isServerRunning: jest.fn().mockResolvedValue(true),
  getServerState: jest.fn().mockReturnValue({
    serverPort: 7777,
    llamaPort: undefined,
    llamaExternalManaged: false,
  }),
  isLlamaServerRunning: jest.fn().mockReturnValue(false),
  startLlamaCppService: jest.fn(),
  stopLlamaCppService: jest.fn(),
  isLlamaServerResponsive: jest.fn().mockResolvedValue(false),
}));

jest.mock("../api", () => ({
  fetchWorkflows: jest.fn().mockResolvedValue([]),
}));

jest.mock("../settings", () => ({
  readSettings: jest.fn().mockReturnValue({ windowCloseAction: "ask" }),
  readSettingsAsync: jest.fn().mockResolvedValue({ windowCloseAction: "ask" }),
  updateSetting: jest.fn(),
  getModelServiceStartupSettings: jest
    .fn()
    .mockReturnValue({ startLlamaCppOnStartup: false }),
  updateModelServiceStartupSettings: jest.fn(),
}));

jest.mock("../workflowWindow", () => ({
  createMiniAppWindow: jest.fn(),
  createChatWindow: jest.fn(),
}));

jest.mock("../config", () => ({
  getLlamaServerPath: jest.fn().mockReturnValue("/mock/conda/bin/llama-server"),
  getCondaEnvPath: jest.fn().mockReturnValue("/mock/conda"),
}));

jest.mock("../installer", () => ({
  ensureLlamaCppInstalled: jest.fn(),
}));

jest.mock("child_process", () => ({
  execSync: jest.fn(),
}));

import {
  trayEvents,
  TrayEventTypes,
  emitServerStateChanged,
  emitWorkflowsChanged,
  cleanupTrayEvents,
  createTray,
} from "../tray";

describe("tray events module", () => {
  afterEach(() => {
    cleanupTrayEvents();
  });

  test("event types are stable strings (depended on by other modules)", () => {
    expect(TrayEventTypes.SERVER_STATE_CHANGED).toBe("server-state-changed");
    expect(TrayEventTypes.WORKFLOWS_CHANGED).toBe("workflows-changed");
  });

  test("emitServerStateChanged fires SERVER_STATE_CHANGED on the shared emitter", () => {
    const handler = jest.fn();
    trayEvents.on(TrayEventTypes.SERVER_STATE_CHANGED, handler);

    emitServerStateChanged();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("emitWorkflowsChanged fires WORKFLOWS_CHANGED on the shared emitter", () => {
    const handler = jest.fn();
    trayEvents.on(TrayEventTypes.WORKFLOWS_CHANGED, handler);

    emitWorkflowsChanged();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("cleanupTrayEvents removes all listeners", () => {
    trayEvents.on(TrayEventTypes.SERVER_STATE_CHANGED, jest.fn());
    trayEvents.on(TrayEventTypes.WORKFLOWS_CHANGED, jest.fn());

    cleanupTrayEvents();

    expect(trayEvents.listenerCount(TrayEventTypes.SERVER_STATE_CHANGED)).toBe(0);
    expect(trayEvents.listenerCount(TrayEventTypes.WORKFLOWS_CHANGED)).toBe(0);
  });
});

describe("createTray platform branching", () => {
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    (electronMock.Tray as jest.Mock).mockClear();
    (electronMock.app.setAppUserModelId as jest.Mock).mockClear();
  });

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, "platform", originalPlatform);
    }
    cleanupTrayEvents();
  });

  test("on darwin/linux, uses tray-icon.png (not .ico)", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });

    await createTray();

    const ctorArg = (electronMock.Tray as jest.Mock).mock.calls[0][0];
    expect(ctorArg).toMatch(/tray-icon\.png$/);
    expect(ctorArg).not.toMatch(/\.ico$/);
    expect(electronMock.app.setAppUserModelId).not.toHaveBeenCalled();
  });

  test("on win32, uses tray-icon.ico and sets app user model id", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });

    await createTray();

    const ctorArg = (electronMock.Tray as jest.Mock).mock.calls[0][0];
    expect(ctorArg).toMatch(/tray-icon\.ico$/);
    expect(electronMock.app.setAppUserModelId).toHaveBeenCalledWith(
      "com.nodetool.desktop",
    );
  });

  test("recreating destroys the existing tray instance first", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });

    const first = await createTray();
    const destroySpy = first.destroy as jest.Mock;

    await createTray();

    expect(destroySpy).toHaveBeenCalledTimes(1);
  });
});
