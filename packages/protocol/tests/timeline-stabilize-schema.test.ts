import { expect, it } from "vitest";
import { clipEffect } from "../src/api-schemas/timeline.js";
import { buildEffect, effectParams } from "../src/api-schemas/timeline-tool-params.js";
const analysis = {version: 1, kind: "stabilize", source: {assetId: "source", mediaPath: ""}, rangeStartMs: 0, rangeEndMs: 1000,
  windowMs: 500, frameRate: 30, width: 256, height: 128, requiredZoom: 1.1, trackedFrames: 1,
  samples: [{timeMs: 0, x: .01, y: -.01, angle: .02, scale: 1}, {timeMs: 40, x: -.01, y: .01, angle: -.02, scale: 1}]};
it("round trips bounded analysis while excluding render-only transforms", () => {
  const result = buildEffect(effectParams.parse({type: "stabilize", analysis}), 0);
  expect(clipEffect.parse(result)).toMatchObject({type: "stabilize", strength: 1, maxZoom: 1.1, analysis});
  expect(effectParams.safeParse({type: "stabilize", _matrix: [1, 0, 0, 0, 1, 0]}).success).toBe(false);
  expect(clipEffect.parse({...result, _matrix: [1, 0, 0, 0, 1, 0]})).not.toHaveProperty("_matrix");
  expect(effectParams.safeParse({type: "deflicker", analysis}).success).toBe(false);
});
it.each([{maxZoom: .9}, {maxZoom: 1.6}, {strength: 2}, {windowMs: 2001},
  {analysis: {...analysis, width: 0}}, {analysis: {...analysis, trackedFrames: 2}},
  {analysis: {...analysis, samples: analysis.samples.toReversed()}}, {analysis: {...analysis, samples: []}}])("rejects invalid motion analysis %j", patch => {
  expect(clipEffect.safeParse({id: "s", type: "stabilize", enabled: true, ...patch}).success).toBe(false);
  expect(effectParams.safeParse({type: "stabilize", ...patch}).success).toBe(false);
});
