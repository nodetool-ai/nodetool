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

const mkdtempMock = vi.fn();
const readFileMock = vi.fn();
const rmMock = vi.fn();
vi.mock("node:fs", () => ({
  promises: {
    mkdtemp: (...a: unknown[]) => mkdtempMock(...a),
    readFile: (...a: unknown[]) => readFileMock(...a),
    rm: (...a: unknown[]) => rmMock(...a)
  }
}));

import { extractAudio, MediaToolingMissingError } from "../src/lib/media.js";

describe("extractAudio", () => {
  beforeEach(() => {
    execFileMock.mockReset();
    mkdtempMock.mockReset();
    readFileMock.mockReset();
    rmMock.mockReset();
    mkdtempMock.mockResolvedValue("/tmp/nodetool-extract-abc");
    rmMock.mockResolvedValue(undefined);
  });

  it("extracts audio bytes and duration, cleaning up the temp dir", async () => {
    // First execFile call = ffmpeg, second = ffprobe duration
    execFileMock
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: "3.5\n", stderr: "" });
    readFileMock.mockResolvedValue(Buffer.from([1, 2, 3, 4]));

    const result = await extractAudio("/in.mp4");
    expect(Array.from(result.bytes)).toEqual([1, 2, 3, 4]);
    expect(result.durationMs).toBe(3500);
    expect(execFileMock.mock.calls[0][0]).toBe("ffmpeg");
    expect(rmMock).toHaveBeenCalledWith("/tmp/nodetool-extract-abc", {
      recursive: true,
      force: true
    });
  });

  it("returns null duration when ffprobe yields nothing parseable", async () => {
    execFileMock
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: "N/A\n", stderr: "" });
    readFileMock.mockResolvedValue(Buffer.from([9]));

    const result = await extractAudio("/in.mp4");
    expect(result.durationMs).toBeNull();
  });

  it("throws MediaToolingMissingError when ffmpeg binary is missing", async () => {
    execFileMock.mockImplementation(() => {
      const err = new Error("spawn ffmpeg ENOENT") as Error & { code?: string };
      err.code = "ENOENT";
      return Promise.reject(err);
    });
    await expect(extractAudio("/in.mp4")).rejects.toBeInstanceOf(
      MediaToolingMissingError
    );
    // temp dir still cleaned up
    expect(rmMock).toHaveBeenCalled();
  });

  it("rethrows a generic ffmpeg failure (non-ENOENT)", async () => {
    execFileMock.mockImplementation(() =>
      Promise.reject(new Error("codec error"))
    );
    await expect(extractAudio("/in.mp4")).rejects.toThrow("codec error");
    expect(rmMock).toHaveBeenCalled();
  });
});
