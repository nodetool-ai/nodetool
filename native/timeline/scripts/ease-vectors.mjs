#!/usr/bin/env node
// Writes fixtures/plan/ease-vectors.json: `ease(id, t)` from @nodetool-ai/timeline
// for every easing form the native port reads, at t from -0.5 to 1.5 (outside
// [0, 1] too, where a spring overshoots or a keyframe is extrapolated).
// tests/tst_easing.cpp compares native `scene::ease` with these values.
//
// Usage (needs `npm run build:packages`): node native/timeline/scripts/ease-vectors.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ease } from "@nodetool-ai/timeline";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IDS = [
  "linear", "easeIn", "easeOut", "easeInOut", "easeOutBack", "easeOutElastic", "easeOutBounce", "easeInExpo",
  "easeOutExpo", "easeInOutExpo", "easeInQuint", "easeOutQuint", "easeInOutQuint", "easeInCirc", "easeOutCirc",
  "easeInOutCirc", "hold", " easeOut ", "cubic-bezier(0.65,0,0.35,1)", "cubic-bezier(0.16,1,0.3,1)",
  "cubic-bezier(0.5,-0.4,0.5,1.4)", "cubic-bezier(-1,0,2,1)", "cubic-bezier(0, 0, 1, 1)", "spring(190,18,1)",
  "spring(100,20,1)", "spring(100,40,1)", "spring(260,14,1)", "spring(1,1,1)", "spring(0,1,1)", "spring(170,17)",
  "notAnEasing(1)", "cubic-bezier(1,2,3)", ""
];
const ts = [];
for (let i = -20; i <= 60; i++) ts.push(i / 40);
ts.push(0.0001, 0.9999, 1e-9, 1 - 1e-9);
const out = {};
for (const id of IDS) out[id] = ts.map((t) => [t, ease(id, t)]);
fs.writeFileSync(path.join(root, "fixtures", "plan", "ease-vectors.json"), `${JSON.stringify(out)}\n`);
console.log(`wrote fixtures/plan/ease-vectors.json: ${IDS.length} easings x ${ts.length} points`);
