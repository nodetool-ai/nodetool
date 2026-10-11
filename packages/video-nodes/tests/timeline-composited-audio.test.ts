import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mixCompositedTimelineAudio } from "../src/nodes/timeline.js";
import { resolveTimelineOutput } from "../src/nodes/timeline/outputFormats.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("composited timeline audio", () => {
  it("mixes an audio asset at its offset with gain and fades", async () => {
    const workDir = await mkdtemp(path.join(os.tmpdir(), "timeline-audio-"));
    dirs.push(workDir);
    const basePath = path.join(workDir, "base.mp4");
    const audioPath = path.join(workDir, "tone.wav");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=32x32:r=10", "-t", "2", "-an", "-c:v", "libx264", basePath]);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1", audioPath]);
    const sequence = {
      id: "seq", projectId: "test", name: "Audio", width: 32, height: 32,
      fps: 10, durationMs: 2000, createdAt: "", updatedAt: "", transcript: [],
      tracks: [{ id: "audio", type: "audio", index: 0, visible: true }],
      clips: [{
        id: "tone", trackId: "audio", name: "Tone", mediaType: "audio",
        currentAssetId: "tone", status: "generated", startMs: 500, durationMs: 1000,
        volumeDb: -6, fadeInMs: 200, fadeOutMs: 200
      }]
    };
    const mixed = await mixCompositedTimelineAudio({
      sequence: sequence as never,
      basePath, workDir, output: resolveTimelineOutput({ format: "mp4" }),
      resolveAssetPath: async (id) => id === "tone" ? audioPath : null
    });
    const streams = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", mixed], { encoding: "utf8" })) as { streams: Array<{ codec_type: string }> };
    expect(streams.streams.map((stream) => stream.codec_type)).toContain("audio");
    const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", mixed, "-map", "0:a:0", "-f", "f32le", "-ac", "1", "-ar", "48000", "pipe:1"]);
    const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
    const rms = (from: number, to: number) => {
      let power = 0;
      for (let i = from * 48000; i < to * 48000; i++) power += samples[i] * samples[i];
      return Math.sqrt(power / ((to - from) * 48000));
    };
    expect(rms(0, 0.3)).toBeLessThan(0.001);
    expect(rms(0.51, 0.56)).toBeLessThan(rms(0.85, 1.05));
    expect(rms(0.85, 1.05)).toBeGreaterThan(0.03);
    expect(rms(1.44, 1.49)).toBeLessThan(rms(0.85, 1.05));
  });
});

/** Mix one 1 s tone on an audio track carrying `effects`; return its RMS. */
async function toneRms(opts: {
  frequency?: number;
  effects?: unknown[];
  status?: string;
}): Promise<number | null> {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "timeline-fx-"));
  dirs.push(workDir);
  const basePath = path.join(workDir, "base.mp4");
  const audioPath = path.join(workDir, "tone.wav");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=32x32:r=10", "-t", "1", "-an", "-c:v", "libx264", basePath]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=${opts.frequency ?? 440}:sample_rate=48000:duration=1`, audioPath]);
  const sequence = {
    id: "seq", projectId: "test", name: "Audio", width: 32, height: 32,
    fps: 10, durationMs: 1000, createdAt: "", updatedAt: "", transcript: [],
    tracks: [{ id: "audio", type: "audio", index: 0, visible: true, effects: opts.effects }],
    clips: [{
      id: "tone", trackId: "audio", name: "Tone", mediaType: "audio",
      currentAssetId: "tone", status: opts.status ?? "generated",
      startMs: 0, durationMs: 1000
    }]
  };
  const mixed = await mixCompositedTimelineAudio({
    sequence: sequence as never,
    basePath, workDir, output: resolveTimelineOutput({ format: "mp4" }),
    resolveAssetPath: async (id) => id === "tone" ? audioPath : null
  });
  if (mixed === basePath) return null;
  const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", mixed, "-map", "0:a:0", "-f", "f32le", "-ac", "1", "-ar", "48000", "pipe:1"]);
  const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
  // Skip the edges: encoder priming and filter settling.
  let power = 0;
  const from = 0.2 * 48000;
  const to = 0.8 * 48000;
  for (let i = from; i < to; i++) power += samples[i] * samples[i];
  return Math.sqrt(power / (to - from));
}

describe("composited timeline audio track effects", () => {
  it("applies an enabled gain effect and ignores a disabled one", async () => {
    const dry = await toneRms({});
    const quieter = await toneRms({ effects: [{ id: "g", type: "gain", enabled: true, gainDb: -12 }] });
    const bypassed = await toneRms({ effects: [{ id: "g", type: "gain", enabled: false, gainDb: -12 }] });
    expect(dry).not.toBeNull();
    // -12 dB is a factor of about 0.25 in amplitude.
    expect(quieter! / dry!).toBeGreaterThan(0.2);
    expect(quieter! / dry!).toBeLessThan(0.3);
    expect(bypassed! / dry!).toBeGreaterThan(0.95);
  }, 30_000);

  it("applies a lowpass filter and an eq3 cut", async () => {
    const dry = await toneRms({ frequency: 4000 });
    const filtered = await toneRms({
      frequency: 4000,
      effects: [{ id: "f", type: "filter", enabled: true, mode: "lowpass", frequency: 200, q: 1 }]
    });
    const eq = await toneRms({
      frequency: 8000,
      effects: [{ id: "e", type: "eq3", enabled: true, lowFreq: 200, lowGainDb: 0, midFreq: 1000, midQ: 1, midGainDb: 0, highFreq: 5000, highGainDb: -12 }]
    });
    const eqDry = await toneRms({ frequency: 8000 });
    expect(filtered! / dry!).toBeLessThan(0.05);
    expect(eq! / eqDry!).toBeLessThan(0.4);
  }, 30_000);

  it("compresses with the makeup gain the preview's compressor adds", async () => {
    const dry = await toneRms({});
    const compressed = await toneRms({
      effects: [{ id: "c", type: "compressor", enabled: true, thresholdDb: -30, ratio: 4, attackMs: 3, releaseMs: 250, kneeDb: 0 }]
    });
    // The tone peaks at -18 dBFS: 12 dB over the threshold comes out 3 dB
    // over it (-27), and Web Audio's makeup gain for this curve is 13.5 dB,
    // so the result is about 4.5 dB louder than the dry tone, not 9 dB quieter.
    expect(compressed! / dry!).toBeGreaterThan(1.3);
    expect(compressed! / dry!).toBeLessThan(2.6);
  }, 30_000);
});

describe("composited timeline audio clip status", () => {
  it("leaves out a clip whose regeneration failed, as the preview does", async () => {
    expect(await toneRms({ status: "failed" })).toBeNull();
    expect(await toneRms({ status: "generated" })).not.toBeNull();
  }, 30_000);
});
