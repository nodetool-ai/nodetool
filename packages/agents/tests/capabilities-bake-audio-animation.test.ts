/**
 * `bake_audio_animation` — audio measured, curve written onto another clip.
 *
 * The arithmetic is the part that can be silently wrong, so the fixture pins
 * it with three different offsets rather than one: the audio clip starts at
 * 2000 ms with a 500 ms in-point, the target starts at 1000 ms with none, and
 * a burst one second into the audio file therefore has to land at 1500 ms of
 * the target's own media. A hop that used timeline time as source time, or
 * dropped the in-point, moves that number.
 *
 * The audio is a real WAV decoded by the real decoder — the capability's whole
 * input path — served through the context's `resolveAssetBytes` the way a
 * stored asset is.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ModelObserver, initTestDb } from "@nodetool-ai/models";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { ClipAnimation } from "@nodetool-ai/timeline";

import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { analyzeAudioFrames } from "../src/capabilities/analysis.js";
import {
  audioSourceMsToTimelineMs,
  beatCurve,
  mapAudioCurveToTarget,
  timelineMsToTargetSourceMs
} from "../src/capabilities/timeline-audio-bake.js";

const USER = "u-audio-bake";
const ASSET_ID = "asset_music";
const SAMPLE_RATE = 8000;

/** Where the burst sits in the audio FILE, in ms. */
const BURST_SOURCE_MS = 1000;

const AUDIO_CLIP = {
  id: "clip_audio",
  trackId: "track_audio",
  startMs: 2000,
  durationMs: 3000,
  inPointMs: 500
};
const TARGET_CLIP = {
  id: "clip_target",
  trackId: "track_video",
  startMs: 1000,
  durationMs: 5000
};

/**
 * The one number the whole feature turns on.
 *
 * The burst is at 1000 ms of the audio file. The audio clip shows the file
 * from its in-point (500 ms) onwards starting at 2000 ms on the timeline, at
 * 1x, so the burst is heard at 2000 + (1000 - 500) = 2500 ms. The target clip
 * starts at 1000 ms with no in-point, also at 1x, so 2500 ms on the timeline
 * is (2500 - 1000) * 1 + 0 = 1500 ms of the target's own media.
 */
const EXPECTED_TARGET_SOURCE_MS = 1500;

/** A 16-bit PCM WAV, the shape `analyzeAudioFrames` decodes for real. */
function wav(samples: Float32Array, sampleRate: number): Uint8Array {
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
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(44 + index * 2, Math.round(value * 0x7fff), true);
  }
  return bytes;
}

/** Silence with a 100 ms tone burst at each of `atMs`. */
function withBursts(totalMs: number, atMs: readonly number[]): Uint8Array {
  const samples = new Float32Array(Math.round((totalMs / 1000) * SAMPLE_RATE));
  const burstSamples = Math.round(0.1 * SAMPLE_RATE);
  for (const startMs of atMs) {
    const start = Math.round((startMs / 1000) * SAMPLE_RATE);
    for (let i = 0; i < burstSamples && start + i < samples.length; i += 1) {
      samples[start + i] = 0.9 * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE);
    }
  }
  return wav(samples, SAMPLE_RATE);
}

interface Harness {
  context: ProcessingContext;
  audioBytes: Uint8Array;
}

function harness(audioBytes: Uint8Array): Harness {
  const context = {
    userId: USER,
    getSetting: async () => null,
    resolveAssetBytes: async (uri: string) =>
      uri.includes(ASSET_ID) ? { bytes: audioBytes } : { bytes: undefined }
  } as unknown as ProcessingContext;
  return { context, audioBytes };
}

