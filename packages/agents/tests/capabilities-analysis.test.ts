/**
 * The `analysis` capability module, driven end to end over media synthesized
 * in the test.
 *
 * The DSP itself is checked in `audio-dsp.test.ts` and `video-frames.test.ts`;
 * what this covers is everything between a caller's argument and those
 * numbers — reference resolution and its refusals, the Mediabunny decode, the
 * parameter clamps, and the shape of the answer. The signals are built so the
 * right answer is known: a WAV that is a -20 dBFS 1 kHz tone with a second of
 * silence in the middle, and an MP4 that is two seconds of black followed by
 * two seconds of white.
 */

import { describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  ALL_FORMATS,
  BufferTarget,
  Mp4OutputFormat,
  Output,
  VideoSample,
  VideoSampleSource,
  getFirstEncodableVideoCodec
} from "mediabunny";
import { module as analysisModule } from "../src/capabilities/analysis.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/index.js";
import {
  capabilityModuleIssues,
  loadCapabilityModule
} from "../src/capabilities/registry.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import { registerMediabunnyServer } from "@mediabunny/server";

registerMediabunnyServer();

const SAMPLE_RATE = 44100;

/**
 * A run over an empty asset store. Everything here is passed as a `data:` URI,
 * so the only thing the context has to do is answer "no such asset" the way a
 * real one does for an id nobody minted.
 */
const run = createCapabilityRun({
  context: {
    resolveAssetBytes: async () => ({ bytes: null, attempts: [] })
  } as unknown as ProcessingContext,
  gate: UNGATED
});

const call = (
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> =>
  run.invoke(name, args) as Promise<Record<string, unknown>>;

/** A 16-bit PCM WAV of the given interleaved float samples. */
function wav(samples: Float32Array, channels: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      bytes[offset + index] = text.charCodeAt(index);
    }
  };
  ascii(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(44 + index * 2, Math.round(value * 0x7fff), true);
  }
  return bytes;
}

/** `data:` URI for bytes, the reference form that needs no asset store. */
function dataUri(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

/**
 * Tone, one second of digital silence, tone — 5 s total at -20 dBFS, so the
 * loudness, the silence boundaries and the two onsets are all known up front.
 */
function toneWithGap(): Uint8Array {
  const total = SAMPLE_RATE * 5;
  const samples = new Float32Array(total);
  const amplitude = 10 ** (-20 / 20);
  for (let index = 0; index < total; index += 1) {
    const seconds = index / SAMPLE_RATE;
    if (seconds >= 2 && seconds < 3) continue;
    samples[index] =
      amplitude * Math.sin((2 * Math.PI * 1000 * index) / SAMPLE_RATE);
  }
  return wav(samples, 1);
}

const VIDEO_WIDTH = 128;
const VIDEO_HEIGHT = 72;
const VIDEO_FPS = 10;
const VIDEO_FRAMES = 40;

/** Encode a 4 s clip whose every frame is the grey `level(index)` returns. */
async function greyVideo(
  level: (frameIndex: number) => number
): Promise<Uint8Array> {
  const codec = await getFirstEncodableVideoCodec(
    ["avc", "vp9", "vp8", "av1"],
    { width: VIDEO_WIDTH, height: VIDEO_HEIGHT }
  );
  if (!codec) throw new Error("no encodable video codec on this host");
  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget()
  });
  const source = new VideoSampleSource({ codec, bitrate: 1_000_000 });
  output.addVideoTrack(source, { frameRate: VIDEO_FPS });
  await output.start();
  for (let index = 0; index < VIDEO_FRAMES; index += 1) {
    const rgba = new Uint8Array(VIDEO_WIDTH * VIDEO_HEIGHT * 4);
    const value = level(index);
    for (let pixel = 0; pixel < VIDEO_WIDTH * VIDEO_HEIGHT; pixel += 1) {
      rgba[pixel * 4] = value;
      rgba[pixel * 4 + 1] = value;
      rgba[pixel * 4 + 2] = value;
      rgba[pixel * 4 + 3] = 255;
    }
    const sample = new VideoSample(rgba, {
      format: "RGBA",
      codedWidth: VIDEO_WIDTH,
      codedHeight: VIDEO_HEIGHT,
      timestamp: index / VIDEO_FPS,
      duration: 1 / VIDEO_FPS
    });
    await source.add(sample);
    sample.close();
  }
  await output.finalize();
  const buffer = output.target.buffer;
  if (!buffer) throw new Error("encoding produced no bytes");
  return new Uint8Array(buffer);
}

/** Two seconds of black then two of white, at 10 fps — one cut, at 2 s. */
const twoShotVideo = (): Promise<Uint8Array> =>
  greyVideo((index) => (index < VIDEO_FRAMES / 2 ? 0 : 255));

