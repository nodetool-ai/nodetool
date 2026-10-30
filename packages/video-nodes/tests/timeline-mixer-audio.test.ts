import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generateMedia, readPcm } from "@nodetool-ai/runtime/media/testing";
import { afterEach, describe, expect, it } from "vitest";
import { mixCompositedTimelineAudio, panSteps } from "../src/nodes/timeline.js";
import { resolveTimelineOutput } from "../src/nodes/timeline/outputFormats.js";

/**
 * The server render follows the mixer: a track's fader and pan, and the
 * master channel's inserts and fader, as the preview's AudioGraph applies
 * them.
 */
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** Mix one 1 s tone on one audio track; return each output channel's RMS. */
async function channelRms(opts: {
  track?: Record<string, unknown>;
  master?: unknown;
}): Promise<[number, number]> {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "timeline-mixer-"));
  dirs.push(workDir);
  const basePath = path.join(workDir, "base.mp4");
  const audioPath = path.join(workDir, "tone.wav");
  await generateMedia({ outPath: basePath, video: { source: "color=c=black:s=32x32:r=10:duration=1" } });
  await generateMedia({
    outPath: audioPath,
    audio: { source: "sine=frequency=440:sample_rate=48000:duration=1", codec: "pcm_s16le" }
  });
  const sequence = {
    id: "seq", projectId: "test", name: "Mixer", width: 32, height: 32,
    fps: 10, durationMs: 1000, createdAt: "", updatedAt: "", transcript: [],
    tracks: [{ id: "audio", type: "audio", index: 0, visible: true, ...opts.track }],
    clips: [{
      id: "tone", trackId: "audio", name: "Tone", mediaType: "audio",
      currentAssetId: "tone", status: "generated", startMs: 0, durationMs: 1000
    }],
    master: opts.master
  };
  const mixed = await mixCompositedTimelineAudio({
    sequence: sequence as never,
    basePath, workDir, output: resolveTimelineOutput({ format: "mp4" }),
    resolveAssetPath: async (id) => id === "tone" ? audioPath : null
  });
  const { samples } = await readPcm(mixed, { sampleRate: 48000, channels: 2 });
  const power = [0, 0];
  const from = Math.round(0.2 * 48000);
  const to = Math.round(0.8 * 48000);
  for (let i = from; i < to; i++) {
    power[0] += samples[2 * i] ** 2;
    power[1] += samples[2 * i + 1] ** 2;
  }
  return [Math.sqrt(power[0] / (to - from)), Math.sqrt(power[1] / (to - from))];
}

describe("server render mixer", () => {
  it("applies the track fader in decibels", async () => {
    const [dryL, dryR] = await channelRms({});
    const [l, r] = await channelRms({ track: { volumeDb: -12 } });
    expect(dryL).toBeGreaterThan(0.05);
    expect(dryR / dryL).toBeCloseTo(1, 2);
    expect(l / dryL).toBeGreaterThan(0.22);
    expect(l / dryL).toBeLessThan(0.28);
    expect(r / dryR).toBeGreaterThan(0.22);
    expect(r / dryR).toBeLessThan(0.28);
  }, 30_000);

  it("pans like Web Audio's StereoPannerNode on a stereo input", async () => {
    const [dryL] = await channelRms({});
    const [hardL, hardR] = await channelRms({ track: { pan: -1 } });
    // Hard left: the right channel folds into the left.
    expect(hardR).toBeLessThan(0.001);
    expect(hardL / dryL).toBeGreaterThan(1.9);
    expect(hardL / dryL).toBeLessThan(2.1);
    const [halfL, halfR] = await channelRms({ track: { pan: 0.5 } });
    // x = 0.5: L keeps cos(pi/4), R gains sin(pi/4) of L.
    expect(halfL / dryL).toBeCloseTo(Math.SQRT1_2, 1);
    expect(halfR / dryL).toBeCloseTo(1 + Math.SQRT1_2, 1);
  }, 30_000);

  it("runs the master inserts and fader over the mix", async () => {
    const [dryL] = await channelRms({});
    const [faded] = await channelRms({ master: { volumeDb: -6 } });
    expect(faded / dryL).toBeGreaterThan(0.47);
    expect(faded / dryL).toBeLessThan(0.53);
    const [trimmed] = await channelRms({
      master: {
        volumeDb: 0,
        effects: [
          { id: "g", type: "gain", enabled: true, gainDb: -12 },
          { id: "off", type: "gain", enabled: false, gainDb: -40 }
        ]
      }
    });
    expect(trimmed / dryL).toBeGreaterThan(0.22);
    expect(trimmed / dryL).toBeLessThan(0.28);
  }, 30_000);

  it("leaves a centred track's filter graph alone", () => {
    expect(panSteps(undefined)).toEqual([]);
    expect(panSteps(0)).toEqual([]);
    expect(panSteps(-1)).toEqual([
      "aformat=channel_layouts=stereo",
      "pan=stereo|c0=c0+1.000000*c1|c1=0.000000*c1"
    ]);
  });
});