/** A stored sequence with one audio clip and one picture clip. */
async function seedTimeline(
  overrides: {
    target?: Record<string, unknown>;
    audio?: Record<string, unknown>;
  } = {}
): Promise<string> {
  const { TimelineSequence } = await import("@nodetool-ai/models");
  const document = {
    tracks: [
      { id: "track_video", name: "Video 1", type: "video", index: 0 },
      { id: "track_audio", name: "Audio 1", type: "audio", index: 1 }
    ],
    clips: [
      {
        ...TARGET_CLIP,
        name: "Shot",
        mediaType: "video",
        sourceType: "imported",
        status: "generated",
        currentAssetId: "asset_shot",
        ...overrides.target
      },
      {
        ...AUDIO_CLIP,
        name: "Music",
        mediaType: "audio",
        sourceType: "imported",
        status: "generated",
        currentAssetId: ASSET_ID,
        ...overrides.audio
      }
    ],
    markers: []
  };
  const sequence = new TimelineSequence({
    user_id: USER,
    project_id: "default",
    name: "Cut",
    fps: 30,
    width: 1920,
    height: 1080,
    duration_ms: 6000,
    document: JSON.stringify(document)
  });
  await sequence.save();
  return sequence.id;
}

async function animationsOf(timelineId: string): Promise<ClipAnimation[]> {
  const { TimelineSequence } = await import("@nodetool-ai/models");
  const sequence = await TimelineSequence.findById(timelineId);
  const clip = sequence!
    .toDocument()
    .clips.find((c) => c.id === TARGET_CLIP.id);
  return clip?.animations ?? [];
}

describe("the two time hops", () => {
  it("places a burst one second into the file at 1500ms of the target", () => {
    const timelineMs = audioSourceMsToTimelineMs(AUDIO_CLIP, BURST_SOURCE_MS);
    expect(timelineMs).toBe(2500);
    expect(timelineMsToTargetSourceMs(TARGET_CLIP, timelineMs)).toBe(
      EXPECTED_TARGET_SOURCE_MS
    );
  });

  it("carries a speed multiplier through both hops", () => {
    // The audio plays at 2x, so 500 ms of file is 250 ms of timeline.
    const fast = { ...AUDIO_CLIP, speedMultiplier: 2 };
    expect(audioSourceMsToTimelineMs(fast, BURST_SOURCE_MS)).toBe(2250);
    // The target plays at 0.5x, so 1250 ms of timeline is 625 ms of media.
    const slow = { ...TARGET_CLIP, speedMultiplier: 0.5 };
    expect(timelineMsToTargetSourceMs(slow, 2250)).toBe(625);
  });
});

/**
 * The curve reaching the mapper is already simplified, so "no keyframe inside
 * the target" is not "no motion over the target". These cases pin the
 * geometric clip that replaced the membership test.
 */
describe("clipping a simplified curve to the target's window", () => {
  /** 1:1 on the timeline — audio-source ms and timeline ms are one number. */
  const AUDIO = { startMs: 0, durationMs: 4000 };
  /** A linear envelope over 0–4000ms, simplified to its two ends. */
  const RAMP = [
    { timeMs: 0, value: 1 },
    { timeMs: 4000, value: 2 }
  ];

  it("interpolates both boundaries when the target sits between two keyframes", () => {
    // The reviewer's reproduction: this returned [] before, and the capability
    // reported "does not overlap" over a ramp that covers the whole target.
    expect(
      mapAudioCurveToTarget(RAMP, {
        audioClip: AUDIO,
        targetClip: { startMs: 1000, durationMs: 2000 },
        offsetMs: 0
      })
    ).toEqual([
      { sourceMs: 0, value: 1.25 },
      { sourceMs: 2000, value: 1.75 }
    ]);
  });

  it("clips to one segment of a curve that has interior vertices elsewhere", () => {
    const curve = [
      { timeMs: 0, value: 1 },
      { timeMs: 1000, value: 2 },
      { timeMs: 3000, value: 3 },
      { timeMs: 4000, value: 1 }
    ];
    // 1500–2500ms falls inside the 1000→3000ms segment, so both ends are
    // interpolated and no vertex of the curve is retained.
    expect(
      mapAudioCurveToTarget(curve, {
        audioClip: AUDIO,
        targetClip: { startMs: 1500, durationMs: 1000 },
        offsetMs: 0
      })
    ).toEqual([
      { sourceMs: 0, value: 2.25 },
      { sourceMs: 1000, value: 2.75 }
    ]);
  });

  it("interpolates the crossed boundary and keeps the rest on a partial overlap", () => {
    const curve = [
      { timeMs: 0, value: 1 },
      { timeMs: 2000, value: 3 },
      { timeMs: 4000, value: 1 }
    ];
    // The target starts mid-curve and outlasts it, so only the start boundary
    // is crossed and the peak and tail come through as measured.
    expect(
      mapAudioCurveToTarget(curve, {
        audioClip: AUDIO,
        targetClip: { startMs: 1000, durationMs: 5000 },
        offsetMs: 0
      })
    ).toEqual([
      { sourceMs: 0, value: 2 },
      { sourceMs: 1000, value: 3 },
      { sourceMs: 3000, value: 1 }
    ]);
  });

  it("still returns nothing when the curve never reaches the target", () => {
    expect(
      mapAudioCurveToTarget(RAMP, {
        audioClip: AUDIO,
        targetClip: { startMs: 10000, durationMs: 2000 },
        offsetMs: 0
      })
    ).toEqual([]);
  });
});

