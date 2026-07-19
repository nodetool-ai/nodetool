/**
 * Contract tests for the timeline persistence schema.
 *
 * Regression guard: per-clip GPU effects (color grading, blur), 2-D transform,
 * border radius, and incoming transition must survive a parse round-trip. They
 * live on the `TimelineClip` type and are written by the inspector; when they
 * were missing from this Zod schema, tRPC silently stripped them on autosave,
 * so toggling color grading / blur reverted within one autosave cycle.
 */

import { describe, it, expect } from "vitest";
import { timelineClip } from "../src/api-schemas/timeline.js";

const baseClip = {
  id: "c1",
  trackId: "t1",
  name: "Clip",
  startMs: 0,
  durationMs: 1000,
  mediaType: "video" as const,
  sourceType: "imported" as const,
  status: "generated" as const,
  locked: false,
  versions: []
};

describe("timelineClip schema", () => {
  it("preserves a clip color effect through a parse round-trip", () => {
    const clip = {
      ...baseClip,
      effects: [
        {
          id: "inspector:color",
          type: "color" as const,
          enabled: true,
          brightness: 0.2,
          contrast: 1.1,
          saturation: 1.0
        }
      ]
    };
    const parsed = timelineClip.parse(clip);
    expect(parsed.effects).toEqual(clip.effects);
  });

  it("preserves a clip blur effect through a parse round-trip", () => {
    const clip = {
      ...baseClip,
      effects: [
        {
          id: "inspector:blur",
          type: "blur" as const,
          enabled: true,
          radius: 5
        }
      ]
    };
    const parsed = timelineClip.parse(clip);
    expect(parsed.effects).toEqual(clip.effects);
  });

  it("preserves transform, borderRadius, and transitionIn", () => {
    const clip = {
      ...baseClip,
      transform: {
        position: { x: 10, y: -5 },
        scale: { x: 1.5, y: 1.5 },
        rotation: 0.25,
        anchor: { x: 0.5, y: 0.5 }
      },
      borderRadius: 12,
      transitionIn: { type: "crossfade" as const, durationMs: 300 }
    };
    const parsed = timelineClip.parse(clip);
    expect(parsed.transform).toEqual(clip.transform);
    expect(parsed.borderRadius).toBe(12);
    expect(parsed.transitionIn).toEqual(clip.transitionIn);
  });

  it("rejects an unknown effect type", () => {
    const clip = {
      ...baseClip,
      effects: [{ id: "x", type: "bogus", enabled: true }]
    };
    expect(timelineClip.safeParse(clip).success).toBe(false);
  });

  it("preserves clip animations through a parse round-trip", () => {
    const clip = {
      ...baseClip,
      animations: [
        {
          id: "anim-1",
          role: "in" as const,
          preset: "slide",
          durationMs: 500,
          delayMs: 200,
          easing: "easeOut",
          enabled: true,
          params: { direction: "left", distance: 0.3 }
        },
        {
          id: "anim-2",
          role: "loop" as const,
          preset: "kenBurns",
          durationMs: 3000
        }
      ]
    };
    const parsed = timelineClip.parse(clip);
    expect(parsed.animations).toEqual(clip.animations);
  });

  it("parses a clip with no animations field", () => {
    const parsed = timelineClip.parse(baseClip);
    expect(parsed.animations).toBeUndefined();
  });

  it("accepts an unknown preset string (validation is the engine's job)", () => {
    const clip = {
      ...baseClip,
      animations: [
        {
          id: "a",
          role: "in" as const,
          preset: "future-preset-99",
          durationMs: 400
        }
      ]
    };
    const result = timelineClip.safeParse(clip);
    expect(result.success).toBe(true);
  });

  it("rejects an animation with an unknown role", () => {
    const clip = {
      ...baseClip,
      animations: [{ id: "a", role: "bogus", preset: "fade", durationMs: 400 }]
    };
    expect(timelineClip.safeParse(clip).success).toBe(false);
  });

  it("preserves an authored text clip and its style", () => {
    const clip = {
      ...baseClip,
      mediaType: "text" as const,
      textStyle: {
        text: "Opening title",
        fontSizePx: 96,
        color: "#ffffff",
        align: "center" as const,
        maxWidthFrac: 0.8
      }
    };
    const parsed = timelineClip.parse(clip);
    expect(parsed.mediaType).toBe("text");
    expect(parsed.textStyle).toEqual(clip.textStyle);
  });

  it("preserves an authored shape clip and its style", () => {
    const clip = {
      ...baseClip,
      mediaType: "shape" as const,
      shapeStyle: {
        kind: "ellipse" as const,
        fill: "#334455",
        x: 0.2,
        y: 0.2,
        width: 0.6,
        height: 0.6
      }
    };
    const parsed = timelineClip.parse(clip);
    expect(parsed.shapeStyle).toEqual(clip.shapeStyle);
  });
});
