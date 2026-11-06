import { expect, it } from "vitest";
import { clipEffect } from "../src/api-schemas/timeline.js";
import { buildEffect, effectParams } from "../src/api-schemas/timeline-tool-params.js";

it("round-trips deband controls through tools and documents", () => {
  const settings = {strength: 0.8, range: 24, threshold: 0.025, dither: 0.9};
  expect(clipEffect.parse(buildEffect(effectParams.parse({type: "deband", ...settings}), 0))).toMatchObject(settings);
});
it.each([{strength: -1}, {range: 65}, {range: 1.5}, {threshold: 0.2}, {dither: 2}])("rejects invalid deband settings %j", settings => {
  expect(clipEffect.safeParse({id: "d", type: "deband", enabled: true, ...settings}).success).toBe(false);
  expect(effectParams.safeParse({type: "deband", ...settings}).success).toBe(false);
});
