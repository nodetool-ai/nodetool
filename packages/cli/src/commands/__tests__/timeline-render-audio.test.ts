import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const { runTimelineRender } = await import("../timeline-render.js");
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("timeline render audio export", () => {
  it("writes a timed MIDI soundtrack to an MP4", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "timeline-cli-audio-"));
    dirs.push(dir);
    const input = path.join(dir, "timeline.json");
    const output = path.join(dir, "render.mp4");
    await writeFile(input, JSON.stringify({
      name: "Audio boundary", fps: 10, width: 32, height: 32, durationMs: 2000,
      document: {
        tracks: [{ id: "music", type: "midi", index: 0, visible: true }],
        clips: [{
          id: "note", trackId: "music", name: "Note", mediaType: "midi",
          startMs: 500, durationMs: 1000,
          notes: [{ id: "n1", pitch: 69, velocity: 100, startTick: 0, durationTick: 480 }]
        }], markers: []
      }
    }));
    await runTimelineRender(input, { out: output }, async () => null, async ({ outPath, durationMs }) => {
      execFileSync("ffmpeg", [
        "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=32x32:r=10",
        "-t", String(durationMs / 1000), "-an", "-c:v", "libx264", outPath
      ]);
      return { totalFrames: 20, skippedClips: [] };
    });
    const streams = JSON.parse(execFileSync("ffprobe", [
      "-v", "error", "-show_streams", "-of", "json", output
    ], { encoding: "utf8" })) as { streams: Array<{ codec_type: string }> };
    expect(streams.streams.map((stream) => stream.codec_type)).toContain("audio");
    const pcm = execFileSync("ffmpeg", [
      "-v", "error", "-i", output, "-map", "0:a:0", "-f", "f32le", "-ac", "1", "-ar", "48000", "pipe:1"
    ]);
    const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
    const rms = (from: number, to: number) => {
      let power = 0;
      for (let i = from * 48000; i < to * 48000; i++) power += samples[i] * samples[i];
      return Math.sqrt(power / ((to - from) * 48000));
    };
    expect(rms(0, 0.3)).toBeLessThan(0.001);
    expect(rms(0.6, 0.9)).toBeGreaterThan(0.01);
  });
});
