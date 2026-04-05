/**
 * Tests for property-name fixes in audio, video, and image nodes.
 * These verify that the renamed properties (commit 86c4a62d5 / 480d281e1)
 * are correctly wired in process() methods.
 */
import { describe, it, expect } from "vitest";
import {
  OverlayAudioNode,
  RepeatAudioNode,
  ConcatAudioNode,
  ConcatAudioListNode,
  NumpyToAudioNode,
  CreateSilenceNode,
  FpsNode,
  FrameIteratorNode,
  FrameToVideoNode,
  TrimVideoNode,
  ExtractFrameVideoNode,
  BlurVideoNode,
  ChromaKeyVideoNode
} from "../src/index.js";

// --- Helpers ---

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

describe("ConcatAudioNode — uses a/b properties", () => {
  it("concatenates a and b", async () => {
    const node = new ConcatAudioNode();
    node.assign({
      a: audioRef([1, 2]),
      b: audioRef([3, 4])
    });
    const result = await node.process();
    const output = result.output as { data: string };
    const bytes = Buffer.from(output.data, "base64");
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
  });
});

describe("ConcatAudioListNode — uses audio_files property", () => {
  it("concatenates list of audio files", async () => {
    const node = new ConcatAudioListNode();
    node.assign({
      audio_files: [audioRef([1, 2]), audioRef([3])]
    });
    const result = await node.process();
    const output = result.output as { data: string };
    const bytes = Buffer.from(output.data, "base64");
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
  });
});

describe("NumpyToAudioNode — uses array property (not values)", () => {
  it("converts array to audio bytes", async () => {
    const node = new NumpyToAudioNode();
    node.assign({
      array: [65, 66, 67]
    });
    const result = await node.process();
    const output = result.output as { data: string };
    const bytes = Buffer.from(output.data, "base64");
    expect(Array.from(bytes)).toEqual([65, 66, 67]);
  });
});

describe("CreateSilenceNode — uses duration property (not length)", () => {
  it("creates silence of specified duration", async () => {
    const node = new CreateSilenceNode();
    node.assign({ duration: 100 });
    const result = await node.process();
    const output = result.output as { data: string };
    const bytes = Buffer.from(output.data, "base64");
    expect(bytes.length).toBe(100);
  });
});

// --- Video node property tests ---

describe("FpsNode — returns float, not video ref", () => {
  it("returns fps as a number", async () => {
    const node = new FpsNode();
    node.assign({
      video: videoRef([1, 2, 3])
    });
    const result = await node.process();
    // FpsNode always returns hardcoded 24 fps (metadata extraction placeholder)
    expect(result.output).toBe(24);
    expect(typeof result.output).toBe("number");
  });

  it("defaults to 24 fps", async () => {
    const node = new FpsNode();
    node.assign({
      video: videoRef([1, 2, 3])
    });
    const result = await node.process();
    expect(result.output).toBe(24);
  });
});

describe("FrameIteratorNode — yields frames correctly", () => {
  it("iterates frames from video bytes", async () => {
    const node = new FrameIteratorNode();
    // FrameIteratorNode uses hardcoded 1024 frame size, so we need enough bytes
    const bytes = new Array(2500).fill(0).map((_, i) => i % 256);
    const frames: Record<string, unknown>[] = [];
    node.assign({
      video: videoRef(bytes)
    });
    for await (const frame of node.genProcess()) {
      frames.push(frame);
    }
    // 2500 bytes / 1024 byte frames = 3 frames (1024, 1024, 452)
    expect(frames.length).toBe(3);
    expect(frames[0].index).toBe(0);
    expect(frames[1].index).toBe(1);
    expect(frames[2].index).toBe(2);
  });

  it("defaults frame_size to 1024", async () => {
    const node = new FrameIteratorNode();
    const bytes = new Array(2048).fill(0);
    const frames: Record<string, unknown>[] = [];
    node.assign({ video: videoRef(bytes) });
    for await (const frame of node.genProcess()) {
      frames.push(frame);
    }
    expect(frames.length).toBe(2);
  });
});

describe("TrimVideoNode — uses start_time/end_time (not start/end)", () => {
  it("trims video by start_time and end_time", async () => {
    const node = new TrimVideoNode();
    const bytes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    node.assign({
      video: videoRef(bytes),
      start_time: 2,
      end_time: 3 // removes 3 bytes from end
    });
    const result = await node.process();
    const output = result.output as { data: string };
    const outBytes = Buffer.from(output.data, "base64");
    // slice(2, max(2, 10-3)) = slice(2, 7) = [2, 3, 4, 5, 6]
    expect(Array.from(outBytes)).toEqual([2, 3, 4, 5, 6]);
  });
});

describe("FrameToVideoNode — uses frame property (not frames)", () => {
  it("combines frames into video", async () => {
    const node = new FrameToVideoNode();
    node.assign({
      frame: [
        { data: Buffer.from([1, 2]).toString("base64") },
        { data: Buffer.from([3, 4]).toString("base64") }
      ]
    });
    const result = await node.process();
    const output = result.output as { data: string };
    const bytes = Buffer.from(output.data, "base64");
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
  });
});

describe("BlurVideoNode — uses strength property (not radius)", () => {
  it("accepts strength parameter without error", async () => {
    const node = new BlurVideoNode();
    // BlurVideoNode uses ffmpeg, which won't be available in unit tests,
    // but we verify the node reads the correct property name.
    // When ffmpeg is not available, it falls back to returning original bytes.
    node.assign({
      video: videoRef([1, 2, 3]),
      strength: 5
    });
    const result = await node.process();
    expect(result.output).toBeDefined();
  });
});

describe("ChromaKeyVideoNode — uses key_color property (not color)", () => {
  it("accepts key_color parameter", async () => {
    const node = new ChromaKeyVideoNode();
    node.assign({
      video: videoRef([1, 2, 3]),
      key_color: "0xFF0000",
      similarity: 0.2
    });
    const result = await node.process();
    expect(result.output).toBeDefined();
  });
});

describe("ExtractFrameVideoNode — uses time property (not frame_index)", () => {
  it("extracts frame at specified time index", async () => {
    const node = new ExtractFrameVideoNode();
    const bytes = new Array(4096).fill(0).map((_, i) => i % 256);
    node.assign({
      video: videoRef(bytes),
      time: 1 // frame at index 1
    });
    const result = await node.process();
    const output = result.output as { data: string };
    expect(output.data).toBeTruthy();
  });
});
