import fs from "fs";
import os from "os";
import path from "path";

jest.unmock("../logger");

jest.mock("electron-log", () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

let dataDir = "";
jest.mock("../systemPaths", () => ({
  getSystemDataPath: jest.fn((name: string) => require("path").join(dataDir, name)),
}));

type LoggerModule = typeof import("../logger");
type LogMock = Record<"info" | "warn" | "error", jest.Mock>;

function loadLogger(): { logger: LoggerModule; log: LogMock } {
  let logger: LoggerModule | undefined;
  let log: LogMock | undefined;
  jest.isolateModules(() => {
    logger = require("../logger");
    log = require("electron-log").default;
  });
  return { logger: logger!, log: log! };
}

describe("logger", () => {
  let logger: LoggerModule;
  let log: LogMock;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-logger-"));
    jest.clearAllMocks();
    ({ logger, log } = loadLogger());
  });

  afterEach(() => {
    logger.closeLogStream();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("places the log file at logs/nodetool.log in the system data path", () => {
    expect(logger.LOG_FILE).toBe(path.join(dataDir, "logs", "nodetool.log"));
  });

  it("routes each level to electron-log and appends trimmed lines to the file", () => {
    logger.logMessage("  hello  ");
    logger.logMessage("careful", "warn");
    logger.logMessage("broken", "error");

    expect(log.info).toHaveBeenCalledWith("hello");
    expect(log.warn).toHaveBeenCalledWith("careful");
    expect(log.error).toHaveBeenCalledWith("broken");
    expect(fs.readFileSync(logger.LOG_FILE, "utf8")).toBe("hello\ncareful\nbroken\n");
  });

  it("appends to an existing log file", () => {
    fs.mkdirSync(path.dirname(logger.LOG_FILE), { recursive: true });
    fs.writeFileSync(logger.LOG_FILE, "earlier\n");
    logger.logMessage("later");
    expect(fs.readFileSync(logger.LOG_FILE, "utf8")).toBe("earlier\nlater\n");
  });

  it("rotates when the file reaches the size cap and keeps a bounded number of copies", () => {
    const line = "x".repeat(1024 * 1024 - 1);
    const linesPerFile = logger.MAX_LOG_BYTES / (line.length + 1);
    const totalLines = linesPerFile * (logger.MAX_ROTATED_LOGS + 3);
    for (let i = 0; i < totalLines; i++) {
      logger.logMessage(line);
    }
    logger.logMessage("newest");

    const files = fs.readdirSync(path.dirname(logger.LOG_FILE)).sort();
    const expected = ["nodetool.log"];
    for (let i = 1; i <= logger.MAX_ROTATED_LOGS; i++) {
      expected.push(`nodetool.log.${i}`);
    }
    expect(files).toEqual(expected);
    for (const file of files) {
      expect(fs.statSync(path.join(path.dirname(logger.LOG_FILE), file)).size).toBeLessThanOrEqual(
        logger.MAX_LOG_BYTES,
      );
    }
    expect(fs.readFileSync(logger.LOG_FILE, "utf8")).toBe("newest\n");
  });

  it("rotates an oversized file left by an earlier run on the first write", () => {
    fs.mkdirSync(path.dirname(logger.LOG_FILE), { recursive: true });
    fs.writeFileSync(logger.LOG_FILE, Buffer.alloc(logger.MAX_LOG_BYTES + 1, "a"));
    logger.logMessage("fresh");

    expect(fs.readFileSync(logger.LOG_FILE, "utf8")).toBe("fresh\n");
    expect(fs.statSync(`${logger.LOG_FILE}.1`).size).toBe(logger.MAX_LOG_BYTES + 1);
  });

  it("keeps logging to electron-log when the log file cannot be opened", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    fs.writeFileSync(path.join(dataDir, "logs"), "a file where the directory should be");

    expect(() => logger.logMessage("still here", "error")).not.toThrow();
    expect(log.error).toHaveBeenCalledWith("still here");
    expect(consoleError).toHaveBeenCalledWith("Failed to open log file:", expect.objectContaining({ code: "EEXIST" }));
    consoleError.mockRestore();
  });

  it("catches errors thrown by electron-log", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    log.info.mockImplementationOnce(() => {
      throw new Error("transport down");
    });

    expect(() => logger.logMessage("hello")).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith("Error in log function: transport down");
    consoleError.mockRestore();
  });

  it("closeLogStream is safe without prior logging and reopens on the next write", () => {
    expect(() => logger.closeLogStream()).not.toThrow();
    logger.logMessage("one");
    logger.closeLogStream();
    logger.logMessage("two");
    expect(fs.readFileSync(logger.LOG_FILE, "utf8")).toBe("one\ntwo\n");
  });
});
