import { expect, it } from "vitest";
import { clipVignetteEffect, trackVignetteEffect } from "../src/api-schemas/timeline.js";
import { buildEffect, effectParams } from "../src/api-schemas/timeline-tool-params.js";

it("preserves vignette geometry through clip, track and tool boundaries", () => {
  const geometry = {centerX: 0.25, centerY: 0.75, roundness: 1, radius: 1.2};
  const base = {id: "v", type: "vignette", enabled: true, softness: 0.5};
  expect(clipVignetteEffect.parse({...base, amount: 0.4, ...geometry})).toMatchObject(geometry);
  expect(trackVignetteEffect.parse({...base, intensity: 0.4, ...geometry})).toMatchObject(geometry);
  expect(buildEffect(effectParams.parse({type: "vignette", ...geometry}))).toMatchObject(geometry);
  expect(clipVignetteEffect.parse({...base, amount: 0.4})).not.toHaveProperty("centerX");
  expect(clipVignetteEffect.safeParse({...base, amount: 0.4, centerX: -0.1}).success).toBe(false);
});
