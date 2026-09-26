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
        currentAssetId: "tone", startMs: 500, durationMs: 1000,
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
