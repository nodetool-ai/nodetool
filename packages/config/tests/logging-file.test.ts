/**
 * NODETOOL_LOG_FILE routing. A separate file because the open log file is
 * module state that would redirect every later stderr assertion.
 */
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

import { configureLogging, createLogger } from "../src/logging.js";

describe("NODETOOL_LOG_FILE", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodetool-log-file-"));

  afterAll(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes log lines to the file instead of stderr", () => {
    const first = join(dir, "first.log");
    vi.stubEnv("NODETOOL_LOG_FILE", first);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      configureLogging({ level: "info" });
      createLogger("file-test").info("to the file");
      expect(stderr).not.toHaveBeenCalled();
    } finally {
      stderr.mockRestore();
    }
    expect(readFileSync(first, "utf8")).toContain("to the file");
  });

  it("keeps the first log file when logging is configured again", () => {
    const second = join(dir, "second.log");
    vi.stubEnv("NODETOOL_LOG_FILE", second);
    configureLogging({ level: "info" });
    createLogger("file-test").info("still the first file");
    expect(existsSync(second)).toBe(false);
    expect(readFileSync(join(dir, "first.log"), "utf8")).toContain(
      "still the first file"
    );
  });
});
