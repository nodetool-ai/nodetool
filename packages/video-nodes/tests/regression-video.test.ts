/**
 * Regression tests for video node implementations.
 *
 * These tests verify that video nodes build the right filter strings and
 * stream plans. They fake the in-process media module, which records each
 * edit in the CLI's terms (`-vf`, `-filter_complex`, `-c copy`) without
 * running it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fakeProbe, mediaArgString, mediaCalls, resetFakeMedia } from "./_fixtures/fake-media.js";

vi.mock("@nodetool-ai/runtime/media", async (importOriginal) =>
  (await import("./_fixtures/fake-media.js")).fakeMediaModule(await importOriginal(), { edits: true })
);

// Import the nodes after mocking the media module
const {
  DenoiseVideoNode,
  StabilizeVideoNode,
  SharpnessVideoNode,
  ColorBalanceVideoNode,
  SetSpeedVideoNode,
  TransitionVideoNode,
  TrimVideoNode,
  AddAudioVideoNode,
  ChromaKeyVideoNode,
  SaveVideoNode,
  FrameToVideoNode,
  ConcatVideoNode
} = await import("@nodetool-ai/video-nodes");

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

/** Every edit the nodes asked for, one argument string each. */
function editCalls(): string[] {
  return mediaCalls.flatMap((call) => (call.fn === "transformMedia" ? [call.args] : []));
}

/** Everything the nodes asked of the media module, joined. */
function ffmpegArgString(): string {
  return mediaArgString();
}

beforeEach(() => {
  resetFakeMedia();
});

// ─── 1. Denoise ────────────────────────────────────────────────────────────────

describe("DenoiseVideoNode — uses nlmeans filter with strength param", () => {
  it("constructs nlmeans filter, NOT hqdn3d", async () => {
    const node = new DenoiseVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      strength: 7
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    expect(args).toContain("nlmeans");
    expect(args).toContain("s=7");
    expect(args).not.toContain("hqdn3d");
  });

  it("uses default strength=5 when not specified", async () => {
    const node = new DenoiseVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4])
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    expect(args).toContain("nlmeans=s=5");
  });
});

// ─── 2. Stabilize ──────────────────────────────────────────────────────────────

// `deshake` has no `smooth` option — that belongs to `vidstabtransform`, which
// needs a libvidstab build we can't assume. The node emitted `deshake=smooth=N`
// and ffmpeg rejected every invocation with "Option not found". These tests
// asserted that exact string, so they passed while the node could not run at
// all: they string-matched the args and never executed ffmpeg. `smoothing` now
// maps onto deshake's real control, rx/ry, which ffmpeg requires to be a
// multiple of 16 in 0–64 (0 disables the search, so the floor is 16).
describe("StabilizeVideoNode — maps smoothing onto deshake rx/ry", () => {
  it("snaps smoothing to a legal rx/ry step", async () => {
    const node = new StabilizeVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      smoothing: 15,
      crop_black: false
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    expect(args).toContain("deshake");
    expect(args).toContain("rx=16");
    expect(args).toContain("ry=16");
    expect(args).not.toContain("smooth=");
  });

  it("clamps a large smoothing to the 64 ceiling", async () => {
    const node = new StabilizeVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      smoothing: 200,
      crop_black: false
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    expect(args).toContain("rx=64");
    expect(args).toContain("ry=64");
  });

  it("includes cropdetect and crop when crop_black=true", async () => {
    const node = new StabilizeVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      smoothing: 10,
      crop_black: true
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    expect(args).toContain("deshake");
    expect(args).toContain("rx=16");
    expect(args).toContain("cropdetect");
    expect(args).toContain("crop");
  });

  it("does NOT include cropdetect when crop_black=false", async () => {
    const node = new StabilizeVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      smoothing: 10,
      crop_black: false
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    expect(args).toContain("deshake");
    expect(args).not.toContain("cropdetect");
  });
});

// ─── 3. Sharpness ──────────────────────────────────────────────────────────────