describe("beatCurve", () => {
  const ONSETS = [1000, 2000, 3000];
  const OPTIONS = {
    releaseMs: 150,
    outputRange: [1, 1.2] as [number, number],
    windowMs: [0, 4000] as [number, number],
    tolerance: 0.01,
    maxPoints: 4096
  };

  const peakTimes = (points: readonly { timeMs: number; value: number }[]) =>
    points.filter((point) => point.value === 1.2).map((point) => point.timeMs);

  it("keeps every peak with a zero attack, as a step into the onset", () => {
    // Zero attack is what the route and the inspector accept as "no rise";
    // it used to drop every onset and leave a flat curve.
    const points = beatCurve(ONSETS, { ...OPTIONS, attackMs: 0 });
    expect(peakTimes(points)).toEqual(ONSETS);

    for (const onsetMs of ONSETS) {
      const peak = points.findIndex((point) => point.timeMs === onsetMs);
      const rest = points[peak - 1]!;
      expect(rest.value).toBe(1);
      // Inside a millisecond of the onset: the step is a jump, not a ramp.
      expect(rest.timeMs).toBeGreaterThan(onsetMs - 1);
      expect(rest.timeMs).toBeLessThan(onsetMs);
    }
    expect(
      points.every(
        (point, index) => index === 0 || point.timeMs > points[index - 1]!.timeMs
      )
    ).toBe(true);
    expect(points[0]).toEqual({ timeMs: 0, value: 1 });
    expect(points[points.length - 1]).toEqual({ timeMs: 4000, value: 1 });
  });

  it("leaves a non-zero attack untouched: the rise starts attack_ms early", () => {
    const points = beatCurve(ONSETS, { ...OPTIONS, attackMs: 30 });
    expect(peakTimes(points)).toEqual(ONSETS);
    for (const onsetMs of ONSETS) {
      const peak = points.findIndex((point) => point.timeMs === onsetMs);
      expect(points[peak - 1]).toEqual({ timeMs: onsetMs - 30, value: 1 });
      expect(points[peak + 1]).toEqual({ timeMs: onsetMs + 150, value: 1 });
    }
  });
});

