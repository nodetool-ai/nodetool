import { describe, it, expect, vi } from "vitest";

const execFileMock = vi.fn();
vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => {
    // node's promisify(execFile) calls execFile(file, args, opts, cb)
    const cb = args[args.length - 1] as (
      err: Error | null,
      out: { stdout: string; stderr: string }
    ) => void;
    execFileMock(args[0], args[1]).then(
      (out: { stdout: string; stderr: string }) => cb(null, out),
      (err: Error) => cb(err, { stdout: "", stderr: "" })
    );
  }
}));

import {
  probeHasAudio,
  probeDurationMs,
  MediaToolingMissingError
} from "../src/lib/media.js";

describe("probeHasAudio", () => {
  // Each test fully replaces the mock behavior below, so no beforeEach reset is
  // needed. (A beforeEach `mockReset` makes vitest 4 flag the rejected-promise
  // error case as an unhandled rejection even though the impl catches it.)

  it("returns true when ffprobe lists an audio stream", async () => {
    execFileMock.mockResolvedValue({ stdout: "audio\n", stderr: "" });
    expect(await probeHasAudio("/tmp/x.mp4")).toBe(true);
  });

  it("returns false when ffprobe lists no audio streams", async () => {
    execFileMock.mockResolvedValue({ stdout: "", stderr: "" });
    expect(await probeHasAudio("/tmp/x.mp4")).toBe(false);
  });

  it("returns false when ffprobe errors generically", async () => {
    execFileMock.mockImplementation(() =>
      Promise.reject(new Error("not found"))
    );
    expect(await probeHasAudio("/tmp/x.mp4")).toBe(false);
  });

  it("throws MediaToolingMissingError when ffprobe binary is missing (ENOENT)", async () => {
    execFileMock.mockImplementation(() => {
      const err = new Error("spawn ffprobe ENOENT") as Error & {
        code?: string;
      };
      err.code = "ENOENT";
      return Promise.reject(err);
    });
    await expect(probeHasAudio("/tmp/x.mp4")).rejects.toBeInstanceOf(
      MediaToolingMissingError
    );
  });
});

describe("probeDurationMs", () => {
  it("parses ffprobe format=duration seconds into milliseconds", async () => {
    execFileMock.mockResolvedValue({ stdout: "12.34\n", stderr: "" });
    expect(await probeDurationMs("/tmp/x.wav")).toBe(12340);
  });

  it("returns null when ffprobe yields no parseable duration", async () => {
    execFileMock.mockResolvedValue({ stdout: "N/A\n", stderr: "" });
    expect(await probeDurationMs("/tmp/x.wav")).toBe(null);
  });

  it("throws MediaToolingMissingError when ffprobe binary is missing (ENOENT)", async () => {
    execFileMock.mockImplementation(() => {
      const err = new Error("spawn ffprobe ENOENT") as Error & {
        code?: string;
      };
      err.code = "ENOENT";
      return Promise.reject(err);
    });
    await expect(probeDurationMs("/tmp/x.wav")).rejects.toBeInstanceOf(
      MediaToolingMissingError
    );
  });
});
