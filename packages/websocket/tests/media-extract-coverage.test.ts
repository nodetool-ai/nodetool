import { describe, it, expect, vi, beforeEach } from "vitest";

const execFileMock = vi.fn();
vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => {
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

import { extractAudio, MediaToolingMissingError } from "../src/lib/media.js";

describe("extractAudio", () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("writes the WAV to the given path and returns its duration", async () => {
    // First execFile call = ffmpeg, second = ffprobe duration
    execFileMock
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: "3.5\n", stderr: "" });

    const result = await extractAudio("/in.mp4", "/out/audio.wav");
    expect(result.durationMs).toBe(3500);
    expect(execFileMock.mock.calls[0][0]).toBe("ffmpeg");
    expect(execFileMock.mock.calls[0][1]).toEqual([
      "-y", "-i", "/in.mp4", "-vn", "-acodec", "pcm_s16le", "/out/audio.wav"
    ]);
    expect(execFileMock.mock.calls[1][1]).toContain("/out/audio.wav");
  });

  it("returns null duration when ffprobe yields nothing parseable", async () => {
    execFileMock
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: "N/A\n", stderr: "" });

    const result = await extractAudio("/in.mp4", "/out/audio.wav");
    expect(result.durationMs).toBeNull();
  });

  it("throws MediaToolingMissingError when ffmpeg binary is missing", async () => {
    execFileMock.mockImplementation(() => {
      const err = new Error("spawn ffmpeg ENOENT") as Error & { code?: string };
      err.code = "ENOENT";
      return Promise.reject(err);
    });
    await expect(
      extractAudio("/in.mp4", "/out/audio.wav")
    ).rejects.toBeInstanceOf(MediaToolingMissingError);
  });

  it("rethrows a generic ffmpeg failure (non-ENOENT)", async () => {
    execFileMock.mockImplementation(() =>
      Promise.reject(new Error("codec error"))
    );
    await expect(extractAudio("/in.mp4", "/out/audio.wav")).rejects.toThrow(
      "codec error"
    );
  });
});
