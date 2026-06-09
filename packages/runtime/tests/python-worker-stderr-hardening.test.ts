/**
 * Mutation-hardening tests for the Python worker stderr router.
 *
 * Pins the level routing (error/warn/debug/info), both log-format dialects
 * (`| LEVEL |` and `[level]`), case-insensitivity, the start-anchor on the
 * bracket form, the skip conditions, trimming, and the forwarded prefix.
 * See MUTATION_TESTING.md.
 */
import { describe, it, expect, vi } from "vitest";
import { createLogger } from "@nodetool-ai/config";
import { logPythonWorkerStderr } from "../src/python-worker-stderr.js";

function spies() {
  const logger = createLogger("test.pw-stderr");
  return {
    logger,
    error: vi.spyOn(logger, "error").mockImplementation(() => logger),
    warn: vi.spyOn(logger, "warn").mockImplementation(() => logger),
    debug: vi.spyOn(logger, "debug").mockImplementation(() => logger),
    info: vi.spyOn(logger, "info").mockImplementation(() => logger)
  };
}

describe("logPythonWorkerStderr — skip conditions", () => {
  it("ignores empty/whitespace-only lines", () => {
    const s = spies();
    logPythonWorkerStderr("   ", s.logger);
    expect(s.error).not.toHaveBeenCalled();
    expect(s.warn).not.toHaveBeenCalled();
    expect(s.debug).not.toHaveBeenCalled();
    expect(s.info).not.toHaveBeenCalled();
  });

  it("ignores the readiness sentinel", () => {
    const s = spies();
    logPythonWorkerStderr("  NODETOOL_STDIO_READY  ", s.logger);
    expect(s.info).not.toHaveBeenCalled();
  });
});

describe("logPythonWorkerStderr — level routing", () => {
  const cases: Array<[string, "error" | "warn" | "debug" | "info"]> = [
    ["2026 | ERROR | mod | boom", "error"],
    ["[error] boom", "error"],
    ["2026 | WARNING | mod | careful", "warn"],
    ["[warning] careful", "warn"],
    ["2026 | DEBUG | mod | trace", "debug"],
    ["[debug] trace", "debug"],
    ["2026 | INFO | mod | hello", "info"],
    ["raw print with no level", "info"]
  ];

  for (const [line, level] of cases) {
    it(`routes ${JSON.stringify(line)} to logger.${level}`, () => {
      const s = spies();
      logPythonWorkerStderr(line, s.logger);
      expect(s[level]).toHaveBeenCalledTimes(1);
      for (const other of ["error", "warn", "debug", "info"] as const) {
        if (other !== level) expect(s[other]).not.toHaveBeenCalled();
      }
    });
  }

  it("is case-insensitive for the pipe and bracket forms", () => {
    const s = spies();
    logPythonWorkerStderr("2026 | error | m | x", s.logger);
    logPythonWorkerStderr("[WARNING] y", s.logger);
    expect(s.error).toHaveBeenCalledTimes(1);
    expect(s.warn).toHaveBeenCalledTimes(1);
  });

  it("anchors every bracket form to the start of the line", () => {
    // a bracket marker mid-line must NOT match (start-anchored regex); with no
    // pipe-form marker it falls through to info.
    for (const line of [
      "note: see [error] above",
      "note: see [warning] above",
      "note: see [debug] above"
    ]) {
      const s = spies();
      logPythonWorkerStderr(line, s.logger);
      expect(s.error).not.toHaveBeenCalled();
      expect(s.warn).not.toHaveBeenCalled();
      expect(s.debug).not.toHaveBeenCalled();
      expect(s.info).toHaveBeenCalledTimes(1);
    }
  });
});

describe("logPythonWorkerStderr — forwarded payload", () => {
  it("trims the line and prefixes it with [python-worker]", () => {
    const s = spies();
    logPythonWorkerStderr("   hello world   ", s.logger);
    expect(s.info).toHaveBeenCalledWith("[python-worker] hello world");
  });

  it("prefixes error, warning, and debug lines too", () => {
    const s = spies();
    logPythonWorkerStderr("[error] kaboom", s.logger);
    logPythonWorkerStderr("[warning] careful", s.logger);
    logPythonWorkerStderr("[debug] trace", s.logger);
    expect(s.error).toHaveBeenCalledWith("[python-worker] [error] kaboom");
    expect(s.warn).toHaveBeenCalledWith("[python-worker] [warning] careful");
    expect(s.debug).toHaveBeenCalledWith("[python-worker] [debug] trace");
  });
});
