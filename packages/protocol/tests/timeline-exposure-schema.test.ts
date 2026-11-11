import { expect, it } from "vitest";
import { clipEffect, trackColorCorrectionEffect } from "../src/api-schemas/timeline.js";
import { buildEffect, effectParams } from "../src/api-schemas/timeline-tool-params.js";

it("persists exposure controls on clips and tracks", () => {
  const controls = {exposure: 1.5, rolloff: 0.7, whites: -0.5};
  expect(clipEffect.parse({id: "e", type: "exposure", enabled: true, ...controls})).toMatchObject(controls);
  expect(trackColorCorrectionEffect.parse({id: "t", type: "colorCorrection", enabled: true,
    brightness: 0, contrast: 1, saturation: 1, hue: 0, temperature: 0, tint: 0, shadows: 0, highlights: 0, ...controls})).toMatchObject(controls);
  expect(buildEffect(effectParams.parse({type: "exposure", ...controls}), 0)).toMatchObject(controls);
});
it.each([{exposure: 6}, {rolloff: -1}, {whites: 3}])("rejects invalid known exposure parameters %j", controls => {
  expect(clipEffect.safeParse({id: "e", type: "exposure", enabled: true, ...controls}).success).toBe(false);
  expect(effectParams.safeParse({type: "exposure", ...controls}).success).toBe(false);
});
