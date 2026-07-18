/**
 * Tests for property-name fixes in audio, video, and image nodes.
 * These verify that the renamed properties (commit 86c4a62d5 / 480d281e1)
 * are correctly wired in process() methods.
 */
import { spawnSync } from "node:child_process";
import { describe, it, expect } from "vitest";
import {
  OverlayAudioNode,
  RepeatAudioNode,
  ConcatAudioNode,
  ConcatAudioListNode,
  CreateSilenceNode,
  FpsNode,
  ForEachFrameNode,
  FrameToVideoNode,
  TrimVideoNode,
  ExtractFrameVideoNode,
  BlurVideoNode,
  ChromaKeyVideoNode
} from "../src/index.js";

// --- Helpers ---

/**
 * Whether the `ffmpeg` binary is on PATH. The video effect nodes shell out to
 * ffmpeg and, as of the codec-hardening pass, a MISSING binary throws a clear
 * "ffmpeg is not installed" error instead of silently passing the input video
 * through unprocessed. Tests that exercise those nodes are gated on this so
 * they run meaningfully where ffmpeg exists and skip (not false-fail) where it
 * doesn't — e.g. the CI quality gate, which has no ffmpeg installed.
 */
function ffmpegAvailable(): boolean {
  try {
    const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return !r.error && r.status === 0;
  } catch {
    return false;
  }
}
const HAS_FFMPEG = ffmpegAvailable();

function audioRef(bytes: number[]) {
  return {
    type: "audio",
    uri: "",
    data: Buffer.from(new Uint8Array(bytes)).toString("base64")
  };
}

function videoRef(bytes: number[]) {
  return {
    type: "video",
    uri: "",
    data: Buffer.from(new Uint8Array(bytes)).toString("base64")
  };
}

/**
 * Build a minimal mono 16-bit PCM WAV from int16 sample values. The concat
 * nodes decode every input to PCM and join in sample space (non-audio bytes are
 * rejected), so their fixtures must be real WAV files, not arbitrary bytes.
 */
function wavRef(samples: number[], sampleRate = 8000) {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byteRate = sampleRate * blockAlign
  buf.writeUInt16LE(2, 32); // blockAlign = channels * bytesPerSample
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(samples[i], 44 + i * 2);
  }
  return { type: "audio", uri: "", data: buf.toString("base64") };
}

/** Read the int16 PCM samples out of a canonical 44-byte-header WAV buffer. */
function samplesOf(wav: Buffer): number[] {
  expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
  const samples: number[] = [];
  for (let i = 44; i + 2 <= wav.length; i += 2) {
    samples.push(wav.readInt16LE(i));
  }
  return samples;
}

// --- Audio node property tests ---

describe("OverlayAudioNode — uses a/b properties (not audio_a/audio_b)", () => {
  it("overlays two audio inputs via inputs.a and inputs.b", async () => {
    const node = new OverlayAudioNode();
    node.assign({
      a: audioRef([10, 20, 30]),
      b: audioRef([5, 25, 15])
    });
    const result = await node.process();
    const output = result.output as { data: string };
    const bytes = Buffer.from(output.data, "base64");
    // OverlayAudioNode takes max of each sample
    expect(bytes[0]).toBe(10);
    expect(bytes[1]).toBe(25);
    expect(bytes[2]).toBe(30);
  });

  it("does NOT read from old audio_a / audio_b properties", async () => {
    const node = new OverlayAudioNode();
    node.assign({
      audio_a: audioRef([99]),
      audio_b: audioRef([99])
    });
    const result = await node.process();
    // Without a/b, both inputs are empty → output should be empty
    const output = result.output as { data: string };
    const bytes = Buffer.from(output.data, "base64");
    expect(bytes.length).toBe(0);
  });
});

describe("RepeatAudioNode — uses loops property (not count)", () => {
  it("repeats audio by loops count", async () => {
    const node = new RepeatAudioNode();
    node.assign({
      audio: audioRef([1, 2]),
      loops: 3
    });
    const result = await node.process();
    const output = result.output as { data: string };
    const bytes = Buffer.from(output.data, "base64");
    expect(bytes.length).toBe(6); // 2 bytes × 3 loops
  });

  it("defaults to 2 loops", async () => {
    const node = new RepeatAudioNode();
    node.assign({
      audio: audioRef([1, 2, 3])
    });
    const result = await node.process();
    const output = result.output as { data: string };
    const bytes = Buffer.from(output.data, "base64");
    expect(bytes.length).toBe(6); // 3 bytes × 2 loops
  });
});

describe("ConcatAudioNode — fully dynamic inputs", () => {
  it("concatenates dynamic inputs in insertion order", async () => {
    const node = new ConcatAudioNode();
    node.assign({
      audio_1: wavRef([100, 200]),
      audio_2: wavRef([300, 400])
    });
    const result = await node.process();
    const output = result.output as { data: string };
    const bytes = Buffer.from(output.data, "base64");
    expect(samplesOf(bytes)).toEqual([100, 200, 300, 400]);
  });
});

