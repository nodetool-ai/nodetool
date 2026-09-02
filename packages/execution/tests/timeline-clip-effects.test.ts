/**
 * `unknown_effect`: an effect type this build cannot apply (D7, I2), with the
 * fixture that triggers it and a control the check must stay quiet on (I12).
 *
 * A warning rather than an error. T11b made the schema carry an unknown effect
 * instead of refusing the document, so the type now reaches the renderer, which
 * steps over it — the layer draws without that effect, which is a different
 * picture and not a missing one.
 */
import { describe, expect, it } from "vitest";

import { validateTimelineSequence } from "../src/timeline-debug/index.js";

type Json = Record<string, unknown>;

const clip = (over: Json): Json => ({
  trackId: "track-1",
  name: "Clip",
  startMs: 0,
  durationMs: 1000,
  mediaType: "video",
  sourceType: "imported",
  status: "generated",
  locked: false,
  versions: [],
  ...over
});

const doc = (clips: Json[]): Json => ({
  tracks: [
    {
      id: "track-1",
      name: "Video 1",
      type: "video",
      index: 0,
      visible: true,
      locked: false
    }
  ],
  clips,
  markers: []
});

const effectWarnings = (
  result: ReturnType<typeof validateTimelineSequence>
): ReadonlyArray<{ message: string; path?: string }> =>
  result.warnings.filter((w) => w.code === "unknown_effect");

describe("validateTimelineSequence — clip effects", () => {
  it("stays quiet on every type this build applies", () => {
    const result = validateTimelineSequence(
      doc([
        clip({
          id: "a",
          effects: [
            { id: "1", type: "color", enabled: true, brightness: 0.1 },
            { id: "2", type: "blur", enabled: true, radius: 4 },
            { id: "3", type: "glow", enabled: true, radius: 8, intensity: 1 },
            {
              id: "4",
              type: "dropShadow",
              enabled: true,
              offsetX: 6,
              offsetY: 6,
              blur: 8,
              color: "#000000"
            },
            {
              id: "5",
              type: "vignette",
              enabled: true,
              amount: 0.5,
              softness: 0.5
            },
            { id: "6", type: "sharpen", enabled: true, amount: 1 },
            {
              id: "7",
              type: "chromaKey",
              enabled: true,
              color: "#00ff00",
              tolerance: 0.2,
              softness: 0.05
            },
            {
              id: "8",
              type: "curves",
              enabled: true,
              master: [
                { x: 0, y: 0 },
                { x: 1, y: 1 }
              ]
            },
            {
              id: "9",
              type: "levels",
              enabled: true,
              inBlack: 0,
              inWhite: 1,
              gamma: 1,
              outBlack: 0,
              outWhite: 1
            },
            {
              id: "10",
              type: "liftGammaGain",
              enabled: true,
              lift: [0, 0, 0],
              gamma: [1, 1, 1],
              gain: [1, 1, 1]
            }
          ]
        })
      ])
    );

    expect(effectWarnings(result)).toEqual([]);
  });

  it("names an effect type it cannot apply, and where it sits", () => {
    const result = validateTimelineSequence(
      doc([
        clip({
          id: "a",
          effects: [
            { id: "1", type: "blur", enabled: true, radius: 4 },
            { id: "2", type: "halation", enabled: true, radius: 12 }
          ]
        })
      ])
    );

    const warnings = effectWarnings(result);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.path).toBe("effects[1].type");
    expect(warnings[0]?.message).toContain("halation");
    // The fallback is stated, so a reader knows the clip still draws.
    expect(warnings[0]?.message).toContain("draws without it");
  });

  it("reports a disabled unknown effect too — enabling it is one edit away", () => {
    const result = validateTimelineSequence(
      doc([
        clip({
          id: "a",
          effects: [{ id: "1", type: "halation", enabled: false, radius: 12 }]
        })
      ])
    );

    expect(effectWarnings(result)).toHaveLength(1);
  });
});
