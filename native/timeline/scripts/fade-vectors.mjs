#!/usr/bin/env node
// Fade-curve vectors (PLAN M3 exit 5): samples the TypeScript fade functions
// of @nodetool-ai/timeline (audioFade.ts) and writes them as JSON for
// tests/tst_fadecurves.cpp, which compares the C++ port within 1e-6.
//   - `fadeShapeGain` for each of the four shapes at 1001 points in [0, 1],
//     plus out-of-range and NaN inputs;
//   - `resolveClipFades` and `clipFadeGain` on clips whose fades fit, are
//     capped at the clip, and cross (capped at half).
//
// Usage (needs `npm run build:packages` for the timeline dist):
//   node native/timeline/scripts/fade-vectors.mjs [--out FILE]
// Without --out it prints the JSON. Exit 0 when every vector was written.

import fs from "node:fs";

import { CLIP_FADE_SHAPES, clipFadeGain, fadeShapeGain, resolveClipFades } from "@nodetool-ai/timeline";

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const out = outIndex >= 0 ? args[outIndex + 1] : null;

const shapes = [];
for (const shape of CLIP_FADE_SHAPES) {
  const ts = [];
  for (let i = 0; i <= 1000; i++) ts.push(i / 1000);
  ts.push(-0.5, 1.5, 0.123456789, 0.987654321);
  shapes.push({ shape, points: ts.map((t) => [t, fadeShapeGain(shape, t)]), nanGain: fadeShapeGain(shape, Number.NaN) });
}

const clips = [
  { fadeInMs: 500, fadeOutMs: 800, fadeInShape: "sCurve", fadeOutShape: "plus3dB", durationMs: 4000 },
  { fadeInMs: 3000, fadeOutMs: 3000, fadeInShape: "minus3dB", fadeOutShape: "linear", durationMs: 4000 },
  { fadeInMs: 9000, fadeOutMs: 0, fadeInShape: "plus3dB", fadeOutShape: "bogus", durationMs: 2500 },
  { fadeInMs: -20, fadeOutMs: 1200, fadeInShape: "linear", fadeOutShape: "minus3dB", durationMs: 1000 }
];
const clipVectors = clips.map((clip) => {
  const resolved = resolveClipFades(clip, clip.durationMs);
  const points = [];
  for (let ms = -100; ms <= clip.durationMs + 100; ms += 7.25) points.push([ms, clipFadeGain(clip, clip.durationMs, ms)]);
  return { clip, resolved, points };
});

const count = shapes.reduce((n, s) => n + s.points.length, 0) + clipVectors.reduce((n, c) => n + c.points.length, 0);
if (count === 0) {
  console.error("fade-vectors: no vectors");
  process.exit(1);
}
const json = JSON.stringify({ shapes, clips: clipVectors, count });
if (out) {
  fs.writeFileSync(out, json);
  console.error(`fade-vectors: ${count} values -> ${out}`);
} else {
  console.log(json);
}