describe("SharpnessVideoNode — uses unsharp with both luma and chroma amounts", () => {
  it("constructs unsharp filter with luma_amount and chroma_amount values", async () => {
    const node = new SharpnessVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      luma_amount: 1.5,
      chroma_amount: 0.8
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    expect(args).toContain("unsharp");
    expect(args).toContain("1.5");
    expect(args).toContain("0.8");
    // Must NOT be hardcoded 5:5:1.0
    expect(args).not.toMatch(/unsharp=5:5:1\.0$/m);
  });

  it("uses both luma and chroma values, not just luma", async () => {
    const node = new SharpnessVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      luma_amount: 2.0,
      chroma_amount: 1.2
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    // Full unsharp format: unsharp=5:5:<luma>:5:5:<chroma>
    expect(args).toMatch(/unsharp=5:5:2(:.*)?:5:5:1\.2/);
  });
});

// ─── 4. ColorBalance ──────────────────────────────────────────────────────────

describe("ColorBalanceVideoNode — uses colorbalance filter with rs/gs/bs", () => {
  it("constructs colorbalance filter, NOT eq=brightness", async () => {
    const node = new ColorBalanceVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      red_adjust: 1.5,
      green_adjust: 0.8,
      blue_adjust: 1.2
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    expect(args).toContain("colorbalance");
    expect(args).toContain("rs=");
    expect(args).toContain("gs=");
    expect(args).toContain("bs=");
    expect(args).not.toContain("eq=brightness");
  });

  it("converts 0-2 range to -1..1 for colorbalance (neutral=0)", async () => {
    const node = new ColorBalanceVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      red_adjust: 1.0,   // neutral → rs=0
      green_adjust: 2.0,  // max → gs=1
      blue_adjust: 0.0    // min → bs=-1
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    expect(args).toContain("rs=0");
    expect(args).toContain("gs=1");
    expect(args).toContain("bs=-1");
  });
});

// ─── 5. SetSpeed ───────────────────────────────────────────────────────────────

describe("SetSpeedVideoNode — chains atempo for speeds outside 0.5-2.0", () => {
  it("produces chained atempo filters for speed=4.0 (two stages)", async () => {
    const node = new SetSpeedVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      speed_factor: 4.0
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    // speed=4 → buildAtempo chains: while remaining>2 push atempo=2.0 and halve,
    // then push final atempo=<remainder>. For 4.0: atempo=2.0,atempo=2
    // Must have at least 2 atempo segments
    const atempoSegments = args.match(/atempo=[0-9.]+/g) || [];
    expect(atempoSegments.length).toBeGreaterThanOrEqual(2);
  });

  it("does NOT use a single clamped atempo for speed=4.0", async () => {
    const node = new SetSpeedVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      speed_factor: 4.0
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    // Must have multiple chained atempo filters, not just one
    const atempoSegments = args.match(/atempo=[0-9.]+/g) || [];
    expect(atempoSegments.length).toBeGreaterThanOrEqual(2);
  });

  it("uses single atempo for speed=1.5 (within 0.5-2.0 range)", async () => {
    const node = new SetSpeedVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      speed_factor: 1.5
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    expect(args).toContain("atempo=1.5");
    const atempoSegments = args.match(/atempo=[0-9.]+/g) || [];
    expect(atempoSegments.length).toBe(1);
  });

  it("adjusts video PTS inversely to speed", async () => {
    const node = new SetSpeedVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      speed_factor: 2.0
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    // setpts=0.5*PTS for 2x speed
    expect(args).toContain("setpts=0.5*PTS");
  });
});

// ─── 6. Transition ─────────────────────────────────────────────────────────────

