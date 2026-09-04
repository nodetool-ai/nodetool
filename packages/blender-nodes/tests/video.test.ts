/**
 * The ffmpeg availability gate for the video-decoding suites.
 *
 * `ffmpegAvailable` reads `PATH` at call time, so pointing `PATH` at an
 * empty directory simulates a runner without the binaries — no install or
 * uninstall needed.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { failWhenFfmpegRequired, ffmpegAvailable } from "./video.js";

const PATH_KEY = "PATH";
const REQUIRE_KEY = "NODETOOL_REQUIRE_BLENDER";

describe("failWhenFfmpegRequired", () => {
  let savedPath: string | undefined;
  let savedRequire: string | undefined;
  let emptyDir = "";

  beforeEach(() => {
    savedPath = process.env[PATH_KEY];
    savedRequire = process.env[REQUIRE_KEY];
    emptyDir = mkdtempSync(join(tmpdir(), "blender-no-ffmpeg-"));
    process.env[PATH_KEY] = emptyDir;
    delete process.env[REQUIRE_KEY];
  });

  afterEach(() => {
    if (savedPath === undefined) delete process.env[PATH_KEY];
    else process.env[PATH_KEY] = savedPath;
    if (savedRequire === undefined) delete process.env[REQUIRE_KEY];
    else process.env[REQUIRE_KEY] = savedRequire;
    rmSync(emptyDir, { recursive: true, force: true });
  });

  it("sees no ffmpeg on an empty PATH", () => {
    expect(ffmpegAvailable()).toBe(false);
  });

  it("fails when Blender runs are required but ffmpeg is missing", () => {
    process.env[REQUIRE_KEY] = "1";
    expect(() => failWhenFfmpegRequired()).toThrow(/ffprobe\/ffmpeg/);
  });

  it("stays skippable without the requirement", () => {
    expect(() => failWhenFfmpegRequired()).not.toThrow();
  });
});
