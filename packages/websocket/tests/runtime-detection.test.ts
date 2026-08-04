import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearRuntimeDetectionCache,
  detectRuntimes,
  hasExecutable,
  KNOWN_RUNTIMES
} from "../src/lib/runtime-detection.js";

const origPath = process.env["PATH"];
let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-runtime-detect-"));
  await fs.writeFile(path.join(dir, "ffmpeg"), "#!/bin/sh\n", { mode: 0o755 });
  await fs.writeFile(path.join(dir, "notexec"), "#!/bin/sh\n", { mode: 0o644 });
  process.env["PATH"] = dir;
  clearRuntimeDetectionCache();
});

afterEach(async () => {
  process.env["PATH"] = origPath;
  clearRuntimeDetectionCache();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("hasExecutable", () => {
  it("finds an executable on PATH", async () => {
    await expect(hasExecutable("ffmpeg")).resolves.toBe(true);
  });

  it("ignores a file that is not executable", async () => {
    await expect(hasExecutable("notexec")).resolves.toBe(false);
  });

  it("reports a missing command as absent", async () => {
    await expect(hasExecutable("definitely-not-here")).resolves.toBe(false);
  });
});

describe("detectRuntimes", () => {
  it("reports ffmpeg installed when it is on PATH", async () => {
    const statuses = await detectRuntimes(["ffmpeg", "pandoc"]);
    expect(statuses).toEqual([
      { id: "ffmpeg", installed: true },
      { id: "pandoc", installed: false }
    ]);
  });

  it("covers every known runtime by default", async () => {
    const statuses = await detectRuntimes();
    expect(statuses.map((s) => s.id)).toEqual([...KNOWN_RUNTIMES]);
  });

  it("refuses path-like ids instead of probing them", async () => {
    const statuses = await detectRuntimes(["../../bin/sh", "ff mpeg", ""]);
    expect(statuses.every((s) => !s.installed)).toBe(true);
  });

  it("caches a probe result", async () => {
    await detectRuntimes(["ffmpeg"]);
    await fs.rm(path.join(dir, "ffmpeg"));
    await expect(detectRuntimes(["ffmpeg"])).resolves.toEqual([
      { id: "ffmpeg", installed: true }
    ]);
    clearRuntimeDetectionCache();
    await expect(detectRuntimes(["ffmpeg"])).resolves.toEqual([
      { id: "ffmpeg", installed: false }
    ]);
  });
});