/** Four seconds of one unchanging colour — no cut anywhere in it. */
const solidVideo = (level: number): Promise<Uint8Array> =>
  greyVideo(() => level);

let audioUri: string;
let videoUri: string;

describe("analysis capability module", () => {
  it("is registered and drift-clean", async () => {
    const loaded = await loadCapabilityModule("analysis");
    expect(loaded).toBe(analysisModule);
    expect(capabilityModuleIssues("analysis", loaded)).toEqual([]);
  });

  it("carries the five wire names, all classified read", () => {
    expect(analysisModule.exports.map((entry) => entry.spec.name)).toEqual([
      "analyze_audio",
      "analyze_audio_spectrum",
      "detect_audio_events",
      "analyze_video",
      "detect_video_scenes"
    ]);
    for (const entry of analysisModule.exports) {
      expect([entry.spec.name, entry.spec.category]).toEqual([
        entry.spec.name,
        permissionCategoryFor(entry.spec.name)
      ]);
      expect(entry.spec.category).toBe("read");
    }
  });
});

describe("reference resolution", () => {
  it("refuses a missing reference", async () => {
    expect(await call("analyze_audio", {})).toMatchObject({
      error: expect.stringContaining("audio is required")
    });
    expect(await call("analyze_video", { video: "  " })).toMatchObject({
      error: expect.stringContaining("video is required")
    });
  });

  it("refuses a filesystem path and says what to pass instead", async () => {
    const result = await call("analyze_audio", { audio: "/tmp/take.wav" });
    expect(String(result.error)).toContain("does not take filesystem paths");
    expect(String(result.error)).toContain("asset://");
  });

  it("reports a reference that resolves to nothing", async () => {
    const result = await call("analyze_audio", {
      audio: "asset://does-not-exist"
    });
    expect(String(result.error)).toContain("resolved to no bytes");
  });

  it("reports an audio call on a file with no audio track", async () => {
    videoUri ??= dataUri(await twoShotVideo(), "video/mp4");
    expect(await call("analyze_audio", { audio: videoUri })).toMatchObject({
      error: "That file has no audio track."
    });
  });

  it("reports a video call on a file with no video track", async () => {
    audioUri ??= dataUri(toneWithGap(), "audio/wav");
    const result = await call("analyze_video", { video: audioUri });
    expect(String(result.error)).toContain("no video track");
    expect(String(result.error)).toContain("analyze_audio");
  });
});

describe("analyze_audio", () => {
  it("measures the tone's format, loudness and envelope", async () => {
    audioUri ??= dataUri(toneWithGap(), "audio/wav");
    const result = await call("analyze_audio", { audio: audioUri });

    expect(result).toMatchObject({
      sample_rate: SAMPLE_RATE,
      channels: 1,
      truncated: false
    });
    expect(Number(result.duration)).toBeCloseTo(5, 1);

    const loudness = result.loudness as Record<string, number>;
    // A -20 dBFS sine on one channel is -23 LUFS by the BS.1770 scale, and
    // the second of silence pulls the gated answer only slightly below that.
    expect(loudness.integrated_lufs).toBeLessThan(-22);
    expect(loudness.integrated_lufs).toBeGreaterThan(-25);
    expect(loudness.peak_dbfs).toBeCloseTo(-20, 0);
    expect(loudness.crest_factor_db).toBeGreaterThan(0);
    expect(loudness.clipped_samples).toBe(0);

    const envelope = result.envelope as {
      points: number;
      series: { time: number; rms_db: number }[];
    };
    expect(envelope.points).toBeGreaterThan(10);
    // The gap is the quietest thing in the file, and it is where it was put.
    const quietest = result.quietest_moment as { time: number; rms_db: number };
    expect(quietest.time).toBeGreaterThanOrEqual(2);
    expect(quietest.time).toBeLessThan(3);
    expect(quietest.rms_db).toBeLessThan(-100);
    const loudest = result.loudest_moment as { rms_db: number };
    expect(loudest.rms_db).toBeGreaterThan(-25);
  });

  it("decimates the envelope to the requested budget", async () => {
    audioUri ??= dataUri(toneWithGap(), "audio/wav");
    const result = await call("analyze_audio", {
      audio: audioUri,
      frame_ms: 10,
      max_points: 20
    });
    const envelope = result.envelope as { points: number; decimated: boolean };
    expect(envelope.points).toBe(20);
    expect(envelope.decimated).toBe(true);
  });

  it("stops decoding at max_seconds and says so", async () => {
    audioUri ??= dataUri(toneWithGap(), "audio/wav");
    const result = await call("analyze_audio", {
      audio: audioUri,
      max_seconds: 1
    });
    expect(result.truncated).toBe(true);
    expect(Number(result.analyzed_duration)).toBeLessThanOrEqual(1.1);
    expect(Number(result.duration)).toBeCloseTo(5, 1);
  });
});

