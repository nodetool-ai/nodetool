#!/usr/bin/env node
// Plan conformance (DESIGN.md D6): diffs `nodetool-timeline --dump-plan`
// against the web scene model from `@nodetool-ai/timeline/scene` on the same
// fixtures and times. It compares, per sampled time, the active set and the
// draw order (bottom to top: z, then in-track order), and per layer z,
// opacity, and the placement matrix with a tolerance of 1e-6.
//
// The oracle builds each layer the way the web compositors do:
// `computeActiveLayers`, then `resolveAnimatedLayerProps` for opacity and
// transform, then `buildTransformMatrix` with `containBaseScale` of the
// source size, then a stable sort by `trackZ`. The source size is the clip's
// `width`/`height`, else the sequence size, the same rule as native SceneEval.
// `sourceTimeMs` is printed by native but not compared here.
//
// Each fixture must first parse with the protocol's `timelineSequenceResponse`
// Zod schema, so a fixture is always a valid NodeTool sequence.
//
// Usage (needs `npm run build:packages` for the timeline dist):
//   node native/timeline/scripts/plan-conformance.mjs [--json] [--bin PATH] [fixture.json ...]
// --json prints one JSON object: the verdict, the layer count, and per fixture
// the times, layers, verdict and mismatches.
// With no fixtures it checks every fixture in native/timeline/fixtures/.
// Exit 0 only when every layer matches and at least one layer was compared.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { timelineSequenceResponse } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import {
  IDENTITY_TRANSFORM,
  buildTransformMatrix,
  computeActiveLayers,
  containBaseScale,
  resolveAnimatedLayerProps,
  trackZ
} from "@nodetool-ai/timeline/scene";

const TOLERANCE = 1e-6;
const GRID_MS = 100;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  let bin = path.join(root, "build", "nodetool-timeline");
  let json = false;
  const fixtures = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--bin") {
      bin = argv[++i];
    } else if (argv[i] === "--json") {
      json = true;
    } else {
      fixtures.push(path.resolve(argv[i]));
    }
  }
  if (fixtures.length === 0) {
    const dir = path.join(root, "fixtures");
    for (const name of fs.readdirSync(dir).sort()) {
      if (name.endsWith(".json")) fixtures.push(path.join(dir, name));
    }
  }
  return { bin, fixtures, json };
}

// A grid over the sequence plus every clip edge and transition midpoint, with
// a 1 ms step either side, so boundaries and dissolves are both sampled.
function sampleTimes(doc) {
  const times = new Set();
  for (let t = 0; t <= doc.durationMs; t += GRID_MS) times.add(t);
  for (const clip of doc.clips) {
    const end = clip.startMs + clip.durationMs;
    for (const t of [clip.startMs, end]) {
      times.add(t - 1);
      times.add(t);
      times.add(t + 1);
    }
    const tr = clip.transitionIn?.durationMs;
    if (tr && tr > 0) times.add(clip.startMs + tr / 2);
  }
  return [...times].filter((t) => t >= 0).sort((a, b) => a - b);
}

function oraclePlan(doc, timeMs) {
  const canvas = { width: doc.width, height: doc.height, fps: doc.fps };
  const layers = computeActiveLayers(doc.tracks, doc.clips, timeMs, {}).map((layer, order) => {
    const anim = resolveAnimatedLayerProps(layer, timeMs, canvas);
    const srcW = layer.clip.width ?? doc.width;
    const srcH = layer.clip.height ?? doc.height;
    const matrix = buildTransformMatrix(
      anim.transform ?? IDENTITY_TRANSFORM,
      containBaseScale(srcW, srcH, doc.width, doc.height),
      doc.width,
      doc.height,
      layer.parentMatrix
    );
    return { clipId: layer.clipId, z: trackZ(layer.trackIndex), opacity: anim.opacity, matrix: [...matrix], order };
  });
  // The compositors' stable bottom-up sort by z.
  layers.sort((a, b) => a.z - b.z || a.order - b.order);
  return layers;
}

