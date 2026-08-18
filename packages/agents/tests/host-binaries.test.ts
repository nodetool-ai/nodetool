import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  HostBinaryMissingError,
  clampTimeoutSeconds,
  mimeFromFilename,
  runHostBinary
} from "../src/host-binaries.js";

describe("runHostBinary", () => {
  it("runs a PATH binary with argv and no shell", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nt-host-bin-"));
    try {
      const result = await runHostBinary("true", [], {
        cwd,
        timeoutMs: 5000
      });
      expect(result.exitCode).toBe(0);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("names a missing binary", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nt-host-bin-"));
    try {
      await expect(
        runHostBinary("nodetool-definitely-missing-binary", [], {
          cwd,
          timeoutMs: 2000
        })
      ).rejects.toBeInstanceOf(HostBinaryMissingError);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

describe("mimeFromFilename / clampTimeoutSeconds", () => {
  it("maps common media extensions", () => {
    expect(mimeFromFilename("clip.mp4")).toBe("video/mp4");
    expect(mimeFromFilename("a.WAV")).toBe("audio/wav");
    expect(mimeFromFilename("x.bin")).toBe("application/octet-stream");
  });

  it("clamps timeouts", () => {
    expect(clampTimeoutSeconds(undefined, 180, 600)).toBe(180);
    expect(clampTimeoutSeconds(10, 180, 600)).toBe(10);
    expect(clampTimeoutSeconds(9999, 180, 600)).toBe(600);
    expect(clampTimeoutSeconds(-1, 180, 600)).toBe(180);
  });

  // A guest asking for 0.5 used to get 0, which `runHostBinary` turns into
  // `setTimeout(kill, 0)` — the child dies on the next tick.
  it("floors a sub-second timeout to one second, never to zero", () => {
    expect(clampTimeoutSeconds(0.5, 180, 600)).toBe(1);
    expect(clampTimeoutSeconds(0.999999, 180, 600)).toBe(1);
    expect(clampTimeoutSeconds(Number.MIN_VALUE, 300, 900)).toBe(1);
  });

  it.each([
    // Not a number at all -> the caller's default.
    [undefined, 180],
    [null, 180],
    ["10", 180],
    [true, 180],
    [{}, 180],
    [[10], 180],
    // A number with no usable magnitude -> the caller's default.
    [Number.NaN, 180],
    [Number.POSITIVE_INFINITY, 180],
    [Number.NEGATIVE_INFINITY, 180],
    // Zero and below -> the caller's default.
    [-1000, 180],
    [-1.5, 180],
    [-0, 180],
    [0, 180],
    // Positive: truncated down, floored at one second.
    [Number.MIN_VALUE, 1],
    [0.4, 1],
    [0.9, 1],
    [1, 1],
    [1.9, 1],
    [2, 2],
    [59.9, 59],
    [180.5, 180],
    // At and past the ceiling.
    [599.9, 599],
    [600, 600],
    [600.1, 600],
    [9999, 600],
    [Number.MAX_SAFE_INTEGER, 600],
    [Number.MAX_VALUE, 600]
  ])("clampTimeoutSeconds(%s, 180, 600) === %s", (raw, expected) => {
    expect(clampTimeoutSeconds(raw, 180, 600)).toBe(expected);
  });
});
