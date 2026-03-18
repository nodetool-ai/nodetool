/**
 * Tests for T-CFG-3: configureLogging.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { configureLogging, getLogLevel, type LogLevel } from "../src/logging.js";

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
