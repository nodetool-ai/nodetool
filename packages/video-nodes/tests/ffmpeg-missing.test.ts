/**
 * ffmpeg-missing hardening tests.
 *
 * When the ffmpeg binary is absent, promisify(execFile) rejects with an error
 * carrying `code === "ENOENT"` (spawn ENOENT). The video nodes must surface a
 * clear, actionable "ffmpeg is not installed" error in that case — NOT silently
 * return the input video unchanged (a no-op effect indistinguishable from a
 * real one) and NOT leak the opaque "spawn ffmpeg ENOENT" message.
 *
 * The mock distinguishes three modes:
 *   - "enoent"  → reject with { code: "ENOENT" } (binary not on PATH)
 *   - "fail"    → reject with a numeric exit code (ffmpeg ran, filtergraph
 *                 failed) — the legitimate `?? bytes` fallback case
 *   - "ok"      → write the expected output file so the node returns bytes
 *
 * No real ffmpeg is needed, so this runs on any platform / CI.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { promises as fs } from "node:fs";

type Mode = "enoent" | "fail" | "ok" | "mix-retry";
let mode: Mode = "enoent";
/** Counts ffmpeg invocations so "mix-retry" can fail call #1 then ENOENT call #2. */
let ffmpegCalls = 0;

/** Bytes written to the output file in "ok" mode, so we can assert round-trip. */
const OK_OUTPUT_BYTES = new Uint8Array([0x42, 0x43, 0x44, 0x45]);

function enoentError(): Error & { code: string } {
  const err = new Error("spawn ffmpeg ENOENT") as Error & { code: string };
  err.code = "ENOENT";
  return err;
}

function execFailure(): Error & { code: number } {
  // ffmpeg ran but the filtergraph failed: numeric exit code, NOT "ENOENT".
  const err = new Error("ffmpeg exited with code 1") as Error & {
    code: number;
  };
  err.code = 1;
  return err;
}

vi.mock("node:child_process", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;

  const promisified = async (
    cmd: string,
    args: string[]
  ): Promise<{ stdout: string; stderr: string }> => {
    if (cmd === "ffprobe") {
      // No probe path is exercised here; keep it inert.
      return { stdout: "", stderr: "" };
    }
    ffmpegCalls += 1;
    if (mode === "mix-retry") {
      // AddAudio mix=true: the first (amix) attempt fails with a genuine ffmpeg
      // error, forcing the plain-replacement retry; that retry hits a missing
      // binary and must still surface the clear install error.
      if (ffmpegCalls === 1) throw execFailure();
      throw enoentError();
    }
    if (mode === "enoent") throw enoentError();
    if (mode === "fail") throw execFailure();
    // "ok": the node reads back the last arg (the output path). Write the
    // expected payload there so fs.readFile(outputPath) succeeds.
    const outputPath = args[args.length - 1];
    await fs.writeFile(outputPath, Buffer.from(OK_OUTPUT_BYTES));
    return { stdout: "", stderr: "" };
  };

  const mockExecFile = (
    _cmd: string,
    _args: string[],
    optionsOrCb: unknown,
    maybeCb?: unknown
  ) => {
    const cb =
      typeof optionsOrCb === "function"
        ? optionsOrCb
        : typeof maybeCb === "function"
          ? maybeCb
          : null;
    if (typeof cb === "function") {
      (cb as (e: Error | null, o: string, s: string) => void)(
        mode === "ok" ? null : mode === "enoent" ? enoentError() : execFailure(),
        "",
        ""
      );
    }
  };
  (mockExecFile as { [k: symbol]: unknown })[
    Symbol.for("nodejs.util.promisify.custom")
  ] = promisified;

  return { ...original, execFile: mockExecFile };
});

const { ResizeVideoNode, AddAudioVideoNode } = await import(
  "@nodetool-ai/video-nodes"
);

function videoRef(bytes: number[]) {
  return {
    type: "video",
    uri: "",
    data: Buffer.from(new Uint8Array(bytes)).toString("base64")
  };
}

