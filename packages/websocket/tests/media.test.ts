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

import { probeHasAudio } from "../src/lib/media.js";

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

  it("returns false when ffprobe errors", async () => {
    execFileMock.mockImplementation(() =>
      Promise.reject(new Error("not found"))
    );
    expect(await probeHasAudio("/tmp/x.mp4")).toBe(false);
  });
});