describe("TransitionVideoNode — uses transition_type, not hardcoded fade", () => {
  it("uses the specified transition_type in xfade filter", async () => {
    const node = new TransitionVideoNode();
    node.assign({
      video_a: videoRef([1, 2, 3, 4]),
      video_b: videoRef([5, 6, 7, 8]),
      transition_type: "wipeleft",
      duration: 1.0
    });
    // The mocked ffmpeg always fails, so the node throws — the assertions
    // below only inspect the captured ffmpeg arguments.
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    expect(args).toContain("transition=wipeleft");
    // Should NOT hardcode "fade" when wipeleft is specified
    expect(args).not.toContain("transition=fade");
  });

  it("computes offset from video_a duration, not hardcoded 0", async () => {
    fakeProbe.durationSec = 10.5;
    const node = new TransitionVideoNode();
    node.assign({
      video_a: videoRef([1, 2, 3, 4]),
      video_b: videoRef([5, 6, 7, 8]),
      transition_type: "fade",
      duration: 1.0
    });
    await node.process().catch(() => undefined);

    // The probe answers 10.5 s, so the offset is 10.5 - 1.0 = 9.5.
    const args = ffmpegArgString();
    expect(args).toContain("offset=9.5");
    expect(args).not.toContain("offset=0");
  });

  it("probes video_a duration before building the filter", async () => {
    const node = new TransitionVideoNode();
    node.assign({
      video_a: videoRef([1, 2, 3, 4]),
      video_b: videoRef([5, 6, 7, 8]),
      transition_type: "dissolve",
      duration: 2.0
    });
    await node.process().catch(() => undefined);

    expect(mediaCalls.some((call) => call.fn === "probeMedia")).toBe(true);
  });
});

// ─── 9. Trim ───────────────────────────────────────────────────────────────────

describe("TrimVideoNode — uses start/end as time values (seconds)", () => {
  it("passes -ss and -to with time values to ffmpeg", async () => {
    const node = new TrimVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      start_time: 5.5,
      end_time: 12.0
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    expect(args).toContain("-ss");
    expect(args).toContain("5.5");
    expect(args).toContain("-to");
    expect(args).toContain("12");
  });

  it("does NOT use byte offsets for trimming", async () => {
    const node = new TrimVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4, 5, 6, 7, 8]),
      start_time: 2,
      end_time: 5
    });
    await node.process().catch(() => undefined);

    const calls = editCalls();
    // Should have run an edit (not just sliced bytes)
    expect(calls.length).toBeGreaterThan(0);

    // The command should use -ss (seek) and -to (end time)
    const args = ffmpegArgString();
    expect(args).toContain("-ss");
    expect(args).toContain("-to");
  });

  it("omits -to when end_time is -1 (meaning end of video)", async () => {
    const node = new TrimVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      start_time: 3.0,
      end_time: -1
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    expect(args).toContain("-ss 3");
    expect(args).not.toContain("-to");
  });

  it("uses -c copy for stream copying", async () => {
    const node = new TrimVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      start_time: 1,
      end_time: 4
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    expect(args).toContain("-c");
    expect(args).toContain("copy");
  });
});

// ─── 10. AddAudio ──────────────────────────────────────────────────────────────

