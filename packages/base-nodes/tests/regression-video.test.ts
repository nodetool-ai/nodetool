/**
 * Regression tests for video node implementations.
 *
 * These tests verify that video nodes construct correct ffmpeg/ffprobe
 * commands and use proper filter strings. They mock child_process.execFile
 * to capture the arguments without requiring ffmpeg to be installed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promisify } from "node:util";

// Capture all execFile calls so we can inspect ffmpeg/ffprobe arguments
let execFileCalls: Array<{ cmd: string; args: string[] }> = [];

/**
 * Determine mock response for a given command + args.
 * Returns {stdout, stderr} for ffprobe, throws for ffmpeg.
 */
function mockResponse(
  cmd: string,
  args: string[]
): { stdout: string; stderr: string } {
  if (cmd === "ffprobe") {
    const argsStr = args.join(" ");
    if (
      argsStr.includes("-show_streams") &&
      argsStr.includes("-show_format")
    ) {
      return {
        stdout: JSON.stringify({
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              width: 1920,
              height: 1080,
              r_frame_rate: "30000/1001",
              nb_frames: "300"
            },
            { codec_type: "audio" }
          ],
          format: { duration: "10.01" }
        }),
        stderr: ""
      };
    } else if (argsStr.includes("r_frame_rate")) {
      return { stdout: "30000/1001\n", stderr: "" };
    } else if (argsStr.includes("format=duration")) {
      return { stdout: "10.5\n", stderr: "" };
    }
    return { stdout: "", stderr: "" };
  }
  // ffmpeg — simulate failure (no real temp files)
  throw new Error("mock ffmpeg: no real execution");
}

vi.mock("node:child_process", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;

  // Build a callback-style execFile that also has a custom promisify symbol.
  // This matches real Node.js child_process.execFile behavior where
  // promisify(execFile) returns {stdout, stderr} (not just stdout).
  const mockExecFile = (
    cmd: string,
    args: string[],
    optionsOrCb: unknown,
    maybeCb?: unknown
  ) => {
    execFileCalls.push({ cmd, args: [...args] });
    const cb =
      typeof optionsOrCb === "function"
        ? (optionsOrCb as (
            err: Error | null,
            stdout: string,
            stderr: string
          ) => void)
        : typeof maybeCb === "function"
          ? (maybeCb as (
              err: Error | null,
              stdout: string,
              stderr: string
            ) => void)
          : null;
    if (cb) {
      try {
        const resp = mockResponse(cmd, args);
        cb(null, resp.stdout, resp.stderr);
      } catch (err) {
        cb(err as Error, "", "");
      }
    }
  };

  // Add custom promisify so that promisify(execFile) returns {stdout, stderr}
  // just like the real Node.js implementation does.
  (mockExecFile as any)[Symbol.for("nodejs.util.promisify.custom")] = (
    cmd: string,
    args: string[],
    options?: unknown
  ): Promise<{ stdout: string; stderr: string }> => {
    execFileCalls.push({ cmd, args: [...args] });
    try {
      return Promise.resolve(mockResponse(cmd, args));
    } catch (err) {
      return Promise.reject(err);
    }
  };

  return {
    ...original,
    execFile: mockExecFile
  };
});

// We need to import the nodes AFTER mocking child_process
const {
  DenoiseVideoNode,
  StabilizeVideoNode,
  SharpnessVideoNode,
  ColorBalanceVideoNode,
  SetSpeedVideoNode,
  TransitionVideoNode,
  FpsNode,
  GetVideoInfoNode,
  TrimVideoNode,
  AddAudioVideoNode
} = await import("../src/index.js");

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

/** Find all ffmpeg calls and return their full argument strings */
function ffmpegCalls(): string[][] {
  return execFileCalls
    .filter((c) => c.cmd === "ffmpeg")
    .map((c) => c.args);
}

/** Find all ffprobe calls */
function ffprobeCalls(): string[][] {
  return execFileCalls
    .filter((c) => c.cmd === "ffprobe")
    .map((c) => c.args);
}

/** Concatenate all args into a single string for easy pattern matching */
function ffmpegArgString(): string {
  return ffmpegCalls()
    .map((a) => a.join(" "))
    .join("\n");
}

beforeEach(() => {
  execFileCalls = [];
});

// ─── 1. Denoise ────────────────────────────────────────────────────────────────

describe("DenoiseVideoNode — uses nlmeans filter with strength param", () => {
  it("constructs nlmeans filter, NOT hqdn3d", async () => {
    const node = new DenoiseVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      strength: 7
    });
    await node.process();

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
    await node.process();

    const args = ffmpegArgString();
    expect(args).toContain("nlmeans=s=5");
  });
});

// ─── 2. Stabilize ──────────────────────────────────────────────────────────────

