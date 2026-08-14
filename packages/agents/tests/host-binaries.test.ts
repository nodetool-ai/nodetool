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
});
