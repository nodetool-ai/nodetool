/**
 * Tests for clip audio effects: the defaults factory, the tail estimate the
 * players and the server render pad by, and the `set_clip_params` patch.
 */

import { describe, expect, it } from "vitest";
import { makeClip, makeClipAudioEffect, makeTrack } from "../src/defaults.js";
import { applyTimelineOp } from "../src/ops/apply.js";
import type { TimelineOpState } from "../src/ops/types.js";
import {
  clipAudioEffectTailSec,
  clipAudioTailSec,
  type ClipAudioEffect
} from "../src/types.js";

describe("makeClipAudioEffect", () => {
  it("creates each clip effect type enabled with a fresh id", () => {
    const types: ClipAudioEffect["type"][] = [
      "gain",
      "eq3",
      "filter",
      "compressor",
      "echo",
      "reverb",
      "distortion"
    ];
    const effects = types.map(makeClipAudioEffect);
    expect(effects.map((e) => e.type)).toEqual(types);
    expect(effects.every((e) => e.enabled)).toBe(true);
    expect(new Set(effects.map((e) => e.id)).size).toBe(types.length);
  });
});

describe("clipAudioTailSec", () => {
  it("rings an echo until a repeat falls below -60 dB", () => {
    const echo = {
      ...makeClipAudioEffect("echo"),
      delayMs: 500,
      feedback: 0.5
    } as ClipAudioEffect;
    // 0.5^n = 0.001 → n ≈ 9.97 repeats, plus the first one.
    expect(clipAudioEffectTailSec(echo)).toBeCloseTo(
      0.5 * (Math.log(0.001) / Math.log(0.5) + 1),
      6
    );
  });

  it("adds enabled tails and ignores disabled effects", () => {
    const reverb = { ...makeClipAudioEffect("reverb"), decaySec: 3 };
    const off = { ...makeClipAudioEffect("reverb"), decaySec: 5, enabled: false };
    const gain = makeClipAudioEffect("gain");
    expect(clipAudioTailSec([reverb, off, gain] as ClipAudioEffect[])).toBe(3);
    expect(clipAudioTailSec(undefined)).toBe(0);
  });
});

describe("set_clip_params audioEffects", () => {
  it("replaces the clip's audio effects", async () => {
    const state: TimelineOpState = {
      fps: 30,
      width: 1920,
      height: 1080,
      tracks: [
        makeTrack({ id: "track_a", type: "audio", name: "Audio", index: 0 })
      ],
      clips: [
        makeClip({
          id: "clip_a",
          trackId: "track_a",
          name: "Voice",
          durationMs: 2000,
          mediaType: "audio",
          sourceType: "imported",
          status: "generated",
          currentAssetId: "asset_a"
        })
      ],
      markers: [],
      playheadMs: 0,
      selectedClipIds: []
    };
    const reverb = makeClipAudioEffect("reverb");
    const outcome = await applyTimelineOp(
      state,
      { op: "set_clip_params", target: "clip_a", patch: { audioEffects: [reverb] } },
      { newId: (kind) => `${kind}_1` }
    );
    expect(outcome.error).toBeUndefined();
    expect(outcome.state?.clips[0].audioEffects).toEqual([reverb]);
  });
});
