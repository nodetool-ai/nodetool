import { jest } from "@jest/globals";
import { BrowserWindow } from "electron";

jest.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: jest.fn()
  }
}));

const mockWebContents = { send: jest.fn() };
const mockWindow = {
  webContents: mockWebContents,
  isDestroyed: jest.fn().mockReturnValue(false)
} as unknown as Electron.BrowserWindow;

(BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockWindow]);

const mockServerState = {
  isStarted: false,
  status: "idle" as string,
  error: undefined as string | undefined,
  bootMsg: "",
  initialURL: "http://localhost",
  logs: [] as string[]
};

jest.mock("../state", () => ({
  getMainWindow: jest.fn(),
  serverState: mockServerState
}));

jest.mock("../types.d", () => ({
  IpcChannels: {
    BOOT_MESSAGE: "boot-message",
    SERVER_STARTED: "server-started",
    SERVER_LOG: "server-log",
    SERVER_ERROR: "server-error",
    UPDATE_PROGRESS: "update-progress"
  }
}));

import { emitServerError, emitServerLog } from "../events";

describe("emitServerError", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockServerState.isStarted = true;
    mockServerState.status = "started";
    mockServerState.error = undefined;
    mockServerState.bootMsg = "";
    mockWebContents.send.mockClear();
    (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockWindow]);
  });

  it("sets status to error and isStarted to false", () => {
    emitServerError("crash");
    expect(mockServerState.status).toBe("error");
    expect(mockServerState.isStarted).toBe(false);
  });

  it("stores the error message in state.error and state.bootMsg", () => {
    emitServerError("something broke");
    expect(mockServerState.error).toBe("something broke");
    expect(mockServerState.bootMsg).toBe("something broke");
  });

  it("broadcasts SERVER_ERROR to renderer windows", () => {
    emitServerError("fail");
    expect(mockWebContents.send).toHaveBeenCalledWith("server-error", {
      message: "fail"
    });
  });

  it("skips destroyed windows", () => {
    const destroyed = {
      webContents: { send: jest.fn() },
      isDestroyed: jest.fn().mockReturnValue(true)
    } as unknown as Electron.BrowserWindow;
    (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([destroyed, mockWindow]);

    emitServerError("err");
    expect(destroyed.webContents.send).not.toHaveBeenCalled();
    expect(mockWebContents.send).toHaveBeenCalled();
  });
});

describe("emitServerLog trimming", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockServerState.logs = [];
    mockWebContents.send.mockClear();
    (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockWindow]);
  });

  it("trims logs to MAX_LOGS (5000) when exceeded", () => {
    mockServerState.logs = Array.from({ length: 5000 }, (_, i) => `log-${i}`);
    for (let i = 0; i < 10; i++) {
      emitServerLog(`new-${i}`);
    }
    expect(mockServerState.logs.length).toBeLessThanOrEqual(5000);
    expect(mockServerState.logs[mockServerState.logs.length - 1]).toBe("new-9");
  });

  it("does not trim when under MAX_LOGS", () => {
    emitServerLog("a");
    emitServerLog("b");
    expect(mockServerState.logs).toContain("a");
    expect(mockServerState.logs).toContain("b");
    expect(mockServerState.logs.length).toBe(2);
  });
});
