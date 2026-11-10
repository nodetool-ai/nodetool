import { expect, it } from "vitest";
import { clipEffect } from "../src/api-schemas/timeline.js";
import { buildEffect, effectParams } from "../src/api-schemas/timeline-tool-params.js";

it("keeps exposure documents without blacks valid and bounds blacks to -1..1", () => {
  const base = {id: "e", type: "exposure", enabled: true, exposure: 0.5, whites: 0.2};
  expect(clipEffect.safeParse(base).success).toBe(true);
  expect(clipEffect.safeParse({...base, blacks: -0.4}).success).toBe(true);
  expect(clipEffect.safeParse({...base, blacks: 1.5}).success).toBe(false);
  expect(buildEffect(effectParams.parse({type: "exposure", blacks: 0.3}), 0)).toMatchObject({type: "exposure", blacks: 0.3});
  expect(buildEffect(effectParams.parse({type: "exposure"}), 0)).toMatchObject({blacks: 0});
});

it("validates hue saturation curves and round-trips them through tool creation", () => {
  const curves = {hueVsSat: [{x: 0, y: 0.2}, {x: 1, y: 0.2}], hueVsHue: [{x: 0.3, y: 0.6}], hueVsLuma: [{x: 0.5, y: 0.4}],
    lumaVsSat: [{x: 0, y: 0.5}, {x: 1, y: 0.3}], satVsSat: [{x: 1, y: 0.7}]};
  const effect = buildEffect(effectParams.parse({type: "hueSatCurves", ...curves}), 0);
  expect(effect).toMatchObject({type: "hueSatCurves", enabled: true, ...curves});
  expect(clipEffect.parse(effect)).toEqual(effect);
  expect(clipEffect.safeParse({id: "h", type: "hueSatCurves", enabled: true}).success).toBe(true);
  expect(clipEffect.safeParse({id: "h", type: "hueSatCurves", enabled: true, hueVsSat: [{x: 0, y: 2}]}).success).toBe(false);
});

it("accepts vignette roundness from -1 to 1", () => {
  const vignette = {id: "v", type: "vignette", enabled: true, amount: 0.4, softness: 0.5};
  expect(clipEffect.safeParse({...vignette, roundness: -1}).success).toBe(true);
  expect(clipEffect.safeParse({...vignette, roundness: -1.1}).success).toBe(false);
});
