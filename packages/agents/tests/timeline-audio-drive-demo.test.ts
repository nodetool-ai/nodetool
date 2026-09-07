/**
 * T15 — the product demonstration for audio-driven motion: four kick drums
 * in a music bed scale a "DROP" title up on every hit, on top of its own
 * hand-picked entrance animation.
 *
 * This is deliberately not another unit test of `bake_audio_animation` (that
 * is `capabilities-bake-audio-animation.test.ts`, which this file reuses the
 * WAV-synthesis helpers from) or of `resolveAnimatedLayerProps`'s fold rules
 * (`capabilities-timeline-preview.test.ts`). It is the thing a user would
 * actually build: bake a beat-synced pulse onto a clip that already carries a
 * `pop` entrance, and check that both survive — the baked curve drives the
 * clip between kicks, the hand-picked entrance still plays over the first
 * 600ms untouched, and the two compose by multiplying (I3's `scale: "multiply"`
 * fold), never by one replacing the other.
 *
 * The kick times (0.5s/1.5s/2.5s/3.5s) are simple round numbers; where a
 * baked keyframe actually lands is not simple, and was measured rather than
 * assumed (see the comment above `ONSET_LEAD_TOLERANCE_MS`) — the onset
 * detector's fixed 1024-sample FFT window means the reported onset leads the
 * true attack by roughly (window length − burst length). At the 32kHz this
 * fixture uses that is ~28ms, comfortably inside one 30fps frame; at the 8kHz
 * `capabilities-bake-audio-animation.test.ts` uses it would be ~120ms, which
 * is why that suite never asserts onset placement this tightly.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { ModelObserver, initTestDb } from "@nodetool-ai/models";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { registerBundledFonts } from "@nodetool-ai/timeline/fonts/node";
import type {
  ClipAnimation,
  TimelineClip,
  TimelineTrack
} from "@nodetool-ai/timeline";
import {
  computeActiveLayers,
  resolveAnimatedLayerProps
} from "@nodetool-ai/timeline/scene";

import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { renderTimelineFrames } from "../src/timeline-preview/frames.js";

const USER = "u-audio-drive-demo";
const ASSET_ID = "asset_kicks";
// Higher than the 8kHz `capabilities-bake-audio-animation.test.ts` uses: a
// narrower onset-detection window (see the file header) is what keeps the
// baked peaks within about a frame of the programmed kick times below,
// which is the thing this fixture demonstrates.
const SAMPLE_RATE = 32000;
const SEQUENCE_MS = 4000;
const KICKS_MS = [500, 1500, 2500, 3500] as const;
const POP_DURATION_MS = 600;
const OUTPUT_RANGE: [number, number] = [1, 1.3];

/** Measured (see file header), not assumed: how early the onset detector's
 * fixed FFT window reports a burst relative to its programmed start. */
const ONSET_LEAD_TOLERANCE_MS = 40;

// ---------------------------------------------------------------------------
// WAV synthesis, copied from `capabilities-bake-audio-animation.test.ts` (that
// file's helpers are not exported, and it is off limits to edit).
// ---------------------------------------------------------------------------

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