describe("AddAudioVideoNode — uses volume and mix inputs", () => {
  it("includes volume in ffmpeg args when mixing", async () => {
    const node = new AddAudioVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      audio: audioRef([10, 20, 30, 40]),
      volume: 0.7,
      mix: true
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    // volume should appear in filter_complex
    expect(args).toContain("volume=0.7");
    expect(args).toContain("amix");
  });

  it("includes volume in ffmpeg args when replacing (non-default volume)", async () => {
    const node = new AddAudioVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      audio: audioRef([10, 20, 30, 40]),
      volume: 0.5,
      mix: false
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    // Volume should be applied even when not mixing
    expect(args).toContain("volume=0.5");
  });

  it("maps both video and audio streams", async () => {
    const node = new AddAudioVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      audio: audioRef([10, 20, 30, 40]),
      volume: 1.0,
      mix: false
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    expect(args).toContain("-map");
    expect(args).toContain("0:v");
  });

  it("uses amix filter when mix=true", async () => {
    const node = new AddAudioVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      audio: audioRef([10, 20, 30, 40]),
      volume: 1.0,
      mix: true
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    expect(args).toContain("amix");
    expect(args).toContain("filter_complex");
  });

  it("does NOT use amix when mix=false (replace mode)", async () => {
    const node = new AddAudioVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      audio: audioRef([10, 20, 30, 40]),
      volume: 1.0,
      mix: false
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    expect(args).not.toContain("amix");
  });

  it("loads audio from a file:// URI (async), not just inline data", async () => {
    // Audio supplied as a URI ref with no inline `data` — the node must load
    // it via the async loader. With the old synchronous `audioBytes`, the
    // bytes would be empty and the node would return early WITHOUT calling
    // ffmpeg. A real temp file backs the URI so audioBytesAsync can read it.
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-aatest-"));
    const wavPath = path.join(dir, "track.wav");
    await fs.writeFile(wavPath, Buffer.from([10, 20, 30, 40, 50]));
    try {
      const node = new AddAudioVideoNode();
      node.assign({
        video: videoRef([1, 2, 3, 4]),
        audio: { type: "audio", uri: `file://${wavPath}`, data: null },
        volume: 1.0,
        mix: false
      });
      await node.process().catch(() => undefined);

      // The edit must have run, proving the URI-backed audio loaded.
      expect(editCalls().length).toBeGreaterThan(0);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

// ─── 10b. AddAudio length policy ───────────────────────────────────────────────

describe("AddAudioVideoNode — bounds the output to the picture", () => {
  it("trims an audio track to the picture by default", async () => {
    const node = new AddAudioVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      audio: audioRef([10, 20, 30, 40]),
      volume: 1.0,
      mix: false
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    expect(args).toContain("apad");
    expect(args).toContain("-shortest");
  });

  it("trims when mixing too, and mixes the whole bed before trimming", async () => {
    const node = new AddAudioVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      audio: audioRef([10, 20, 30, 40]),
      volume: 0.7,
      mix: true
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    expect(args).toContain("amix=inputs=2:duration=longest,apad");
    expect(args).toContain("-shortest");
  });

  it("keeps the replace fallback bounded when mixing fails", async () => {
    const node = new AddAudioVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      audio: audioRef([10, 20, 30, 40]),
      volume: 1.0,
      mix: true
    });
    await node.process().catch(() => undefined);

    // The faked edit always fails, so the mix attempt falls back to plain
    // replacement. That second edit must carry the guard as well.
    const calls = editCalls();
    expect(calls.length).toBe(2);
    const fallback = calls[1]!;
    expect(fallback).not.toContain("amix");
    expect(fallback).toContain("apad");
    expect(fallback).toContain("-shortest");
  });

  it("output_length=longest keeps both streams whole", async () => {
    const node = new AddAudioVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      audio: audioRef([10, 20, 30, 40]),
      volume: 1.0,
      mix: false,
      output_length: "longest"
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    expect(args).not.toContain("apad");
    expect(args).not.toContain("-shortest");
    expect(args).toContain("-map 1:a");
  });
});

// ─── 11. ChromaKey ───────────────────────────────────────────────────────────

describe("ChromaKeyVideoNode — uses the color ref value, not [object Object]", () => {
  it("converts key_color.value (#RRGGBB) to ffmpeg's 0x form", async () => {
    const node = new ChromaKeyVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      key_color: { type: "color", value: "#00FF00" },
      similarity: 0.3,
      blend: 0.1
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    expect(args).toContain("colorkey=0x00FF00:0.3:0.1");
    expect(args).not.toContain("[object Object]");
  });

  it("honors a non-default key color", async () => {
    const node = new ChromaKeyVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      key_color: { type: "color", value: "#0000FF" },
      similarity: 0.2,
      blend: 0.05
    });
    await node.process().catch(() => undefined);

    const args = ffmpegArgString();
    expect(args).toContain("colorkey=0x0000FF");
  });
});

// ─── 12. SaveVideo (folder ref resolution) ───────────────────────────────────

describe("SaveVideoNode — resolves a folder ref object to a path", () => {
  it("writes under the folder ref's uri, not a [object Object] directory", async () => {
    const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-savetest-"));
    const writeSpy = vi.spyOn(fs, "writeFile").mockResolvedValue(undefined);
    const mkdirSpy = vi
      .spyOn(fs, "mkdir")
      .mockResolvedValue(undefined as unknown as string);
    try {
      const node = new SaveVideoNode();
      node.assign({
        video: videoRef([1, 2, 3, 4]),
        folder: { type: "folder", uri: `file://${targetDir}`, asset_id: null },
        name: "clip.mp4"
      });
      await node.process().catch(() => undefined);

      expect(writeSpy).toHaveBeenCalled();
      const writtenPath = String(writeSpy.mock.calls[0][0]);
      expect(writtenPath).not.toContain("[object Object]");
      expect(writtenPath).toBe(path.join(targetDir, "clip.mp4"));
    } finally {
      writeSpy.mockRestore();
      mkdirSpy.mockRestore();
      await fs.rm(targetDir, { recursive: true, force: true });
    }
  });
});

// ─── 13. FrameToVideo (contiguous numbering) ─────────────────────────────────

describe("FrameToVideoNode — numbers frames contiguously despite gaps", () => {
  it("skips empty frames instead of sending them to the encoder", async () => {
    const img = (bytes: number[]) => ({
      type: "image",
      data: Buffer.from(new Uint8Array(bytes)).toString("base64")
    });
    const node = new FrameToVideoNode();
    // The middle frame is empty (no data) and must be skipped; the two valid
    // frames still reach the encoder.
    node.assign({
      frame: [img([1, 2, 3]), { type: "image", data: "" }, img([4, 5, 6])],
      fps: 24
    });
    // The faked encoder fails at the end, so the node throws.
    await expect(node.process()).rejects.toThrow("Combining frames into a video failed");
    const encoder = mediaCalls.find((call) => call.fn === "openVideoFrameEncoder");
    expect(encoder).toMatchObject({ input: "png", frames: 2 });
  });

  it("feeds in-flight raw-RGBA frames to the encoder as raw pixels, not images", async () => {
    // A raw-RGBA ref carries uncompressed pixels — decoding them as PNG fails
    // with "Invalid PNG signature". They must go in as raw RGBA.
    const rawFrame = (w: number, h: number) => ({
      type: "image",
      mimeType: "image/x-raw-rgba",
      width: w,
      height: h,
      data: new Uint8Array(w * h * 4).fill(0x0a)
    });
    const node = new FrameToVideoNode();
    node.assign({ frame: [rawFrame(2, 2), rawFrame(2, 2)], fps: 30 });
    await expect(node.process()).rejects.toThrow("Combining frames into a video failed");

    const args = ffmpegArgString();
    expect(args).toContain("rawvideo");
    expect(args).toContain("rgba");
    expect(args).toContain("2x2");
    expect(args).not.toContain("image2pipe");
  });
});

// ─── Concat — accepts dynamic single inputs AND list<video> inputs ───────────

describe("ConcatVideoNode — flattens list inputs", () => {
  function outputBytes(result: Record<string, unknown>): Uint8Array {
    const out = result.output as { data?: string };
    return new Uint8Array(Buffer.from(out.data ?? "", "base64"));
  }

  it("unpacks a single dynamic input holding a list of one video", async () => {
    const node = new ConcatVideoNode();
    // One dynamic input wired to a list<video> with a single element. Without
    // flattening this is treated as one non-video object → empty output.
    node.setDynamic("videos", [videoRef([1, 2, 3, 4])]);

    const result = await node.process();

    expect(Array.from(outputBytes(result))).toEqual([1, 2, 3, 4]);
    // Single resolved part → fast path, no edit at all.
    expect(mediaCalls).toHaveLength(0);
  });

  it("concatenates a list of multiple videos from one input", async () => {
    const node = new ConcatVideoNode();
    node.setDynamic("videos", [videoRef([1, 2]), videoRef([3, 4])]);

    // The faked join throws, but the join must be invoked,
    // proving the list was flattened into multiple parts.
    await expect(node.process()).rejects.toThrow(/Concatenating videos failed/);
    expect(ffmpegArgString()).toContain("concat");
  });

  it("mixes a single-video input with a list input", async () => {
    const node = new ConcatVideoNode();
    node.setDynamic("intro", videoRef([1]));
    node.setDynamic("clips", [videoRef([2]), videoRef([3])]);

    await expect(node.process()).rejects.toThrow(/Concatenating videos failed/);
    expect(ffmpegArgString()).toContain("concat");
  });

  it("still concatenates separate single-video inputs (back-compat)", async () => {
    const node = new ConcatVideoNode();
    node.setDynamic("a", videoRef([1]));
    node.setDynamic("b", videoRef([2]));

    await expect(node.process()).rejects.toThrow(/Concatenating videos failed/);
    expect(ffmpegArgString()).toContain("concat");
  });
});
