import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runInSandbox } from "../src/js-sandbox.js";
import { createAudioBridge } from "../src/sandbox-av-media.js";

function toneWav(durationSeconds = 0.5): Uint8Array {
  const sampleRate = 8_000;
  const samples = Math.round(sampleRate * durationSeconds);
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string): void => {
    for (let i = 0; i < value.length; i += 1) {
      bytes[offset + i] = value.charCodeAt(i);
    }
  };
  text(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i += 1) {
    const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.25;
    view.setInt16(44 + i * 2, Math.round(sample * 0x7fff), true);
  }
  return bytes;
}

function floatToneWav(durationSeconds = 0.1): Uint8Array {
  const sampleRate = 8_000;
  const samples = Math.round(sampleRate * durationSeconds);
  const bytes = new Uint8Array(44 + samples * 4);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string): void => {
    for (let i = 0; i < value.length; i += 1) {
      bytes[offset + i] = value.charCodeAt(i);
    }
  };
  text(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 32, true);
  text(36, "data");
  view.setUint32(40, samples * 4, true);
  for (let i = 0; i < samples; i += 1) {
    view.setFloat32(
      44 + i * 4,
      Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.25,
      true
    );
  }
  return bytes;
}

function dataUri(mimeType: string, bytes: Uint8Array): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe("audio handles", () => {
  it("cancels cooperative PCM processing", async () => {
    const controller = new AbortController();
    const operation = createAudioBridge(
      controller.signal,
      16 * 1024 * 1024
    ).reverse(toneWav(120));
    setTimeout(() => controller.abort(), 1);

    await expect(operation).rejects.toMatchObject({ name: "AbortError" });
  });

  it("reports an unavailable ref without aborting the runtime", async () => {
    const result = await runInSandbox({
      code: "return await audio.info(source);",
      timeoutMs: 60_000,
      globals: { source: { type: "audio", uri: "asset://missing.wav" } }
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("cannot resolve asset://missing.wav");
    expect(result.error).not.toMatch(/gc_obj_list|Assertion failed/);
  });

  it("chains audio operations without returning bytes to the guest", async () => {
    const first = { type: "audio", uri: dataUri("audio/wav", toneWav(0.25)) };
    const second = { type: "audio", uri: dataUri("audio/wav", toneWav(0.25)) };
    const result = await runInSandbox({
      code: `
        const joined = await audio.concat([first, second]);
        const trimmed = await audio.trim(joined, { start: 0.1, end: 0.4 });
        const info = await audio.info(trimmed);
        return { handle: trimmed, info };
      `,
      context: {} as never,
      timeoutMs: 60_000,
      globals: { first, second }
    });

    expect(result.error).toBeUndefined();
    expect(result.result).toMatchObject({
      handle: {
        type: "audio",
        mimeType: "audio/wav"
      },
      info: {
        format: "wav",
        channels: 1,
        sample_rate: 8_000
      }
    });
    const output = result.result as {
      handle: { uri: string; byteLength: number; 0?: number };
      info: { duration: number };
    };
    expect(output.handle.uri).toMatch(/^sandbox:\/\/media\//);
    expect(output.handle.byteLength).toBeGreaterThan(44);
    expect(output.handle[0]).toBeUndefined();
    expect(output.info.duration).toBeCloseTo(0.3, 2);
  });

  it("normalizes float WAV input through Mediabunny", async () => {
    const source = {
      type: "audio",
      uri: dataUri("audio/wav", floatToneWav())
    };
    const result = await runInSandbox({
      code: `
        const normalized = await audio.normalize(source);
        return { normalized, info: await audio.info(normalized) };
      `,
      context: {} as never,
      timeoutMs: 60_000,
      globals: { source }
    });

    expect(result.error).toBeUndefined();
    expect(result.result).toMatchObject({
      normalized: { type: "audio", mimeType: "audio/wav" },
      info: { format: "wav", codec: "pcm-s16" }
    });
  });

  it("rejects an expanded audio result above the run media limit", async () => {
    const source = {
      type: "audio",
      uri: dataUri("audio/wav", toneWav(0.5))
    };
    const result = await runInSandbox({
      code: "return await audio.repeat(source, { loops: 100 });",
      context: {} as never,
      globals: { source },
      limits: { runMediaBytes: 1024 * 1024 }
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("decoded audio exceeds the run media limit");
  });

  it("rejects addAudio inputs that do not contain the required tracks", async () => {
    const wav = dataUri("audio/wav", toneWav(0.1));
    const result = await runInSandbox({
      code: "return await video.addAudio(fakeVideo, soundtrack);",
      context: {} as never,
      globals: {
        fakeVideo: { type: "video", uri: wav },
        soundtrack: { type: "audio", uri: wav }
      }
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("video input has no usable video track");
  });

  it("rejects a handle of the wrong media type", async () => {
    const result = await runInSandbox({
      code: `
        const clip = await audio.trim(source, { start: 0, end: 0.1 });
        return await video.info(clip);
      `,
      context: {} as never,
      globals: {
        source: {
          type: "audio",
          uri: dataUri("audio/wav", toneWav(0.25))
        }
      }
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Expected a video handle");
  });

  it("preserves a source MIME when it promotes video", async () => {
    const webm = new Uint8Array([
      0x1a,
      0x45,
      0xdf,
      0xa3,
      ...Buffer.from("webm")
    ]);
    const result = await runInSandbox({
      code: "return await video.toAsset(source);",
      context: {} as never,
      globals: {
        source: { type: "video", uri: dataUri("video/webm", webm) }
      }
    });

    expect(result.error).toBeUndefined();
    expect(result.result).toMatchObject({
      type: "video",
      mimeType: "video/webm"
    });
  });

  it("preserves a ref MIME when it promotes audio", async () => {
    const result = await runInSandbox({
      code: "return await audio.toAsset(source);",
      context: {} as never,
      globals: {
        source: {
          type: "audio",
          uri: dataUri("audio/mpeg", new Uint8Array(Buffer.from("ID3test")))
        }
      }
    });

    expect(result.error).toBeUndefined();
    expect(result.result).toMatchObject({
      type: "audio",
      mimeType: "audio/mpeg"
    });
  });

  it("loads host-side transform refs larger than the guest transfer limit", async () => {
    const largeVideo = new Uint8Array(16 * 1024 * 1024 + 1);
    largeVideo.set([0x1a, 0x45, 0xdf, 0xa3, ...Buffer.from("webm")]);
    const result = await runInSandbox({
      code: "return await video.toAsset(source);",
      globals: { source: { type: "video", uri: "asset://large-video" } },
      resolveMediaRef: async () => largeVideo,
      promoteMedia: async (type, bytes, options) => ({
        type,
        mimeType: options?.mimeType,
        byteLength: bytes.length
      }),
      timeoutMs: 60_000
    });

    expect(result.error).toBeUndefined();
    expect(result.result).toMatchObject({
      type: "video",
      mimeType: "video/webm",
      byteLength: largeVideo.length
    });
  });
});

describe.runIf(hasFfmpeg)("combined video and audio handles", () => {
  let tempDir = "";
  let videoBytes = new Uint8Array();

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sandbox-media-test-"));
    const videoPath = path.join(tempDir, "silent.mp4");
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=64x64:d=0.5",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        videoPath
      ],
      { stdio: "ignore" }
    );
    videoBytes = new Uint8Array(await fs.readFile(videoPath));
  });

  afterAll(async () => {
    if (tempDir !== "") {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("adds audio to video and returns cross-type extraction handles", async () => {
    const sourceVideo = {
      type: "video",
      uri: dataUri("video/mp4", videoBytes)
    };
    const soundtrack = {
      type: "audio",
      uri: dataUri("audio/wav", toneWav(0.5))
    };
    const result = await runInSandbox({
      code: `
        const combined = await video.addAudio(sourceVideo, soundtrack);
        const videoInfo = await video.info(combined);
        const extracted = await video.extractAudio(combined);
        const audioInfo = await audio.info(extracted);
        return { combined, videoInfo, extracted, audioInfo };
      `,
      context: {} as never,
      timeoutMs: 60_000,
      globals: { sourceVideo, soundtrack }
    });

    expect(result.error).toBeUndefined();
    expect(result.result).toMatchObject({
      combined: { type: "video", mimeType: "video/mp4" },
      videoInfo: { width: 64, height: 64, has_audio: true },
      extracted: { type: "audio", mimeType: "audio/wav" },
      audioInfo: { format: "wav", channels: 1 }
    });
  }, 60_000);
});
