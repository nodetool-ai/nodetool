import { expect, it } from "vitest";
import { clipEffect } from "../src/api-schemas/timeline.js";
import { buildEffect, effectParams } from "../src/api-schemas/timeline-tool-params.js";

it("preserves qualifiers and hue curves through tool creation and document validation", () => {
  const controls = {hueCenter: 355, hueWidth: 20, hueSoftness: 15, saturationMin: 0.2, lightnessMax: 0.8,
    hueShift: 30, saturation: 1.2, lightness: -0.1, hueCurve: [{x: 0.25, y: 0.6}], saturationCurve: [{x: 0.75, y: 0.2}]};
  const effect = buildEffect(effectParams.parse({type: "secondaryColor", ...controls}), 0);
  expect(clipEffect.parse(effect)).toMatchObject(controls);
  expect(clipEffect.parse({...effect, _matte: true})).not.toHaveProperty("_matte");
  expect(effectParams.safeParse({type: "secondaryColor", _matte: true}).success).toBe(false);
});
it.each([{hueWidth: 181}, {saturation: 5}, {lightness: 2}, {hueCurve: [{x: 0, y: 2}]}])("rejects invalid qualifier parameters %j", controls => {
  expect(clipEffect.safeParse({id: "s", type: "secondaryColor", enabled: true, ...controls}).success).toBe(false);
  expect(effectParams.safeParse({type: "secondaryColor", ...controls}).success).toBe(false);
});
