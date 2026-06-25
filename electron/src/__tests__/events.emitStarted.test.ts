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

import {
  emitBootMessage,
  emitServerStarted,
  emitUpdateProgress
} from "../events";

describe("emitBootMessage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockServerState.bootMsg = "";
    mockWebContents.send.mockClear();
    (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockWindow]);
  });

  it("stores the message in serverState.bootMsg", () => {
    emitBootMessage("Loading models…");
    expect(mockServerState.bootMsg).toBe("Loading models…");
  });

  it("broadcasts BOOT_MESSAGE to renderer windows", () => {
    emitBootMessage("Starting server");
    expect(mockWebContents.send).toHaveBeenCalledWith(
      "boot-message",
      "Starting server"
    );
  });

  it("overwrites previous boot message", () => {
    emitBootMessage("first");
    emitBootMessage("second");
    expect(mockServerState.bootMsg).toBe("second");
  });

  it("skips destroyed windows", () => {
    const destroyed = {
      webContents: { send: jest.fn() },
      isDestroyed: jest.fn().mockReturnValue(true)
    } as unknown as Electron.BrowserWindow;
    (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([
      destroyed,
      mockWindow
    ]);

    emitBootMessage("hello");
    expect(destroyed.webContents.send).not.toHaveBeenCalled();
    expect(mockWebContents.send).toHaveBeenCalled();
  });

  it("broadcasts to multiple non-destroyed windows", () => {
    const secondContents = { send: jest.fn() };
    const secondWindow = {
      webContents: secondContents,
      isDestroyed: jest.fn().mockReturnValue(false)
    } as unknown as Electron.BrowserWindow;
    (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([
      mockWindow,
      secondWindow
    ]);

    emitBootMessage("broadcast");
    expect(mockWebContents.send).toHaveBeenCalledWith(
      "boot-message",
      "broadcast"
    );
    expect(secondContents.send).toHaveBeenCalledWith(
      "boot-message",
      "broadcast"
    );
  });
});

describe("emitServerStarted", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockServerState.isStarted = false;
    mockServerState.status = "idle";
    mockServerState.error = "old error";
    mockWebContents.send.mockClear();
    (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockWindow]);
  });

  it("sets isStarted to true", () => {
    emitServerStarted();
    expect(mockServerState.isStarted).toBe(true);
  });

  it("sets status to 'started'", () => {
    emitServerStarted();
    expect(mockServerState.status).toBe("started");
  });

  it("clears any previous error", () => {
    emitServerStarted();
    expect(mockServerState.error).toBeUndefined();
  });

  it("broadcasts SERVER_STARTED to renderer windows", () => {
    emitServerStarted();
    expect(mockWebContents.send).toHaveBeenCalledWith("server-started");
  });
});

describe("emitUpdateProgress", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWebContents.send.mockClear();
    (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockWindow]);
  });

  it("broadcasts UPDATE_PROGRESS with component details", () => {
    emitUpdateProgress("Python", 0.5, "Installing");
    expect(mockWebContents.send).toHaveBeenCalledWith("update-progress", {
      componentName: "Python",
      progress: 0.5,
      action: "Installing",
      eta: undefined
    });
  });

  it("includes optional eta field", () => {
    emitUpdateProgress("Models", 0.75, "Downloading", "2 min");
    expect(mockWebContents.send).toHaveBeenCalledWith("update-progress", {
      componentName: "Models",
      progress: 0.75,
      action: "Downloading",
      eta: "2 min"
    });
  });

  it("handles zero progress", () => {
    emitUpdateProgress("Server", 0, "Starting");
    expect(mockWebContents.send).toHaveBeenCalledWith("update-progress", {
      componentName: "Server",
      progress: 0,
      action: "Starting",
      eta: undefined
    });
  });
});
