/**
 * Concat must not stream-copy heterogeneous inputs (that corrupts output).
 * It probes each input and takes the fast `-c copy` path only when codec,
 * dimensions, fps, and audio presence all match; otherwise it re-encodes each
 * input to a uniform segment (libx264 + aac) before concatenating.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { promises as fs } from "node:fs";

interface Meta {
  codec: string;
  width: number;
  height: number;
  fps: string;
  hasAudio: boolean;
}

let execFileCalls: Array<{ cmd: string; args: string[] }> = [];
/** ffprobe show_streams responses, consumed in call order. */
let probeQueue: Meta[] = [];

function metaJson(m: Meta): string {
  const streams: unknown[] = [
    {
      codec_type: "video",
      codec_name: m.codec,
      width: m.width,
      height: m.height,
      r_frame_rate: m.fps
    }
  ];
  if (m.hasAudio) streams.push({ codec_type: "audio" });
  return JSON.stringify({ streams, format: { duration: "5" } });
}

vi.mock("node:child_process", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  const mockExecFile = (cmd: string, args: string[]) => {
    execFileCalls.push({ cmd, args: [...args] });
  };
  (mockExecFile as { [k: symbol]: unknown })[
    Symbol.for("nodejs.util.promisify.custom")
  ] = async (cmd: string, args: string[]) => {
    execFileCalls.push({ cmd, args: [...args] });
    if (cmd === "ffprobe") {
      const meta = probeQueue.shift();
      return { stdout: meta ? metaJson(meta) : "{}", stderr: "" };
    }
    // ffmpeg: write the requested output file so the node can read it back.
    const out = args[args.length - 1];
    await fs.writeFile(out, Buffer.from([0x99]));
    return { stdout: "", stderr: "" };
  };
  return { ...original, execFile: mockExecFile };
});

const { ConcatVideoNode } = await import("@nodetool-ai/video-nodes");

function videoRef(bytes: number[]) {
  return {
    type: "video",
    uri: "",
    data: Buffer.from(new Uint8Array(bytes)).toString("base64")
  };
}

function ffmpegArgString(): string {
  return execFileCalls
    .filter((c) => c.cmd === "ffmpeg")
    .map((c) => c.args.join(" "))
    .join("\n");
}

beforeEach(() => {
  execFileCalls = [];
  probeQueue = [];
});

describe("ConcatVideoNode — codec-aware path selection", () => {
  it("uses the fast -c copy path (no re-encode) when all inputs match", async () => {
    const uniform: Meta = {
      codec: "h264",
      width: 1920,
      height: 1080,
      fps: "30/1",
      hasAudio: true
    };
    probeQueue = [uniform, uniform];

    const node = new ConcatVideoNode();
    node.setDynamic("a", videoRef([1, 2]));
    node.setDynamic("b", videoRef([3, 4]));
    const result = await node.process();

    const args = ffmpegArgString();
    expect(args).toContain("concat");
    expect(args).toContain("-c copy");
    // No normalization pass.
    expect(args).not.toContain("libx264");
    const out = (result.output as { data?: string }).data;
    expect(new Uint8Array(Buffer.from(out ?? "", "base64")).length).toBe(1);
  });

  it("re-encodes to uniform segments when inputs differ", async () => {
    probeQueue = [
      { codec: "h264", width: 1920, height: 1080, fps: "30/1", hasAudio: true },
      { codec: "vp9", width: 1280, height: 720, fps: "25/1", hasAudio: false }
    ];

    const node = new ConcatVideoNode();
    node.setDynamic("a", videoRef([1, 2]));
    node.setDynamic("b", videoRef([3, 4]));
    await node.process();

    const args = ffmpegArgString();
    // Each input normalized with libx264/aac + scale/pad before concatenation.
    expect(args).toContain("libx264");
    expect(args).toContain("scale=1920:1080");
    expect(args).toContain("concat");
    // The mismatched (audio-less) input gets a silent track so segments align.
    expect(args).toContain("anullsrc");
  });
});
