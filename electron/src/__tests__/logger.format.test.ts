import path from "path";

/**
 * Tests for logger.ts covering the uncovered paths:
 * - getLogStream: stream reuse (already open), dir exists (skip mkdir),
 *   stream error callback, createWriteStream failure
 * - logMessage: writes to stream, handles null stream, catches electron-log
 *   throwing, error formatting for Error vs non-Error
 * - closeLogStream: closes active stream, no-ops when already null/destroyed
 */
describe("logger — uncovered paths", () => {
  const originalConsoleError = console.error;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  // ---------------------------------------------------------------------------
  // Helpers to build a fresh logger module with custom mocks
  // ---------------------------------------------------------------------------
  function makeElectronLogSpies() {
    return { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  }

  function makeSystemPathsMock() {
    return {
      getSystemDataPath: jest
        .fn()
        .mockImplementation((rel: string) => path.join("/mock/system", rel)),
    };
  }

  async function loadLoggerWith(opts: {
    existsSync?: jest.Mock;
    mkdirSync?: jest.Mock;
    createWriteStream?: jest.Mock;
    electronLog?: ReturnType<typeof makeElectronLogSpies>;
  }) {
    const electronLog = opts.electronLog ?? makeElectronLogSpies();
    const existsSyncMock = opts.existsSync ?? jest.fn().mockReturnValue(true);
    const mkdirSyncMock = opts.mkdirSync ?? jest.fn();
    const createWriteStreamMock =
      opts.createWriteStream ??
      jest.fn().mockReturnValue({
        write: jest.fn(),
        end: jest.fn(),
        destroyed: false,
        on: jest.fn(),
      });

    jest.doMock("fs", () => ({
      createWriteStream: createWriteStreamMock,
      existsSync: existsSyncMock,
      mkdirSync: mkdirSyncMock,
    }));
    jest.doMock("electron-log", () => electronLog);
    jest.doMock("../systemPaths", () => makeSystemPathsMock());

    jest.unmock("../logger");
    const mod = await import("../logger");
    return {
      mod,
      electronLog,
      existsSyncMock,
      mkdirSyncMock,
      createWriteStreamMock,
    };
  }

  // ---------------------------------------------------------------------------
  // getLogStream — stream reuse
  // ---------------------------------------------------------------------------
  describe("getLogStream stream reuse", () => {
    it("reuses an existing non-destroyed stream on subsequent calls", async () => {
      const writeMock = jest.fn();
      const fakeStream = {
        write: writeMock,
        end: jest.fn(),
        destroyed: false,
        on: jest.fn(),
      };
      const createWriteStreamMock = jest.fn().mockReturnValue(fakeStream);

      const { mod } = await loadLoggerWith({ createWriteStream: createWriteStreamMock });

      // First call creates the stream
      mod.logMessage("first");
      expect(createWriteStreamMock).toHaveBeenCalledTimes(1);

      // Second call should reuse — createWriteStream not called again
      mod.logMessage("second");
      expect(createWriteStreamMock).toHaveBeenCalledTimes(1);
      expect(writeMock).toHaveBeenCalledTimes(2);
      expect(writeMock).toHaveBeenNthCalledWith(1, "first\n");
      expect(writeMock).toHaveBeenNthCalledWith(2, "second\n");
    });

    it("creates a new stream when the previous one is destroyed", async () => {
      let destroyed = false;
      const writeMock = jest.fn();
      const fakeStream = {
        write: writeMock,
        end: jest.fn(),
        get destroyed() {
          return destroyed;
        },
        on: jest.fn(),
      };
      const createWriteStreamMock = jest.fn().mockReturnValue(fakeStream);

      const { mod } = await loadLoggerWith({ createWriteStream: createWriteStreamMock });

      mod.logMessage("first");
      expect(createWriteStreamMock).toHaveBeenCalledTimes(1);

      // Simulate stream being destroyed externally
      destroyed = true;

      mod.logMessage("second");
      // Should create a new stream since old one is destroyed
      expect(createWriteStreamMock).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------------
  // getLogStream — directory creation
  // ---------------------------------------------------------------------------
  describe("getLogStream directory handling", () => {
    it("skips mkdirSync when the log directory already exists", async () => {
      const existsSyncMock = jest.fn().mockReturnValue(true);
      const mkdirSyncMock = jest.fn();

      const { mod } = await loadLoggerWith({
        existsSync: existsSyncMock,
        mkdirSync: mkdirSyncMock,
      });

      mod.logMessage("test");
      expect(existsSyncMock).toHaveBeenCalled();
      expect(mkdirSyncMock).not.toHaveBeenCalled();
    });

    it("calls mkdirSync with recursive when the log directory does not exist", async () => {
      const existsSyncMock = jest.fn().mockReturnValue(false);
      const mkdirSyncMock = jest.fn();

      const { mod } = await loadLoggerWith({
        existsSync: existsSyncMock,
        mkdirSync: mkdirSyncMock,
      });

      mod.logMessage("test");
      expect(mkdirSyncMock).toHaveBeenCalledWith(
        expect.any(String),
        { recursive: true }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getLogStream — stream error callback
  // ---------------------------------------------------------------------------
  describe("getLogStream stream error callback", () => {
    it("nullifies the stream and logs to console on stream error", async () => {
      const writeMock = jest.fn();
      let errorHandler: ((err: Error) => void) | undefined;
      const fakeStream = {
        write: writeMock,
        end: jest.fn(),
        destroyed: false,
        on: jest.fn((event: string, handler: (err: Error) => void) => {
          if (event === "error") {
            errorHandler = handler;
          }
        }),
      };
      const createWriteStreamMock = jest.fn().mockReturnValue(fakeStream);
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const { mod } = await loadLoggerWith({ createWriteStream: createWriteStreamMock });

      // Trigger stream creation
      mod.logMessage("before error");
      expect(errorHandler).toBeDefined();

      // Simulate a stream error
      const streamErr = new Error("disk full");
      errorHandler!(streamErr);

      expect(consoleErrorSpy).toHaveBeenCalledWith("Log stream error:", streamErr);

      // After error, stream is nullified — next logMessage should create new stream
      mod.logMessage("after error");
      expect(createWriteStreamMock).toHaveBeenCalledTimes(2);

      consoleErrorSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // logMessage — null stream (getLogStream returns null)
  // ---------------------------------------------------------------------------
  describe("logMessage with null stream", () => {
    it("does not throw when getLogStream returns null", async () => {
      const createWriteStreamMock = jest.fn(() => {
        throw new Error("cannot create stream");
      });
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const { mod, electronLog } = await loadLoggerWith({
        createWriteStream: createWriteStreamMock,
      });

      expect(() => mod.logMessage("still works")).not.toThrow();
      // electron-log should still have been called
      expect(electronLog.info).toHaveBeenCalledWith("still works");

      consoleErrorSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // logMessage — electron-log throws
  // ---------------------------------------------------------------------------
  describe("logMessage error handling", () => {
    it("catches Error thrown by electron-log and logs error.message", async () => {
      const electronLog = makeElectronLogSpies();
      electronLog.info.mockImplementation(() => {
        throw new Error("electron-log broke");
      });
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const { mod } = await loadLoggerWith({ electronLog });

      expect(() => mod.logMessage("boom")).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error in log function: electron-log broke"
      );

      consoleErrorSpy.mockRestore();
    });

    it("catches non-Error thrown by electron-log and stringifies it", async () => {
      const electronLog = makeElectronLogSpies();
      electronLog.warn.mockImplementation(() => {
        throw "string error"; // eslint-disable-line no-throw-literal
      });
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const { mod } = await loadLoggerWith({ electronLog });

      expect(() => mod.logMessage("boom", "warn")).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error in log function: string error"
      );

      consoleErrorSpy.mockRestore();
    });

    it("catches numeric error thrown by electron-log", async () => {
      const electronLog = makeElectronLogSpies();
      electronLog.error.mockImplementation(() => {
        throw 42; // eslint-disable-line no-throw-literal
      });
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const { mod } = await loadLoggerWith({ electronLog });

      expect(() => mod.logMessage("boom", "error")).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error in log function: 42"
      );

      consoleErrorSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // logMessage — level routing
  // ---------------------------------------------------------------------------
  describe("logMessage level routing", () => {
    it("routes to log.info for default level", async () => {
      const { mod, electronLog } = await loadLoggerWith({});
      mod.logMessage("info msg");
      expect(electronLog.info).toHaveBeenCalledWith("info msg");
      expect(electronLog.warn).not.toHaveBeenCalled();
      expect(electronLog.error).not.toHaveBeenCalled();
    });

    it("routes to log.warn for warn level", async () => {
      const { mod, electronLog } = await loadLoggerWith({});
      mod.logMessage("warn msg", "warn");
      expect(electronLog.warn).toHaveBeenCalledWith("warn msg");
      expect(electronLog.info).not.toHaveBeenCalled();
      expect(electronLog.error).not.toHaveBeenCalled();
    });

    it("routes to log.error for error level", async () => {
      const { mod, electronLog } = await loadLoggerWith({});
      mod.logMessage("error msg", "error");
      expect(electronLog.error).toHaveBeenCalledWith("error msg");
      expect(electronLog.info).not.toHaveBeenCalled();
      expect(electronLog.warn).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // logMessage — trimming edge cases
  // ---------------------------------------------------------------------------
  describe("logMessage trimming", () => {
    it("trims leading whitespace", async () => {
      const { mod, electronLog } = await loadLoggerWith({});
      mod.logMessage("   leading");
      expect(electronLog.info).toHaveBeenCalledWith("leading");
    });

    it("trims trailing whitespace", async () => {
      const { mod, electronLog } = await loadLoggerWith({});
      mod.logMessage("trailing   ");
      expect(electronLog.info).toHaveBeenCalledWith("trailing");
    });

    it("trims newlines and tabs", async () => {
      const { mod, electronLog } = await loadLoggerWith({});
      mod.logMessage("\n\ttabbed\n");
      expect(electronLog.info).toHaveBeenCalledWith("tabbed");
    });

    it("handles empty string after trimming", async () => {
      const { mod, electronLog } = await loadLoggerWith({});
      mod.logMessage("   ");
      expect(electronLog.info).toHaveBeenCalledWith("");
    });
  });

  // ---------------------------------------------------------------------------
  // logMessage — file write
  // ---------------------------------------------------------------------------
  describe("logMessage file write", () => {
    it("appends newline to message when writing to stream", async () => {
      const writeMock = jest.fn();
      const fakeStream = {
        write: writeMock,
        end: jest.fn(),
        destroyed: false,
        on: jest.fn(),
      };
      const createWriteStreamMock = jest.fn().mockReturnValue(fakeStream);

      const { mod } = await loadLoggerWith({ createWriteStream: createWriteStreamMock });

      mod.logMessage("hello world");
      expect(writeMock).toHaveBeenCalledWith("hello world\n");
    });

    it("opens the stream in append mode", async () => {
      const fakeStream = {
        write: jest.fn(),
        end: jest.fn(),
        destroyed: false,
        on: jest.fn(),
      };
      const createWriteStreamMock = jest.fn().mockReturnValue(fakeStream);

      const { mod } = await loadLoggerWith({ createWriteStream: createWriteStreamMock });

      mod.logMessage("test");
      expect(createWriteStreamMock).toHaveBeenCalledWith(
        mod.LOG_FILE,
        { flags: "a" }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // closeLogStream
  // ---------------------------------------------------------------------------
  describe("closeLogStream", () => {
    it("calls end() on the active stream and nullifies it", async () => {
      const endMock = jest.fn();
      const fakeStream = {
        write: jest.fn(),
        end: endMock,
        destroyed: false,
        on: jest.fn(),
      };
      const createWriteStreamMock = jest.fn().mockReturnValue(fakeStream);

      const { mod } = await loadLoggerWith({ createWriteStream: createWriteStreamMock });

      // Create the stream by logging
      mod.logMessage("open stream");
      expect(createWriteStreamMock).toHaveBeenCalledTimes(1);

      // Close it
      mod.closeLogStream();
      expect(endMock).toHaveBeenCalledTimes(1);

      // Next logMessage should create a new stream (since old was closed)
      // closeLogStream sets the internal ref to null,
      // so getLogStream will create a new one.
      mod.logMessage("new stream");
      expect(createWriteStreamMock).toHaveBeenCalledTimes(2);
    });

    it("no-ops when called without an active stream", async () => {
      const { mod } = await loadLoggerWith({
        createWriteStream: jest.fn(() => {
          throw new Error("no stream");
        }),
      });
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // logMessage will fail to create stream, so internal ref stays null
      mod.logMessage("trigger");

      // closeLogStream should not throw
      expect(() => mod.closeLogStream()).not.toThrow();

      consoleErrorSpy.mockRestore();
    });

    it("no-ops when the stream is already destroyed", async () => {
      const endMock = jest.fn();
      const fakeStream = {
        write: jest.fn(),
        end: endMock,
        destroyed: false,
        on: jest.fn(),
      };
      const createWriteStreamMock = jest.fn().mockReturnValue(fakeStream);

      const { mod } = await loadLoggerWith({ createWriteStream: createWriteStreamMock });

      // Create the stream
      mod.logMessage("open");

      // Simulate stream being destroyed externally
      fakeStream.destroyed = true;

      // closeLogStream should not call end on a destroyed stream
      mod.closeLogStream();
      expect(endMock).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // LOG_FILE
  // ---------------------------------------------------------------------------
  describe("LOG_FILE constant", () => {
    it("includes the logs subdirectory and nodetool.log filename", async () => {
      const { mod } = await loadLoggerWith({});
      expect(mod.LOG_FILE).toContain("logs");
      expect(mod.LOG_FILE).toMatch(/nodetool\.log$/);
    });
  });
});