function compareFixture(bin, fixture) {
  const doc = JSON.parse(fs.readFileSync(fixture, "utf8"));
  const parsed = timelineSequenceResponse.safeParse(doc);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `schema: ${issue.path.join(".")}: ${issue.message}`);
    return { fixture: path.relative(process.cwd(), fixture), times: 0, layersCompared: 0, mismatches: issues };
  }
  const times = sampleTimes(doc);
  const out = execFileSync(bin, [fixture, "--dump-plan", "--times", times.join(",")], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024
  });
  const native = JSON.parse(out);
  const mismatches = [];
  let layersCompared = 0;
  if (!Array.isArray(native.frames) || native.frames.length !== times.length) {
    mismatches.push(`native returned ${native.frames?.length ?? "no"} frames for ${times.length} times`);
    return { fixture: path.relative(process.cwd(), fixture), times: times.length, layersCompared, mismatches };
  }
  native.frames.forEach((frame, i) => {
    const t = times[i];
    // Validate before comparing: NaN or a missing value compares as "not
    // over tolerance", so a malformed layer would otherwise count as a match.
    if (!isFiniteNumber(frame.timeMs) || Math.abs(frame.timeMs - t) > TOLERANCE) {
      mismatches.push(`frame ${i}: native timeMs ${frame.timeMs}, requested ${t}`);
      return;
    }
    if (!Array.isArray(frame.layers)) {
      mismatches.push(`t=${t}: native layers is not an array`);
      return;
    }
    const want = oraclePlan(doc, t);
    const got = frame.layers;
    const wantIds = want.map((l) => l.clipId).join(",");
    const gotIds = got.map((l) => l.clipId).join(",");
    if (wantIds !== gotIds) {
      mismatches.push(`t=${t}: layers web [${wantIds}] native [${gotIds}]`);
      return;
    }
    want.forEach((w, j) => {
      const g = got[j];
      const invalid = invalidLayer(g);
      if (invalid) {
        mismatches.push(`t=${t} ${w.clipId}: native ${invalid}`);
        return;
      }
      let ok = true;
      if (w.z !== g.z) {
        mismatches.push(`t=${t} ${w.clipId}: z web ${w.z} native ${g.z}`);
        ok = false;
      }
      if (!(Math.abs(w.opacity - g.opacity) <= TOLERANCE)) {
        mismatches.push(`t=${t} ${w.clipId}: opacity web ${w.opacity} native ${g.opacity}`);
        ok = false;
      }
      for (let k = 0; k < 16; k++) {
        if (!(Math.abs(w.matrix[k] - g.matrix[k]) <= TOLERANCE)) {
          mismatches.push(`t=${t} ${w.clipId}: matrix[${k}] web ${w.matrix[k]} native ${g.matrix[k]}`);
          ok = false;
          break;
        }
      }
      if (ok) layersCompared++;
    });
  });
  return { fixture: path.relative(process.cwd(), fixture), times: times.length, layersCompared, mismatches };
}

function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/** Why a native layer is malformed, or null. */
function invalidLayer(layer) {
  if (typeof layer?.clipId !== "string") return "clipId is not a string";
  if (!Number.isInteger(layer.z)) return `z ${layer.z} is not an integer`;
  if (!isFiniteNumber(layer.opacity)) return `opacity ${layer.opacity} is not a finite number`;
  if (!Array.isArray(layer.matrix) || layer.matrix.length !== 16) {
    return `matrix has ${Array.isArray(layer.matrix) ? layer.matrix.length : "no"} elements, not 16`;
  }
  if (!layer.matrix.every(isFiniteNumber)) return "matrix has a non-finite element";
  return null;
}

const { bin, fixtures, json } = parseArgs(process.argv.slice(2));
const results = fixtures.map((fixture) => compareFixture(bin, fixture));
const layersCompared = results.reduce((n, r) => n + r.layersCompared, 0);
const failures = results.flatMap((r) => [
  ...r.mismatches.map((m) => `${r.fixture}: ${m}`),
  ...(r.layersCompared === 0 ? [`${r.fixture}: compared 0 layers`] : [])
]);
const pass = failures.length === 0 && layersCompared > 0;
if (json) {
  console.log(
    JSON.stringify({
      verdict: pass ? "pass" : "fail",
      layersCompared,
      failures: failures.length,
      fixtures: results.map((r) => ({
        fixture: r.fixture,
        times: r.times,
        layersCompared: r.layersCompared,
        verdict: r.mismatches.length === 0 && r.layersCompared > 0 ? "pass" : "fail",
        mismatches: r.mismatches
      }))
    })
  );
} else {
  for (const r of results) {
    console.log(`${r.fixture}: ${r.times} times, ${r.layersCompared} layers compared, ${r.mismatches.length} mismatches`);
    for (const m of r.mismatches.slice(0, 20)) console.log(`  ${m}`);
    if (r.mismatches.length > 20) console.log(`  ... ${r.mismatches.length - 20} more`);
    if (r.layersCompared === 0) console.log("  FAIL: compared 0 layers");
  }
  console.log(pass ? `PASS: ${layersCompared} layers match` : `FAIL: ${failures.length} failures`);
}
process.exit(pass ? 0 : 1);