describe("bake_audio_animation", () => {
  let bench: Harness | null = null;

  beforeEach(() => {
    initTestDb();
  });

  afterEach(() => {
    ModelObserver.clear();
    bench = null;
  });

  const run = () =>
    createCapabilityRun({ context: bench!.context, gate: UNGATED });

  const bake = (timelineId: string, extra: Record<string, unknown> = {}) =>
    run().invoke("bake_audio_animation", {
      timeline_id: timelineId,
      audio_clip_id: AUDIO_CLIP.id,
      target_clip_id: TARGET_CLIP.id,
      property: "scale",
      output_range: [1, 1.5],
      ...extra
    }) as Promise<Record<string, unknown>>;

  it("puts the envelope's peak where the burst lands in the target's media", async () => {
    bench = harness(withBursts(4000, [BURST_SOURCE_MS]));
    const timelineId = await seedTimeline();

    const result = await bake(timelineId);
    expect(result["error"]).toBeUndefined();
    expect(result["replaced"]).toBe(false);
    expect(result["analyzed"]).toEqual({ fromMs: 500, toMs: 3500 });
    expect(result["truncated"]).toBe(false);
    expect(result["keyframeCount"]).toBeGreaterThan(1);

    const animations = await animationsOf(timelineId);
    expect(animations).toHaveLength(1);
    const animation = animations[0]!;
    expect(animation.preset).toBe("custom");
    expect(animation.custom?.timeBase).toBe("source");
    expect(animation.custom?.bakedFrom).toMatchObject({
      kind: "audio",
      clipId: AUDIO_CLIP.id,
      assetId: ASSET_ID
    });
    expect(animation.custom?.bakedFrom?.settings).toMatchObject({
      mode: "envelope"
    });

    const keyframes = animation.custom!.curves[0]!.keyframes;
    expect(animation.custom!.curves[0]!.property).toBe("scale");
    const loudest = keyframes.reduce((best, kf) =>
      kf.value > best.value ? kf : best
    );
    // Within a couple of analysis hops plus the follower's own rise.
    expect(loudest.sourceMs).toBeGreaterThan(EXPECTED_TARGET_SOURCE_MS - 60);
    expect(loudest.sourceMs).toBeLessThan(EXPECTED_TARGET_SOURCE_MS + 200);
    // The attack follower rounds the instantaneous peak off slightly, so the
    // top of the range is approached rather than hit exactly.
    expect(loudest.value).toBeGreaterThan(1.45);
    expect(loudest.value).toBeLessThanOrEqual(1.5);
    // The quiet parts sit at the low end, so the clip is unchanged there.
    expect(keyframes[0]!.value).toBeCloseTo(1, 2);
  });

  it("shifts the whole curve by offset_ms", async () => {
    bench = harness(withBursts(4000, [BURST_SOURCE_MS]));
    const timelineId = await seedTimeline();
    await bake(timelineId, { offset_ms: -400 });

    const keyframes = (await animationsOf(timelineId))[0]!.custom!.curves[0]!
      .keyframes;
    const loudest = keyframes.reduce((best, kf) =>
      kf.value > best.value ? kf : best
    );
    expect(loudest.sourceMs).toBeGreaterThan(
      EXPECTED_TARGET_SOURCE_MS - 400 - 60
    );
    expect(loudest.sourceMs).toBeLessThan(
      EXPECTED_TARGET_SOURCE_MS - 400 + 200
    );
  });

  it("writes one pulse per detected onset in beats mode", async () => {
    const bytes = withBursts(4000, [1000, 1800, 2600]);
    bench = harness(bytes);
    const timelineId = await seedTimeline();

    // The detector decides how many onsets there are; the bake's job is to
    // put exactly one pulse on each of them, so the expectation is read from
    // the same analysis rather than from the burst count.
    const analysis = await analyzeAudioFrames(bytes, {
      fromMs: 500,
      toMs: 3500,
      frameMs: 20,
      detectTempo: false
    });
    expect(analysis.onsetsMs.length).toBeGreaterThan(0);

    const result = await bake(timelineId, { mode: "beats" });
    expect(result["error"]).toBeUndefined();

    const keyframes = (await animationsOf(timelineId))[0]!.custom!.curves[0]!
      .keyframes;
    const peaks = keyframes.filter((kf) => Math.abs(kf.value - 1.5) < 1e-6);
    expect(peaks).toHaveLength(analysis.onsetsMs.length);
    // Every peak sits between two rest points, so the property returns to 1.
    expect(keyframes[0]!.value).toBeCloseTo(1, 6);
    expect(keyframes[keyframes.length - 1]!.value).toBeCloseTo(1, 6);
  });

  it("replaces its own curve on a second bake, keeping the animation id", async () => {
    bench = harness(withBursts(4000, [BURST_SOURCE_MS]));
    const timelineId = await seedTimeline();

    await bake(timelineId);
    const firstId = (await animationsOf(timelineId))[0]!.id;

    const again = await bake(timelineId, { output_range: [1, 2] });
    expect(again["error"]).toBeUndefined();
    expect(again["replaced"]).toBe(true);

    const animations = await animationsOf(timelineId);
    expect(animations).toHaveLength(1);
    expect(animations[0]!.id).toBe(firstId);
    expect(
      animations[0]!.custom!.curves[0]!.keyframes.some((kf) => kf.value > 1.9)
    ).toBe(true);
  });

  it("appends a second curve when replace is false", async () => {
    bench = harness(withBursts(4000, [BURST_SOURCE_MS]));
    const timelineId = await seedTimeline();
    await bake(timelineId);
    const again = await bake(timelineId, { replace: false });
    expect(again["replaced"]).toBe(false);
    expect(await animationsOf(timelineId)).toHaveLength(2);
  });

  it("leaves a hand-keyframed animation alone", async () => {
    bench = harness(withBursts(4000, [BURST_SOURCE_MS]));
    const timelineId = await seedTimeline({
      target: {
        animations: [
          {
            id: "anim_hand",
            role: "emphasis",
            preset: "custom",
            durationMs: 5000,
            custom: {
              timeBase: "source",
              curves: [
                {
                  property: "scale",
                  keyframes: [
                    { t: 0, value: 1, sourceMs: 0 },
                    { t: 1, value: 3, sourceMs: 5000 }
                  ]
                }
              ]
            }
          }
        ]
      }
    });

    await bake(timelineId);
    const animations = await animationsOf(timelineId);
    expect(animations).toHaveLength(2);
    expect(animations[0]!.id).toBe("anim_hand");
    expect(animations[0]!.custom?.bakedFrom).toBeUndefined();
  });

  it("refuses a time-remapped target and names the op that clears it", async () => {
    bench = harness(withBursts(4000, [BURST_SOURCE_MS]));
    const timelineId = await seedTimeline({
      target: {
        timeRemap: {
          keyframes: [
            { t: 0, sourceMs: 0 },
            { t: 1, sourceMs: 2000 }
          ]
        }
      }
    });

    const result = await bake(timelineId);
    expect(String(result["error"])).toContain("time remap");
    expect(String(result["error"])).toContain("set_time_remap");
    expect(await animationsOf(timelineId)).toHaveLength(0);
  });

  it("refuses when the analyzed audio never overlaps the target", async () => {
    bench = harness(withBursts(4000, [BURST_SOURCE_MS]));
    // The target ends at 6000 ms; a +10s offset puts every keyframe past it.
    const timelineId = await seedTimeline();
    const result = await bake(timelineId, { offset_ms: 10000 });
    expect(String(result["error"])).toContain("does not overlap");
    expect(await animationsOf(timelineId)).toHaveLength(0);
  });

  it("reports truncation rather than silently clipping the window", async () => {
    bench = harness(withBursts(4000, [BURST_SOURCE_MS]));
    const timelineId = await seedTimeline();
    // The clip wants 500..3500 ms of the file; one second is all it may decode.
    const result = await bake(timelineId, { max_seconds: 1 });
    expect(result["error"]).toBeUndefined();
    expect(result["truncated"]).toBe(true);
    const analyzed = result["analyzed"] as { toMs: number };
    expect(analyzed.toMs).toBeLessThan(3500);
  });
});