describe("StabilizeVideoNode — uses deshake with smooth param", () => {
  it("constructs deshake filter with smooth parameter", async () => {
    const node = new StabilizeVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      smoothing: 15,
      crop_black: false
    });
    await node.process();

    const args = ffmpegArgString();
    expect(args).toContain("deshake");
    expect(args).toContain("smooth=15");
  });

  it("includes cropdetect and crop when crop_black=true", async () => {
    const node = new StabilizeVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      smoothing: 10,
      crop_black: true
    });
    await node.process();

    const args = ffmpegArgString();
    expect(args).toContain("deshake");
    expect(args).toContain("smooth=10");
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
    await node.process();

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
    await node.process();

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
    await node.process();

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
    await node.process();

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
    await node.process();

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
    await node.process();

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
    await node.process();

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
    await node.process();

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
    await node.process();

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
    await node.process();

    const args = ffmpegArgString();
    expect(args).toContain("transition=wipeleft");
    // Should NOT hardcode "fade" when wipeleft is specified
    expect(args).not.toContain("transition=fade");
  });

  it("computes offset from video_a duration, not hardcoded 0", async () => {
    const node = new TransitionVideoNode();
    node.assign({
      video_a: videoRef([1, 2, 3, 4]),
      video_b: videoRef([5, 6, 7, 8]),
      transition_type: "fade",
      duration: 1.0
    });
    await node.process();

    // The mock returns duration=10.5 for ffprobeDuration
    // offset should be 10.5 - 1.0 = 9.5
    const args = ffmpegArgString();
    expect(args).toContain("offset=9.5");
    expect(args).not.toContain("offset=0");
  });

  it("probes video_a duration via ffprobe before building filter", async () => {
    const node = new TransitionVideoNode();
    node.assign({
      video_a: videoRef([1, 2, 3, 4]),
      video_b: videoRef([5, 6, 7, 8]),
      transition_type: "dissolve",
      duration: 2.0
    });
    await node.process();

    // Should have called ffprobe to get duration
    const probes = ffprobeCalls();
    expect(probes.length).toBeGreaterThan(0);
    const probeArgs = probes.map((a) => a.join(" ")).join("\n");
    expect(probeArgs).toContain("duration");
  });
});

// ─── 7. Fps ────────────────────────────────────────────────────────────────────

describe("FpsNode — does NOT return hardcoded 24", () => {
  it("calls ffprobe and parses fractional FPS like 30000/1001", async () => {
    const node = new FpsNode();
    node.assign({
      video: videoRef([1, 2, 3, 4])
    });
    const result = await node.process();

    // Our mock returns "30000/1001" for r_frame_rate queries
    // 30000/1001 ≈ 29.97
    const fps = result.output as number;
    expect(fps).toBeCloseTo(29.97, 1);
    expect(fps).not.toBe(24);
  });

  it("invokes ffprobe to determine FPS", async () => {
    const node = new FpsNode();
    node.assign({
      video: videoRef([1, 2, 3, 4])
    });
    await node.process();

    const probes = ffprobeCalls();
    expect(probes.length).toBeGreaterThan(0);
    const probeArgs = probes.map((a) => a.join(" ")).join("\n");
    expect(probeArgs).toContain("r_frame_rate");
  });

  it("returns 0 for empty video, not 24", async () => {
    const node = new FpsNode();
    node.assign({
      video: videoRef([])
    });
    const result = await node.process();
    expect(result.output).toBe(0);
  });
});

// ─── 8. GetVideoInfo ───────────────────────────────────────────────────────────

describe("GetVideoInfoNode — does NOT return bytes.length / 24000 for duration", () => {
  it("calls ffprobe and returns parsed metadata", async () => {
    const node = new GetVideoInfoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4])
    });
    const result = await node.process();

    // Our mock returns duration=10.01, width=1920, height=1080, fps=30000/1001
    expect(result.duration).toBeCloseTo(10.01, 1);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.codec).toBe("h264");
    expect(result.has_audio).toBe(true);
  });

  it("duration does NOT equal bytes.length / 24000", async () => {
    const bytes = new Array(48000).fill(0);
    const node = new GetVideoInfoNode();
    node.assign({
      video: videoRef(bytes)
    });
    const result = await node.process();

    // If duration were bytes.length/24000, it would be 2.0
    // Our mock returns 10.01 from ffprobe
    expect(result.duration).not.toBe(bytes.length / 24000);
    expect(result.duration).toBeCloseTo(10.01, 1);
  });

  it("parses fractional FPS from r_frame_rate", async () => {
    const node = new GetVideoInfoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4])
    });
    const result = await node.process();

    // 30000/1001 ≈ 29.97
    const fps = result.fps as number;
    expect(fps).toBeCloseTo(29.97, 1);
  });

  it("invokes ffprobe, not manual byte counting", async () => {
    const node = new GetVideoInfoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4])
    });
    await node.process();

    const probes = ffprobeCalls();
    expect(probes.length).toBeGreaterThan(0);
    const probeArgs = probes.map((a) => a.join(" ")).join("\n");
    expect(probeArgs).toContain("show_streams");
    expect(probeArgs).toContain("show_format");
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
    await node.process();

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
    await node.process();

    const calls = ffmpegCalls();
    // Should have called ffmpeg (not just sliced bytes)
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
    await node.process();

    const args = ffmpegArgString();
    expect(args).toContain("-ss");
    expect(args).toContain("3");
    expect(args).not.toContain("-to");
  });

  it("uses -c copy for stream copying", async () => {
    const node = new TrimVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      start_time: 1,
      end_time: 4
    });
    await node.process();

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
    await node.process();

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
    await node.process();

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
    await node.process();

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
    await node.process();

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
    await node.process();

    const args = ffmpegArgString();
    expect(args).not.toContain("amix");
  });
});
