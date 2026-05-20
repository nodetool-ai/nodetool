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
        { id: "inspector:blur", type: "blur" as const, enabled: true, radius: 5 }
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
});
