/**
 * Trim must seek on the INPUT side (`-ss`/`-to` before `-i`) so ffmpeg jumps to
 * the nearest keyframe instead of decoding from the start of the clip.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let execFileCalls: Array<{ cmd: string; args: string[] }> = [];

vi.mock("node:child_process", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  const mockExecFile = (cmd: string, args: string[]) => {
    execFileCalls.push({ cmd, args: [...args] });
  };
  (mockExecFile as { [k: symbol]: unknown })[
    Symbol.for("nodejs.util.promisify.custom")
  ] = (cmd: string, args: string[]) => {
    execFileCalls.push({ cmd, args: [...args] });
    return Promise.reject(new Error("mock ffmpeg: no real execution"));
  };
  return { ...original, execFile: mockExecFile };
});

const { TrimVideoNode } = await import("@nodetool-ai/video-nodes");

function videoRef(bytes: number[]) {
  return {
    type: "video",
    uri: "",
    data: Buffer.from(new Uint8Array(bytes)).toString("base64")
  };
}

function ffmpegArgs(): string[] {
  const call = execFileCalls.find((c) => c.cmd === "ffmpeg");
  return call ? call.args : [];
}

beforeEach(() => {
  execFileCalls = [];
});

describe("TrimVideoNode — input-side seeking", () => {
  it("places -ss and -to BEFORE -i", async () => {
    const node = new TrimVideoNode();
    node.assign({ video: videoRef([1, 2, 3, 4]), start_time: 5.5, end_time: 12 });
    await node.process().catch(() => undefined);

    const args = ffmpegArgs();
    const ss = args.indexOf("-ss");
    const to = args.indexOf("-to");
    const i = args.indexOf("-i");
    expect(ss).toBeGreaterThanOrEqual(0);
    expect(i).toBeGreaterThan(ss);
    expect(to).toBeGreaterThan(ss);
    expect(to).toBeLessThan(i);
    expect(args[ss + 1]).toBe("5.5");
    expect(args[to + 1]).toBe("12");
    expect(args).toContain("copy");
  });

  it("omits -to (still input-side -ss) when end_time is -1", async () => {
    const node = new TrimVideoNode();
    node.assign({ video: videoRef([1, 2, 3, 4]), start_time: 3, end_time: -1 });
    await node.process().catch(() => undefined);

    const args = ffmpegArgs();
    const ss = args.indexOf("-ss");
    const i = args.indexOf("-i");
    expect(ss).toBeGreaterThanOrEqual(0);
    expect(i).toBeGreaterThan(ss);
    expect(args).not.toContain("-to");
  });
});

describe("TrimVideoNode — accurate (re-encode) mode", () => {
  it("places -ss and -to AFTER -i and drops stream-copy for frame-exact cuts", async () => {
    const node = new TrimVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      start_time: 5.5,
      end_time: 12,
      accurate: true
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgs();
    const ss = args.indexOf("-ss");
    const to = args.indexOf("-to");
    const i = args.indexOf("-i");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(ss).toBeGreaterThan(i);
    expect(to).toBeGreaterThan(ss);
    expect(args[ss + 1]).toBe("5.5");
    expect(args[to + 1]).toBe("12");
    // Re-encoding, not stream-copying.
    expect(args).not.toContain("copy");
  });

  it("omits -to when end_time is -1", async () => {
    const node = new TrimVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      start_time: 3,
      end_time: -1,
      accurate: true
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgs();
    const ss = args.indexOf("-ss");
    const i = args.indexOf("-i");
    expect(ss).toBeGreaterThan(i);
    expect(args).not.toContain("-to");
    expect(args).not.toContain("copy");
  });
});