describe("ConcatAudioListNode — uses audio_files property", () => {
  it("concatenates list of audio files", async () => {
    const node = new ConcatAudioListNode();
    node.assign({
      audio_files: [wavRef([100, 200]), wavRef([300])]
    });
    const result = await node.process();
    const output = result.output as { data: string };
    const bytes = Buffer.from(output.data, "base64");
    expect(samplesOf(bytes)).toEqual([100, 200, 300]);
  });
});

describe("CreateSilenceNode — uses duration property (not length)", () => {
  it("creates a valid WAV of the specified duration", async () => {
    const node = new CreateSilenceNode();
    node.assign({ duration: 0.01, sample_rate: 8000 });
    const result = await node.process();
    const output = result.output as { data: string };
    const bytes = Buffer.from(output.data, "base64");
    // Emits a real RIFF/WAVE file, not a bare byte buffer.
    expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
    expect(bytes.toString("ascii", 8, 12)).toBe("WAVE");
    // 44-byte header + frames * 2 bytes (16-bit mono); frames = duration * rate.
    const frames = Math.round(0.01 * 8000);
    expect(bytes.length).toBe(44 + frames * 2);
  });
});

// --- Video node property tests ---

describe("FpsNode — uses ffprobe for fps extraction", () => {
  it("returns 0 for empty video", async () => {
    const node = new FpsNode();
    node.assign({
      video: videoRef([])
    });
    const result = await node.process();
    expect(result.output).toBe(0);
    expect(typeof result.output).toBe("number");
  });

  it("returns 0 for undecodable data, or throws when ffprobe is missing", async () => {
    const node = new FpsNode();
    node.assign({
      video: videoRef([1, 2, 3])
    });
    // A genuine probe failure (garbage bytes) degrades to 0; a missing
    // ffprobe binary must surface as an actionable error instead.
    try {
      const result = await node.process();
      expect(result.output).toBe(0);
    } catch (error) {
      expect((error as Error).message).toContain("ffprobe is not installed");
    }
  });
});

describe("ForEachFrameNode — uses ffmpeg for frame extraction", () => {
  it("yields nothing for empty video", async () => {
    const node = new ForEachFrameNode();
    const frames: Record<string, unknown>[] = [];
    node.assign({
      video: videoRef([])
    });
    for await (const frame of node.genProcess()) {
      frames.push(frame);
    }
    expect(frames.length).toBe(0);
  });
});

describe("TrimVideoNode — uses ffmpeg for trimming", () => {
  it("returns empty video ref for empty input", async () => {
    const node = new TrimVideoNode();
    node.assign({
      video: videoRef([]),
      start_time: 0,
      end_time: -1
    });
    const result = await node.process();
    const output = result.output as { type: string };
    expect(output.type).toBe("video");
  });
});

describe("FrameToVideoNode — uses frame property (not frames)", () => {
  it("reads frames from the frame property", async () => {
    const node = new FrameToVideoNode();
    node.assign({
      frame: [
        { data: Buffer.from([1, 2]).toString("base64") },
        { data: Buffer.from([3, 4]).toString("base64") }
      ]
    });
    // Both frames are read from `frame` and written to disk, after which
    // ffmpeg fails on the fake PNG bytes (or is missing) and the node
    // throws. If the property were misread, the node would resolve with an
    // empty video instead.
    await expect(node.process()).rejects.toThrow(
      "Combining frames into a video failed"
    );
  });
});

describe("BlurVideoNode — uses strength property (not radius)", () => {
  // Requires ffmpeg: the node shells out to it. The invalid (3-byte) input makes
  // ffmpeg fail, which the node surfaces as an error rather than passing the
  // input through — but the filter args are built from `strength` before that,
  // so a misread property name would instead give the `radius <= 0` early
  // return and resolve. Skipped when ffmpeg is absent, where the node throws a
  // missing-binary error for an unrelated reason.
  it.skipIf(!HAS_FFMPEG)("reads the blur radius from strength", async () => {
    const node = new BlurVideoNode();
    node.assign({
      video: videoRef([1, 2, 3]),
      strength: 5
    });
    await expect(node.process()).rejects.toThrow("ffmpeg failed");
  });
});

describe("ChromaKeyVideoNode — uses key_color property (not color)", () => {
  // `key_color` is a color object, not a bare string. The node builds its
  // colorkey filter from it and then fails on the invalid (3-byte) input, so
  // reaching the ffmpeg error means assign() accepted the property under its
  // current name. Skipped without ffmpeg, where the failure is unrelated.
  it.skipIf(!HAS_FFMPEG)("accepts key_color parameter", async () => {
    const node = new ChromaKeyVideoNode();
    node.assign({
      video: videoRef([1, 2, 3]),
      key_color: { value: "#FF0000" },
      similarity: 0.2
    });
    await expect(node.process()).rejects.toThrow("ffmpeg failed");
  });
});

describe("ExtractFrameVideoNode — uses ffmpeg for frame extraction", () => {
  it("returns null image for empty video", async () => {
    const node = new ExtractFrameVideoNode();
    node.assign({
      video: videoRef([]),
      time: 0
    });
    const result = await node.process();
    const output = result.output as { type: string; data: unknown };
    expect(output.type).toBe("image");
    expect(output.data).toBeNull();
  });
});