describe("analyze_audio_spectrum", () => {
  it("puts a 1 kHz tone's energy in the upper_mid band", async () => {
    audioUri ??= dataUri(toneWithGap(), "audio/wav");
    const result = await call("analyze_audio_spectrum", { audio: audioUri });

    expect(result.fft_size).toBe(2048);
    expect(Number(result.dominant_frequency_hz)).toBeCloseTo(1000, -2);

    const bands = result.bands as {
      name: string;
      energy_share: number;
    }[];
    expect(bands).toHaveLength(10);
    const shares = Object.fromEntries(
      bands.map((band) => [band.name, band.energy_share])
    );
    // 1 kHz is the boundary between upper_mid (500-1000) and presence_low
    // (1000-2000); the tone's skirt lands in both, and nowhere else.
    expect(shares.upper_mid + shares.presence_low).toBeGreaterThan(0.5);
    expect(shares.sub_bass).toBeLessThan(0.05);
    expect(
      bands.reduce((sum, band) => sum + band.energy_share, 0)
    ).toBeCloseTo(1, 2);

    const spectral = result.spectral as Record<string, number>;
    expect(spectral.centroid_hz).toBeGreaterThan(700);
    expect(spectral.centroid_hz).toBeLessThan(1600);
    // A sine is tonal, so flatness sits far below the noise end of the scale.
    expect(spectral.flatness).toBeLessThan(0.2);
  });

  it("returns the average spectrum alone when max_points is 0", async () => {
    audioUri ??= dataUri(toneWithGap(), "audio/wav");
    const result = await call("analyze_audio_spectrum", {
      audio: audioUri,
      max_points: 0
    });
    expect(result.series).toEqual([]);
    expect((result.bands as unknown[]).length).toBe(10);
  });

  it("refuses an fft window longer than the audio", async () => {
    const short = dataUri(wav(new Float32Array(128), 1), "audio/wav");
    const result = await call("analyze_audio_spectrum", {
      audio: short,
      fft_size: 16384
    });
    expect(String(result.error)).toContain("shorter than the");
  });
});

describe("detect_audio_events", () => {
  it("finds the silent second and the sounding segments around it", async () => {
    audioUri ??= dataUri(toneWithGap(), "audio/wav");
    const result = await call("detect_audio_events", { audio: audioUri });

    const silence = result.silence as {
      count: number;
      total_duration: number;
      segments: { start: number; end: number; duration: number }[];
    };
    expect(silence.count).toBe(1);
    expect(silence.segments[0].start).toBeCloseTo(2, 1);
    expect(silence.segments[0].end).toBeCloseTo(3, 1);
    expect(silence.total_duration).toBeCloseTo(1, 1);

    const sounding = result.sounding as {
      count: number;
      segments: { start: number; end: number }[];
    };
    expect(sounding.count).toBe(2);
    expect(sounding.segments[0].start).toBeCloseTo(0, 1);
    expect(sounding.segments[1].end).toBeCloseTo(5, 0);
  });

  it("finds an onset where the tone comes back", async () => {
    audioUri ??= dataUri(toneWithGap(), "audio/wav");
    const result = await call("detect_audio_events", { audio: audioUri });
    const onsets = result.onsets as { count: number; times: number[] };
    expect(onsets.count).toBeGreaterThan(0);
    expect(onsets.times.some((time) => Math.abs(time - 3) < 0.2)).toBe(true);
  });

  it("finds no silence when the threshold is below the noise floor", async () => {
    audioUri ??= dataUri(toneWithGap(), "audio/wav");
    const result = await call("detect_audio_events", {
      audio: audioUri,
      silence_db: -100
    });
    expect((result.silence as { count: number }).count).toBe(1);
    const none = await call("detect_audio_events", {
      audio: audioUri,
      min_silence_seconds: 30
    });
    expect((none.silence as { count: number }).count).toBe(0);
  });

  it("omits tempo when the caller turns it off", async () => {
    audioUri ??= dataUri(toneWithGap(), "audio/wav");
    const result = await call("detect_audio_events", {
      audio: audioUri,
      detect_tempo: false
    });
    expect(result.tempo).toBeNull();
  });

  it("reports a steady tone's tempo as unreliable", async () => {
    audioUri ??= dataUri(toneWithGap(), "audio/wav");
    const result = await call("detect_audio_events", { audio: audioUri });
    expect((result.tempo as { reliable: boolean }).reliable).toBe(false);
  });
});