/** Silence with a 100ms 440Hz tone burst at each of `atMs` — four "kicks". */
function withKicks(totalMs: number, atMs: readonly number[]): Uint8Array {
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

// ---------------------------------------------------------------------------
// Fixture: a 1280x720/30fps timeline with an audio clip carrying the kicks
// and a "DROP" text clip with a hand-picked `pop` entrance.
// ---------------------------------------------------------------------------

const TRACK_VIDEO: TimelineTrack = {
  id: "track_video",
  name: "Video 1",
  type: "video",
  index: 0,
  visible: true,
  locked: false
};
const TRACK_AUDIO: TimelineTrack = {
  id: "track_audio",
  name: "Audio 1",
  type: "audio",
  index: 1,
  visible: true,
  locked: false
};

const POP_ANIMATION: ClipAnimation = {
  id: "anim_pop",
  role: "in",
  preset: "pop",
  durationMs: POP_DURATION_MS
};

function harness(audioBytes: Uint8Array): ProcessingContext {
  return {
    userId: USER,
    getSetting: async () => null,
    resolveAssetBytes: async (uri: string) =>
      uri.includes(ASSET_ID) ? { bytes: audioBytes } : { bytes: undefined }
  } as unknown as ProcessingContext;
}

async function seedTimeline(): Promise<string> {
  const { TimelineSequence } = await import("@nodetool-ai/models");
  const document = {
    tracks: [TRACK_VIDEO, TRACK_AUDIO],
    clips: [
      {
        id: "clip_text",
        trackId: TRACK_VIDEO.id,
        name: "Drop title",
        startMs: 0,
        durationMs: SEQUENCE_MS,
        mediaType: "text",
        sourceType: "generated",
        status: "generated",
        textStyle: { text: "DROP", fontSizePx: 90, color: "#ffffff" },
        animations: [POP_ANIMATION]
      },
      {
        id: "clip_audio",
        trackId: TRACK_AUDIO.id,
        name: "Kicks",
        startMs: 0,
        durationMs: SEQUENCE_MS,
        mediaType: "audio",
        sourceType: "imported",
        status: "generated",
        currentAssetId: ASSET_ID
      }
    ],
    markers: []
  };
  const sequence = new TimelineSequence({
    user_id: USER,
    project_id: "default",
    name: "Drop demo",
    fps: 30,
    width: 1280,
    height: 720,
    duration_ms: SEQUENCE_MS,
    document: JSON.stringify(document)
  });
  await sequence.save();
  return sequence.id;
}

async function textClipOf(timelineId: string): Promise<TimelineClip> {
  const { TimelineSequence } = await import("@nodetool-ai/models");
  const sequence = await TimelineSequence.findById(timelineId);
  const clip = sequence!.toDocument().clips.find((c) => c.id === "clip_text");
  if (!clip) throw new Error("clip_text is missing from the saved document");
  return clip;
}

const CANVAS = { width: 1280, height: 720 };

/** The layer's resolved x-scale at `timeMs`; identity (no transform) reads 1. */
function scaleAt(clip: TimelineClip, timeMs: number): number {
  const [layer] = computeActiveLayers([TRACK_VIDEO], [clip], timeMs);
  if (!layer) throw new Error(`no active layer for ${clip.id} at ${timeMs}ms`);
  return resolveAnimatedLayerProps(layer, timeMs, CANVAS).transform?.scale.x ?? 1;
}

describe("audio-driven motion demo: kicks scale the DROP title (T15)", () => {
  let timelineId = "";

  beforeEach(async () => {
    initTestDb();
    timelineId = await seedTimeline();
    const run = createCapabilityRun({
      context: harness(withKicks(SEQUENCE_MS, KICKS_MS)),
      gate: UNGATED
    });
    const result = (await run.invoke("bake_audio_animation", {
      timeline_id: timelineId,
      audio_clip_id: "clip_audio",
      target_clip_id: "clip_text",
      property: "scale",
      mode: "beats",
      output_range: OUTPUT_RANGE,
      attack_ms: 30,
      release_ms: 200
    })) as Record<string, unknown>;
    expect(result["error"]).toBeUndefined();
    expect(result["replaced"]).toBe(false);
  });

  afterEach(() => {
    ModelObserver.clear();
  });

  it("adds exactly one baked animation beside the untouched pop", async () => {
    const clip = await textClipOf(timelineId);
    expect(clip.animations).toHaveLength(2);

    const pop = clip.animations!.find((a) => a.preset === "pop");
    // Untouched: same id and params as what the document was seeded with —
    // the bake must not rewrite an animation it did not produce.
    expect(pop).toEqual(POP_ANIMATION);

    const baked = clip.animations!.find((a) => a.preset === "custom");
    expect(baked).toBeDefined();
    expect(baked!.custom?.timeBase).toBe("source");
    expect(baked!.custom?.bakedFrom).toMatchObject({
      kind: "audio",
      clipId: "clip_audio",
      assetId: ASSET_ID
    });
    expect(baked!.custom?.curves).toHaveLength(1);
    expect(baked!.custom!.curves[0]!.property).toBe("scale");

    const keyframes = baked!.custom!.curves[0]!.keyframes;
    const peaks = keyframes
      .filter((kf) => Math.abs(kf.value - OUTPUT_RANGE[1]) < 1e-6)
      .map((kf) => kf.sourceMs)
      .sort((a, b) => a - b);
    // One pulse per kick, each within about a frame of where the kick was
    // programmed (see `ONSET_LEAD_TOLERANCE_MS`).
    expect(peaks).toHaveLength(KICKS_MS.length);
    peaks.forEach((peakMs, index) => {
      expect(Math.abs(peakMs - KICKS_MS[index]!)).toBeLessThanOrEqual(
        ONSET_LEAD_TOLERANCE_MS
      );
    });
    // Quiet everywhere else: the curve rests at the low end of the range.
    expect(keyframes[0]!.value).toBeCloseTo(OUTPUT_RANGE[0], 6);
    expect(keyframes[keyframes.length - 1]!.value).toBeCloseTo(
      OUTPUT_RANGE[0],
      6
    );
  });

  it("proves the check can fail: a wrong peak time is rejected", async () => {
    const clip = await textClipOf(timelineId);
    const keyframes = clip.animations!.find((a) => a.preset === "custom")!
      .custom!.curves[0]!.keyframes;
    const firstPeakMs = keyframes.find(
      (kf) => Math.abs(kf.value - OUTPUT_RANGE[1]) < 1e-6
    )!.sourceMs;
    // A peak nowhere near the first kick must not pass the same tolerance
    // the previous test uses — this is the check that its passing result
    // means something, not a permanently-broken assertion.
    expect(
      Math.abs(firstPeakMs - (KICKS_MS[0]! + 500)) <= ONSET_LEAD_TOLERANCE_MS
    ).toBe(false);
  });

  it("samples motion: the pop plays independently and the two multiply", async () => {
    const clip = await textClipOf(timelineId);
    const popOnly: TimelineClip = {
      ...clip,
      animations: clip.animations!.filter((a) => a.preset === "pop")
    };
    const bakedOnly: TimelineClip = {
      ...clip,
      animations: clip.animations!.filter((a) => a.preset === "custom")
    };

    // 100ms: well inside the 600ms pop, and far from the first kick (500ms) —
    // motion comes from the pop alone.
    const pop100 = scaleAt(popOnly, 100);
    const baked100 = scaleAt(bakedOnly, 100);
    expect(baked100).toBeCloseTo(1, 6);
    expect(pop100).toBeGreaterThan(0.6); // pop's own t=0 value
    expect(pop100).toBeLessThan(0.95); // still mid-entrance, not settled
    expect(scaleAt(clip, 100)).toBeCloseTo(pop100 * baked100, 6);

    // 500ms: the first kick. The pop is nearly settled (t=500 of 600) but
    // still technically live, so the resolved scale is the product of both —
    // not the baked curve alone.
    const pop500 = scaleAt(popOnly, 500);
    const baked500 = scaleAt(bakedOnly, 500);
    expect(baked500).toBeGreaterThan(1.15); // near the top of [1, 1.3]
    expect(scaleAt(clip, 500)).toBeCloseTo(pop500 * baked500, 6);

    // 1000ms: between kicks, and the pop's 600ms window is long over — both
    // components are back at identity.
    const pop1000 = scaleAt(popOnly, 1000);
    const baked1000 = scaleAt(bakedOnly, 1000);
    expect(pop1000).toBeCloseTo(1, 6);
    expect(baked1000).toBeCloseTo(1, 6);
    expect(scaleAt(clip, 1000)).toBeCloseTo(1, 6);

    // 1500ms: the second kick. The pop is long finished, so this time the
    // resolved scale is the baked curve alone.
    const pop1500 = scaleAt(popOnly, 1500);
    const baked1500 = scaleAt(bakedOnly, 1500);
    expect(pop1500).toBeCloseTo(1, 6);
    expect(baked1500).toBeGreaterThan(1.15);
    expect(scaleAt(clip, 1500)).toBeCloseTo(baked1500, 6);

    // The two kicks read the same way relative to the quiet baseline between
    // them — this is what makes it "driven by every kick", not one lucky hit.
    expect(baked500 - baked1000).toBeGreaterThan(0.15);
    expect(baked1500 - baked1000).toBeGreaterThan(0.15);
  });

  it("renders larger on screen at a kick than between kicks", async () => {
    registerBundledFonts();
    const { TimelineSequence } = await import("@nodetool-ai/models");
    const stored = await TimelineSequence.findById(timelineId);
    const sequence = stored!.toTimelineSequence();

    const { frames } = await renderTimelineFrames({
      sequence,
      timesMs: [500, 1000],
      // Rendered at half the sequence's own resolution — small enough to be
      // fast, large enough that a 200px-tall "DROP" is nowhere near clipping
      // against the frame edge (a 320px preview clips it at rest, which
      // hides the scale change instead of showing it).
      width: 640,
      loadAsset: async () => null // the text layer needs no asset bytes
    });
    expect(frames).toHaveLength(2);
    const [atKick, betweenKicks] = frames;
    expect(atKick!.layers[0]!.text).toBe("DROP");

    const inkBounds = async (
      png: Uint8Array
    ): Promise<{ width: number; height: number }> => {
      const image = await loadImage(Buffer.from(png));
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      const { data, width, height } = ctx.getImageData(
        0,
        0,
        image.width,
        image.height
      );
      let left = width;
      let right = -1;
      let top = height;
      let bottom = -1;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          // The glyphs are white on a black ground; count bright pixels only.
          if (data[(y * width + x) * 4]! > 150) {
            if (x < left) left = x;
            if (x > right) right = x;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
          }
        }
      }
      if (right < 0) throw new Error("no text pixels were drawn");
      return { width: right - left + 1, height: bottom - top + 1 };
    };

    const kickBounds = await inkBounds(atKick!.png);
    const restBounds = await inkBounds(betweenKicks!.png);
    // Uniform scale grows both axes together; a wide margin over the
    // ~1.26x the sampled `scaleAt` predicts absorbs antialiasing at the edge.
    expect(kickBounds.width).toBeGreaterThan(restBounds.width * 1.1);
    expect(kickBounds.height).toBeGreaterThan(restBounds.height * 1.1);
  });
});