function audioRef(bytes: number[]) {
  return {
    type: "audio",
    uri: "",
    data: Buffer.from(new Uint8Array(bytes)).toString("base64")
  };
}

function bytesOf(output: unknown): Uint8Array {
  const ref = output as { data?: string };
  return new Uint8Array(Buffer.from(String(ref.data ?? ""), "base64"));
}

beforeEach(() => {
  mode = "enoent";
  ffmpegCalls = 0;
});

describe("ffmpeg missing (ENOENT) — transform node", () => {
  it("ResizeVideoNode rejects with 'ffmpeg is not installed', not a silent no-op", async () => {
    mode = "enoent";
    const node = new ResizeVideoNode();
    node.assign({ video: videoRef([1, 2, 3, 4]), width: 320, height: 240 });

    await expect(node.process()).rejects.toThrow(/ffmpeg is not installed/);
  });

  it("ResizeVideoNode does NOT return the input unchanged when ffmpeg is missing", async () => {
    mode = "enoent";
    const node = new ResizeVideoNode();
    node.assign({ video: videoRef([1, 2, 3, 4]), width: 320, height: 240 });

    // A silent no-op would resolve with the input bytes; we require a throw.
    await expect(node.process()).rejects.toThrowError();
  });

  it("ResizeVideoNode falls back to the input bytes on a non-ENOENT ffmpeg failure", async () => {
    // A genuine filtergraph failure must keep the legacy `?? bytes` behavior:
    // ffmpegTransform returns null and the node passes the input through.
    mode = "fail";
    const node = new ResizeVideoNode();
    node.assign({ video: videoRef([1, 2, 3, 4]), width: 320, height: 240 });

    const result = await node.process();
    expect(Array.from(bytesOf(result.output))).toEqual([1, 2, 3, 4]);
  });

  it("ResizeVideoNode returns the transformed bytes when ffmpeg succeeds", async () => {
    mode = "ok";
    const node = new ResizeVideoNode();
    node.assign({ video: videoRef([1, 2, 3, 4]), width: 320, height: 240 });

    const result = await node.process();
    expect(Array.from(bytesOf(result.output))).toEqual(
      Array.from(OK_OUTPUT_BYTES)
    );
  });
});

describe("ffmpeg missing (ENOENT) — AddAudioVideoNode", () => {
  it("rejects with 'ffmpeg is not installed' instead of returning the input video", async () => {
    mode = "enoent";
    const node = new AddAudioVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      audio: audioRef([10, 20, 30, 40]),
      volume: 1.0,
      mix: false
    });

    await expect(node.process()).rejects.toThrow(/ffmpeg is not installed/);
  });

  it("returns the muxed output when ffmpeg succeeds", async () => {
    mode = "ok";
    const node = new AddAudioVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      audio: audioRef([10, 20, 30, 40]),
      volume: 1.0,
      mix: false
    });

    const result = await node.process();
    expect(Array.from(bytesOf(result.output))).toEqual(
      Array.from(OK_OUTPUT_BYTES)
    );
  });

  it("still swallows a genuine (non-ENOENT) mux failure and returns the input video", async () => {
    // The graceful 'return the input video' fallback must survive for real
    // ffmpeg/mux failures — only a missing binary should propagate.
    mode = "fail";
    const node = new AddAudioVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      audio: audioRef([10, 20, 30, 40]),
      volume: 1.0,
      mix: false
    });

    const result = await node.process();
    expect(Array.from(bytesOf(result.output))).toEqual([1, 2, 3, 4]);
  });

  it("mix=true: a non-ENOENT first failure that retries into a missing binary still rejects clearly", async () => {
    // mix=true tries an amix filter first; a real failure there falls back to
    // plain replacement. If THAT retry finds no ffmpeg binary, the node must
    // reject with the install error, not silently return the input video.
    mode = "mix-retry";
    const node = new AddAudioVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      audio: audioRef([10, 20, 30, 40]),
      volume: 1.0,
      mix: true
    });

    await expect(node.process()).rejects.toThrow(/ffmpeg is not installed/);
    expect(ffmpegCalls).toBe(2); // amix attempt + plain-replacement retry
  });
});
