/**
 * Tests for T-CFG-3: configureLogging and createLogger.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  configureLogging,
  getLogLevel,
  createLogger,
  type LogLevel
} from "../src/logging.js";

describe("T-CFG-3: configureLogging", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.LOG_LEVEL = process.env.LOG_LEVEL;
    savedEnv.NODETOOL_LOG_LEVEL = process.env.NODETOOL_LOG_LEVEL;
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
    // Reset to default
    configureLogging({ level: "info" });
  });

  it("sets log level from options", () => {
    configureLogging({ level: "warn" });
    expect(getLogLevel()).toBe("warn");
  });

  it("reads LOG_LEVEL from env", () => {
    process.env.LOG_LEVEL = "debug";
    delete process.env.NODETOOL_LOG_LEVEL;
    configureLogging({});
    expect(getLogLevel()).toBe("debug");
  });

  it("NODETOOL_LOG_LEVEL overrides LOG_LEVEL", () => {
    process.env.LOG_LEVEL = "debug";
    process.env.NODETOOL_LOG_LEVEL = "error";
    configureLogging({});
    expect(getLogLevel()).toBe("error");
  });

  it("explicit level option overrides env", () => {
    process.env.LOG_LEVEL = "debug";
    configureLogging({ level: "warn" });
    expect(getLogLevel()).toBe("warn");
  });

  it("defaults to info when no env set", () => {
    delete process.env.LOG_LEVEL;
    delete process.env.NODETOOL_LOG_LEVEL;
    configureLogging({});
    expect(getLogLevel()).toBe("info");
  });

  it("accepts Python-style WARNING as warn", () => {
    process.env.NODETOOL_LOG_LEVEL = "WARNING";
    delete process.env.LOG_LEVEL;
    configureLogging({});
    expect(getLogLevel()).toBe("warn");
  });

  it("accepts Python-style CRITICAL as error", () => {
    process.env.NODETOOL_LOG_LEVEL = "CRITICAL";
    delete process.env.LOG_LEVEL;
    configureLogging({});
    expect(getLogLevel()).toBe("error");
  });

  it("falls back to info for unknown level", () => {
    process.env.NODETOOL_LOG_LEVEL = "VERBOSE";
    delete process.env.LOG_LEVEL;
    configureLogging({});
    expect(getLogLevel()).toBe("info");
  });

  it("debug messages suppressed at info level", () => {
    configureLogging({ level: "info" });
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    // At info level, debug should be suppressed
    // We test via the shouldLog check
    expect(shouldLog("debug")).toBe(false);
    expect(shouldLog("info")).toBe(true);
    expect(shouldLog("warn")).toBe(true);
    expect(shouldLog("error")).toBe(true);
    spy.mockRestore();
  });

  it("all levels logged at debug", () => {
    configureLogging({ level: "debug" });
    expect(shouldLog("debug")).toBe(true);
    expect(shouldLog("info")).toBe(true);
  });

  it("only error logged at error level", () => {
    configureLogging({ level: "error" });
    expect(shouldLog("debug")).toBe(false);
    expect(shouldLog("info")).toBe(false);
    expect(shouldLog("warn")).toBe(false);
    expect(shouldLog("error")).toBe(true);
  });
});

// Helper to check if a level would be logged
function shouldLog(level: LogLevel): boolean {
  const levels: LogLevel[] = ["debug", "info", "warn", "error"];
  const currentLevel = getLogLevel();
  return levels.indexOf(level) >= levels.indexOf(currentLevel);
}

// ── T-CFG-3b — createLogger ──────────────────────────────────────────

describe("T-CFG-3b: createLogger", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    configureLogging({ level: "debug" });
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    configureLogging({ level: "info" });
  });

  it("returns a Logger with debug/info/warn/error methods", () => {
    const log = createLogger("test.module");
    expect(typeof log.debug).toBe("function");
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
  });

  it("writes to stderr when logging", () => {
    const log = createLogger("test.module");
    log.info("hello world");
    expect(stderrSpy).toHaveBeenCalledOnce();
    const written = stderrSpy.mock.calls[0][0] as string;
    expect(written).toContain("hello world");
  });

  it("includes the logger name in output", () => {
    const log = createLogger("nodetool.kernel.runner");
    log.info("started");
    const written = stderrSpy.mock.calls[0][0] as string;
    expect(written).toContain("nodetool.kernel.runner");
  });

  it("includes the level in output", () => {
    const log = createLogger("test");
    log.warn("something");
    const written = stderrSpy.mock.calls[0][0] as string;
    expect(written).toContain("WARN");
  });

  it("suppresses messages below the current log level", () => {
    configureLogging({ level: "warn" });
    const log = createLogger("test");
    log.debug("hidden");
    log.info("also hidden");
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("logs at exactly the current level", () => {
    configureLogging({ level: "warn" });
    const log = createLogger("test");
    log.warn("visible");
    expect(stderrSpy).toHaveBeenCalledOnce();
  });

  it("formats object args as JSON", () => {
    const log = createLogger("test");
    log.info("context", { jobId: 42 });
    const written = stderrSpy.mock.calls[0][0] as string;
    expect(written).toContain('"jobId":42');
  });

  it("formats Error args using stack or message", () => {
    const log = createLogger("test");
    const err = new Error("boom");
    log.error("failed", err);
    const written = stderrSpy.mock.calls[0][0] as string;
    expect(written).toContain("boom");
  });

  it("formats primitive args as strings", () => {
    const log = createLogger("test");
    log.info("value is", 99);
    const written = stderrSpy.mock.calls[0][0] as string;
    expect(written).toContain("99");
  });

  it("includes a timestamp in HH:MM:SS format", () => {
    const log = createLogger("test");
    log.info("ts check");
    const written = stderrSpy.mock.calls[0][0] as string;
    expect(written).toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});
