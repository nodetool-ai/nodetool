/**
 * Bounds mirror: the wire schema must refuse exactly what the custom-animation
 * bake refuses. `packages/protocol` cannot import `@nodetool-ai/timeline` (the
 * dependency runs the other way), so `.max(...)` on the Zod arrays is a written
 * number; this file is what pins that number to the constant it copies, in the
 * one package that holds both sides.
 *
 * Without it, raising `MAX_CUSTOM_KEYFRAMES` leaves the wire refusing curves
 * the baker happily produces, and lowering it leaves the wire accepting a
 * document no renderer will sample.
 */
import { describe, expect, it } from "vitest";

import { clipAnimation } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import {
  MAX_CUSTOM_CURVES,
  MAX_CUSTOM_KEYFRAMES
} from "@nodetool-ai/timeline";

const keyframes = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ t: i / count, value: i }));

const curves = (count: number, keyframeCount = 1) =>
  Array.from({ length: count }, (_, i) => ({
    property: `p${i}`,
    keyframes: keyframes(keyframeCount)
  }));

const animation = (custom: unknown) => ({
  id: "a1",
  role: "in" as const,
  preset: "custom",
  durationMs: 500,
  custom
});

describe("clipAnimation.custom bounds mirror the baker's limits", () => {
  it("accepts exactly MAX_CUSTOM_CURVES curves and refuses one more", () => {
    expect(
      clipAnimation.safeParse(animation({ curves: curves(MAX_CUSTOM_CURVES) }))
        .success
    ).toBe(true);
    expect(
      clipAnimation.safeParse(
        animation({ curves: curves(MAX_CUSTOM_CURVES + 1) })
      ).success
    ).toBe(false);
  });

  it("accepts exactly MAX_CUSTOM_KEYFRAMES per curve and refuses one more", () => {
    expect(
      clipAnimation.safeParse(
        animation({ curves: curves(1, MAX_CUSTOM_KEYFRAMES) })
      ).success
    ).toBe(true);
    expect(
      clipAnimation.safeParse(
        animation({ curves: curves(1, MAX_CUSTOM_KEYFRAMES + 1) })
      ).success
    ).toBe(false);
  });
});

describe("clipAnimation timing bounds", () => {
  const base = { id: "a1", role: "in" as const, preset: "fadeIn" };

  it("refuses a window with no frames in it", () => {
    expect(clipAnimation.safeParse({ ...base, durationMs: 0 }).success).toBe(
      false
    );
    expect(clipAnimation.safeParse({ ...base, durationMs: -1 }).success).toBe(
      false
    );
    expect(clipAnimation.safeParse({ ...base, durationMs: 1 }).success).toBe(
      true
    );
  });

  // `z.number()` refuses NaN and Infinity on its own; this pins that, so a
  // later widening to `z.coerce.number()` or a custom refinement cannot quietly
  // let a non-finite delay into a stored document.
  it("refuses a delay that is not a finite number of milliseconds", () => {
    const parse = (delayMs: number) =>
      clipAnimation.safeParse({ ...base, durationMs: 500, delayMs }).success;
    expect(parse(Number.NaN)).toBe(false);
    expect(parse(Number.POSITIVE_INFINITY)).toBe(false);
    // A negative delay is a lead-in, not an error — the compiler clamps it.
    expect(parse(-100)).toBe(true);
    expect(parse(250)).toBe(true);
  });
});