describe("analyze_video", () => {
  it("reads the container and the picture over time", async () => {
    videoUri ??= dataUri(await twoShotVideo(), "video/mp4");
    const result = await call("analyze_video", { video: videoUri });

    expect(result.video).toMatchObject({ width: 128, height: 72 });
    expect(Number(result.duration)).toBeCloseTo(4, 1);
    expect(result.has_audio).toBe(false);
    expect(
      (result.sampling as { frames_analyzed: number }).frames_analyzed
    ).toBeGreaterThan(4);

    // Black then white averages to mid grey, and the extremes are where the
    // two shots are.
    const picture = result.picture as Record<string, number>;
    expect(picture.brightness).toBeGreaterThan(0.3);
    expect(picture.brightness).toBeLessThan(0.7);
    expect((result.darkest_moment as { time: number }).time).toBeLessThan(2);
    expect(
      (result.brightest_moment as { time: number }).time
    ).toBeGreaterThanOrEqual(2);
    expect(
      (result.brightest_moment as { brightness: number }).brightness
    ).toBeGreaterThan(0.9);

    const palette = result.palette as { hex: string; share: number }[];
    expect(palette.length).toBeGreaterThan(0);
    expect(palette.map((entry) => entry.hex).join(" ")).toMatch(
      /#(0[0-9a-f]|f[0-9a-f])/
    );
  });

  it("decodes more frames at a higher sample_fps", async () => {
    videoUri ??= dataUri(await twoShotVideo(), "video/mp4");
    const sparse = await call("analyze_video", {
      video: videoUri,
      sample_fps: 1
    });
    const dense = await call("analyze_video", {
      video: videoUri,
      sample_fps: 8
    });
    const frames = (result: Record<string, unknown>): number =>
      (result.sampling as { frames_analyzed: number }).frames_analyzed;
    expect(frames(dense)).toBeGreaterThan(frames(sparse));
  });
});

describe("detect_video_scenes", () => {
  it("finds the one cut and describes both shots", async () => {
    videoUri ??= dataUri(await twoShotVideo(), "video/mp4");
    const result = await call("detect_video_scenes", { video: videoUri });

    const cuts = result.cuts as { count: number; times: number[] };
    expect(cuts.count).toBe(1);
    expect(cuts.times[0]).toBeCloseTo(2, 0);

    const shots = result.shots as {
      count: number;
      list: {
        index: number;
        start: number;
        end: number;
        brightness: number;
        representative_time: number;
        palette: { hex: string }[];
      }[];
    };
    expect(shots.count).toBe(2);
    expect(shots.list[0].brightness).toBeLessThan(0.1);
    expect(shots.list[1].brightness).toBeGreaterThan(0.9);
    expect(shots.list[0].representative_time).toBeGreaterThan(
      shots.list[0].start
    );
    expect(shots.list[0].representative_time).toBeLessThan(shots.list[0].end);
    expect(shots.list[0].palette[0].hex).toBe("#000000");
    expect(shots.list[1].palette[0].hex).toBe("#ffffff");
  });

  it("reports the black opening as a black-frame run", async () => {
    videoUri ??= dataUri(await twoShotVideo(), "video/mp4");
    const result = await call("detect_video_scenes", { video: videoUri });
    const black = result.black_frames as {
      count: number;
      runs: { start: number; duration: number }[];
    };
    expect(black.count).toBe(1);
    expect(black.runs[0].start).toBeCloseTo(0, 1);
    expect(black.runs[0].duration).toBeGreaterThan(1.5);
  });

  it("reports both static shots as frozen", async () => {
    videoUri ??= dataUri(await twoShotVideo(), "video/mp4");
    const result = await call("detect_video_scenes", { video: videoUri });
    const frozen = result.frozen_frames as { count: number };
    expect(frozen.count).toBeGreaterThanOrEqual(1);
  });

  it("finds no cut in a video that never changes", async () => {
    const uri = dataUri(await solidVideo(0), "video/mp4");
    const result = await call("detect_video_scenes", { video: uri });
    expect((result.cuts as { count: number }).count).toBe(0);
    expect((result.shots as { count: number }).count).toBe(1);
  });

  it("still finds a black-to-white cut at the maximum threshold", async () => {
    // Black to white is a total-variation distance of exactly 1, the largest
    // a histogram pair can be. Nothing above it exists to threshold away.
    videoUri ??= dataUri(await twoShotVideo(), "video/mp4");
    const result = await call("detect_video_scenes", {
      video: videoUri,
      threshold: 1
    });
    expect((result.cuts as { count: number }).count).toBe(1);
  });
});
