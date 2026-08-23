/**
 * The `video` bridge's muxing path — real Mediabunny conversions, no network.
 *
 * `video.addAudio` hardcoded AAC, which Chrome cannot encode on Linux (it
 * encodes AAC through Media Foundation on Windows and AudioToolbox on macOS),
 * so every call failed there with "required tracks cannot be encoded as MP4".
 * These assert the codec is chosen from what the platform can actually encode.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { registerMediabunnyServer } from "@mediabunny/server";
import {
  BufferTarget,
  Mp4OutputFormat,
  Output,
  VideoSample,
  VideoSampleSource,
  getEncodableAudioCodecs
} from "mediabunny";

// Spy on the capability probe so a host that *has* AAC can still exercise the
// no-AAC path. Everything else is the real Mediabunny.
const codecProbe = vi.hoisted(() => vi.fn());
vi.mock("mediabunny", async (importOriginal) => {
  const actual = await importOriginal<typeof import("mediabunny")>();
  return { ...actual, getFirstEncodableAudioCodec: codecProbe };
});

const actualMediabunny =
  await vi.importActual<typeof import("mediabunny")>("mediabunny");

import { createVideoBridge } from "../src/sandbox-av-media.js";

// The bridge registers these lazily on its first call; the fixture below
// encodes before that happens, so register up front.
beforeAll(() => {
  registerMediabunnyServer();
});

beforeEach(() => {
  codecProbe.mockImplementation(actualMediabunny.getFirstEncodableAudioCodec);
});

const WIDTH = 16;
const HEIGHT = 16;
const FPS = 25;
const FRAMES = 7;

/** A silent H.264 MP4, encoded rather than checked in as a base64 blob. */
async function silentMp4(): Promise<Uint8Array> {
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const source = new VideoSampleSource({
    codec: "avc",
    bitrate: 100_000,
    // A hardware probe can find NVENC even when the installed driver cannot
    // open it. Use a software encoder so the fixture is portable and stable.
    hardwareAcceleration: "prefer-software"
  });
  output.addVideoTrack(source, { frameRate: FPS });
  await output.start();
  for (let frame = 0; frame < FRAMES; frame += 1) {
    const data = new Uint8Array(WIDTH * HEIGHT * 4);
    for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 1) {
      data[pixel * 4] = (frame * 36) % 256;
      data[pixel * 4 + 1] = (pixel * 7) % 256;
      data[pixel * 4 + 2] = 128;
      data[pixel * 4 + 3] = 255;
    }
    const sample = new VideoSample(data, {
      format: "RGBA",
      codedWidth: WIDTH,
      codedHeight: HEIGHT,
      timestamp: frame / FPS,
      duration: 1 / FPS
    });
    await source.add(sample);
    sample.close();
  }
  await output.finalize();
  return new Uint8Array(target.buffer as ArrayBuffer);
}

/** A 0.25s 440Hz mono tone. */
function toneWav(): Uint8Array {
  const sampleRate = 8_000;
  const sampleCount = 2_000;
  const bytes = new Uint8Array(44 + sampleCount * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      bytes[offset + index] = value.charCodeAt(index);
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
  view.setUint32(40, sampleCount * 2, true);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 0.25;
    view.setInt16(44 + index * 2, Math.round(sample * 0x7fff), true);
  }
  return bytes;
}

describe("video.addAudio", () => {
  it("muxes a soundtrack into the video and reports the audio track", async () => {
    const video = createVideoBridge();
    const combined = await video.addAudio(await silentMp4(), toneWav());

    const info = await video.info(combined);
    expect(info).toMatchObject({
      width: WIDTH,
      height: HEIGHT,
      has_audio: true
    });
  });

  it("encodes the audio with a codec this platform actually has", async () => {
    const encodable = await getEncodableAudioCodecs();
    expect(encodable.some((codec) => codec === "aac" || codec === "opus")).toBe(
      true
    );

    const video = createVideoBridge();
    const combined = await video.addAudio(await silentMp4(), toneWav());
    expect((await video.info(combined)).has_audio).toBe(true);
  });

  it("asks the platform which codec to use rather than assuming AAC", async () => {
    // The regression: "aac" was hardcoded, so a host that cannot encode it —
    // Chrome on Linux — silently produced no audio track and the mux failed.
    const video = createVideoBridge();
    await video.addAudio(await silentMp4(), toneWav());

    expect(codecProbe).toHaveBeenCalledWith(
      ["aac", "opus"],
      expect.objectContaining({ numberOfChannels: 1, sampleRate: 8_000 })
    );
  });

  it("falls back to Opus when the platform cannot encode AAC", async () => {
    // Stand in for Chrome-on-Linux: the probe reports Opus as the best
    // available MP4 audio codec, and the mux has to succeed on it.
    codecProbe.mockResolvedValue("opus");

    const video = createVideoBridge();
    const combined = await video.addAudio(await silentMp4(), toneWav());

    expect((await video.info(combined)).has_audio).toBe(true);
  });

  it("fails with a clear message when no MP4 audio codec is encodable", async () => {
    codecProbe.mockResolvedValue(null);

    const video = createVideoBridge();
    await expect(
      video.addAudio(await silentMp4(), toneWav())
    ).rejects.toThrow(/neither AAC nor Opus/);
  });

  it("keeps the result trimmable and frame-extractable", async () => {
    const video = createVideoBridge();
    const combined = await video.addAudio(await silentMp4(), toneWav());
    const trimmed = await video.trim(combined, { start: 0, end: 0.2 });

    expect((await video.info(trimmed)).has_audio).toBe(true);
    const frame = await video.extractFrame(trimmed, 0);
    expect(frame.byteLength).toBeGreaterThan(0);
  });
});
