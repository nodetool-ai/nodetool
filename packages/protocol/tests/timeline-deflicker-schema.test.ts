import { expect, it } from "vitest";
import { clipEffect } from "../src/api-schemas/timeline.js";
import { buildEffect, effectParams } from "../src/api-schemas/timeline-tool-params.js";

const analysis = {version: 1, source: {assetId: "source", mediaPath: ""}, rangeStartMs: 0, rangeEndMs: 1000,
  windowMs: 500, maxCorrection: 1, frameRate: 30, samples: [{timeMs: 0, stops: .5}, {timeMs: 40, stops: -.5}]};
it("preserves bounded source analysis through tools and saves", () => {
  const result = buildEffect(effectParams.parse({type: "deflicker", analysis}), 0);
  expect(clipEffect.parse(result)).toMatchObject({type: "deflicker", strength: 1, analysis});
});
it.each([{windowMs: -1}, {windowMs: 2001}, {maxCorrection: 4}, {strength: 2},
  {analysis: {...analysis, samples: analysis.samples.toReversed()}},
  {analysis: {...analysis, samples: [{timeMs: 0, stops: 4}]}},
  {analysis: {...analysis, maxCorrection: .1}},
  {analysis: {...analysis, samples: [{timeMs: 100, stops: 0}]}},
  {analysis: {...analysis, samples: []}}])("rejects invalid analysis or controls %j", patch => {
  expect(clipEffect.safeParse({id: "d", type: "deflicker", enabled: true, ...patch}).success).toBe(false);
  expect(effectParams.safeParse({type: "deflicker", ...patch}).success).toBe(false);
});
