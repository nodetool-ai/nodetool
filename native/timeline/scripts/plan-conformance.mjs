#!/usr/bin/env node
// Plan conformance (DESIGN.md D6): diffs `nodetool-timeline --dump-plan`
// against the web scene model from `@nodetool-ai/timeline/scene` on the same
// fixtures and times, with a tolerance of 1e-6. Per sampled time it compares
// the active set and the draw order (bottom to top: z, then in-track order),
// and per layer z, kind, opacity, the draw opacity through enclosing
// surfaces, blend mode, stack order, precompose surface, asset id, the source
// time of video and image layers, the animated transform (position, scale,
// rotation, anchor, rotationX/Y, perspective, depth), the cut (type, role,
// eased progress, opacity, scale, offset, wipe, dip solid, iris, effect), the
// animated wipe (direction, progress, softness), and the draw matrix. It also
// compares the precomposite surfaces (order, z, stack order, opacity, blend
// mode, whether effects run, parent surface, cut) and the dropped layers.
// Not compared, because the native app does not draw them: effect chains
// (clip, track, animated blur and grade, camera depth of field, a group's
// effect parameters), crop, border radius, shape masks, matte contents,
// generated mattes, and text, shape, caption and 3D payloads.
//
// The oracle builds each frame the way the browser compositors do
// (web/src/components/timeline/preview/compositeLayers.ts):
// `computeActiveLayersWithHorizon` with the sequence canvas, camera, tempo and
// media tracks, then `resolveAnimatedLayerProps`, then `buildTransformMatrix`
// of `transitionTransform(anim.transform, layer.transition)` with
// `containBaseScale` of the source size and the group's matrix. A caption
// composites frame-sized. The source size is the clip's `width`/`height`,
// else the sequence size, the same rule as native SceneEval. `sourceTimeMs`
// is printed by native but not compared here.
//
// Clips the native loader report lists with a plan-level unsupported field
// (`planUnsupported` in the dump: flex layout, animation links, `followPath`,
// own or inherited from a group) are left out on both sides, with their
// repeater copies and echoes; the result says how many. The excluded ids and
// reasons must equal fixtures/plan/exclusions.json (`--update-exclusions`
// rewrites it), and the flex exclusions must equal the flex trees this script
// finds in the document itself.
//
// Sample times: a 100 ms grid, and ±1 ms around every clip edge, cut end,
// animation window edge, keyframe (curves of at most 16) and loop seam.
//
// Each fixture must first parse with the protocol's `timelineSequenceResponse`
// Zod schema, so a fixture is always a valid NodeTool sequence.
//
// Usage (needs `npm run build:packages` for the timeline dist):
//   node native/timeline/scripts/plan-conformance.mjs [--json] [--bin PATH] [fixture.json ...]
//   node native/timeline/scripts/plan-conformance.mjs [--json] [--bin PATH] --examples [--update-exclusions]
//   node native/timeline/scripts/plan-conformance.mjs [--json] [--bin PATH] --server URL [--cache-dir DIR] --timeline ID ...
// --examples checks the shipped example timelines
// (packages/base-nodes/nodetool/examples/timelines/), written as sequence
// files under build-m5/plan-examples/. Server mode (M5a) reads each document
// with `timeline.get` (GET only, no redirect) and runs the native client with
// `--server URL --timeline ID`.
// --json prints one JSON object: the verdict, the layer count, and per fixture
// the times, layers, precomposites, excluded clips, verdict and mismatches.
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
  clipSourceTimeSec,
  computeActiveLayersWithHorizon,
  containBaseScale,
  createAnimationCompileCache,
  resolveAnimatedLayerProps,
  transitionTransform,
  trackZ
} from "@nodetool-ai/timeline/scene";
import { compileClipAnimations } from "@nodetool-ai/timeline";

const TOLERANCE = 1e-6;
const GRID_MS = 100;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  let bin = path.join(root, "build", "nodetool-timeline");
  let json = false;
  let examples = false;
  let updateExclusions = false;
  let server = null;
  let cacheDir = null;
  const timelines = [];
  const fixtures = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--bin") {
      bin = argv[++i];
    } else if (argv[i] === "--server") {
      server = argv[++i];
    } else if (argv[i] === "--timeline") {
      timelines.push(argv[++i]);
    } else if (argv[i] === "--cache-dir") {
      cacheDir = path.resolve(argv[++i]);
    } else if (argv[i] === "--update-exclusions") {
      updateExclusions = true;
    } else if (argv[i] === "--examples") {
      examples = true;
    } else if (argv[i] === "--json") {
      json = true;
    } else {
      fixtures.push(path.resolve(argv[i]));
    }
  }
  if (examples) fixtures.push(...exampleFixtures());
  if (fixtures.length === 0 && !server) {
    const dir = path.join(root, "fixtures");
    for (const name of fs.readdirSync(dir).sort()) {
      if (name.endsWith(".json")) fixtures.push(path.join(dir, name));
    }
  }
  return { bin, fixtures, json, server, timelines, cacheDir, updateExclusions };
}

// A grid over the sequence plus every clip edge and transition midpoint, with
// a 1 ms step either side, so boundaries and dissolves are both sampled.
// A grid over the sequence plus, each ±1 ms: every clip edge, every cut's
// end and midpoint, every compiled animation window edge, every keyframe of
// a curve with at most MAX_KEYFRAME_SAMPLES keyframes, and every loop seam
// (at most MAX_LOOP_SEAMS per animation), for each repeater copy's start.
const MAX_KEYFRAME_SAMPLES = 16;
const MAX_LOOP_SEAMS = 24;

function sampleTimes(doc) {
  const times = new Set();
  const around = (t) => {
    times.add(t - 1);
    times.add(t);
    times.add(t + 1);
  };
  for (let t = 0; t <= doc.durationMs; t += GRID_MS) times.add(t);
  const canvas = { width: doc.width, height: doc.height };
  for (const clip of doc.clips) {
    const end = clip.startMs + clip.durationMs;
    around(clip.startMs);
    around(end);
    const tr = clip.transitionIn?.durationMs;
    if (tr && tr > 0) {
      times.add(clip.startMs + tr / 2);
      around(clip.startMs + tr);
    }
    // The auto dissolve ends where the earlier clip on the track ends.
    for (const other of doc.clips) {
      if (other.trackId === clip.trackId && other.startMs < clip.startMs && other.startMs + other.durationMs > clip.startMs) {
        around(Math.min(other.startMs + other.durationMs, end));
      }
    }
    if (!clip.animations?.length) continue;
    let compiled = [];
    try {
      compiled = compileClipAnimations(clip.animations, clip.durationMs, canvas, {});
    } catch {
      compiled = [];
    }
    const repeats = Math.max(1, Math.min(128, Math.floor(clip.repeater?.count ?? 1)));
    const starts = Array.from({ length: Math.min(repeats, 8) }, (_, i) => clip.startMs + i * (clip.repeater?.timeStepMs ?? 0));
    for (const start of starts) {
      for (const anim of compiled) {
        around(start + anim.windowStartMs);
        around(start + anim.windowEndMs);
        const span = anim.windowEndMs - anim.windowStartMs;
        if (anim.loop) {
          const period = anim.periodMs ?? span;
          const origin = anim.loopOriginMs ?? anim.windowStartMs;
          if (period > 0) {
            let k = Math.ceil((anim.windowStartMs - origin) / period);
            for (let n = 0; n < MAX_LOOP_SEAMS; n++, k++) {
              const seam = origin + k * period;
              if (seam > anim.windowEndMs) break;
              around(start + seam);
            }
          }
          continue;
        }
        for (const curve of anim.curves) {
          if (curve.keyframes.length > MAX_KEYFRAME_SAMPLES || anim.timeBase === "source") continue;
          for (const kf of curve.keyframes) around(start + anim.windowStartMs + kf.t * span);
        }
      }
    }
  }
  return [...times].filter((t) => t >= 0 && Number.isFinite(t)).sort((a, b) => a - b);
}

// The web scene for one frame, the way the browser compositors build it
// (compositeLayers.ts): `computeActiveLayersWithHorizon` with the sequence
// canvas, camera, tempo and media tracks, then per layer
// `resolveAnimatedLayerProps` and the placement the frame compositor draws
// with: `transitionTransform` (the cut's offset and scale) and
// `buildTransformMatrix` with `containBaseScale` and the group's matrix. A
// caption composites frame-sized and untransformed.
function oraclePlan(doc, timeMs, cache) {
  const canvas = { width: doc.width, height: doc.height, fps: doc.fps };
  const scene = computeActiveLayersWithHorizon(doc.tracks, doc.clips, timeMs, {
    canvas,
    animationCache: cache,
    camera2d: doc.camera2d ?? null,
    tempo: doc.tempo,
    mediaTracks: doc.mediaTracks ?? []
  });
  const tracking = { mediaTracks: doc.mediaTracks ?? [], clips: doc.clips, tempo: doc.tempo };
  const layers = scene.layers.map((layer, order) => {
    const anim = resolveAnimatedLayerProps(layer, timeMs, canvas, cache, tracking);
    const srcW = layer.clip.width ?? doc.width;
    const srcH = layer.clip.height ?? doc.height;
    const matrix =
      layer.kind === "caption"
        ? buildTransformMatrix(IDENTITY_TRANSFORM, { x: 1, y: 1 }, doc.width, doc.height)
        : buildTransformMatrix(
            transitionTransform(anim.transform, layer.transition, doc.width, doc.height) ?? IDENTITY_TRANSFORM,
            containBaseScale(srcW, srcH, doc.width, doc.height),
            doc.width,
            doc.height,
            layer.parentMatrix
          );
    return {
      clipId: layer.clipId,
      kind: layer.kind,
      z: trackZ(layer.trackIndex),
      opacity: anim.opacity,
      assetId: layer.assetId,
      sourceTimeMs: layer.kind === "video" || layer.kind === "image" ? clipSourceTimeSec(layer.clip, timeMs) * 1000 : null,
      precomposeChain: layer.precomposeGroupId,
      blendMode: layer.blendMode,
      stackOrder: layer.stackOrder,
      precomposeGroupId: layer.precomposeGroupId,
      transition: layer.transition,
      mask: anim.mask,
      transform: anim.transform,
      matrix: [...matrix],
      order
    };
  });
  // The compositors' stable bottom-up sort by z.
  layers.sort((a, b) => a.z - b.z || a.order - b.order);
  // `drawOpacity`: a layer's opacity times every enclosing surface's.
  const surfaceById = new Map(scene.precomposites.map((g) => [g.clipId, g]));
  for (const l of layers) {
    let draw = l.opacity;
    let surface = l.precomposeChain;
    for (let hops = 0; surface && hops < 64; hops++) {
      const g = surfaceById.get(surface);
      if (!g) break;
      draw *= g.opacity;
      surface = g.precomposeGroupId;
    }
    l.drawOpacity = draw;
  }
  const precomposites = scene.precomposites.map((g) => ({
    clipId: g.clipId,
    z: trackZ(g.trackIndex),
    stackOrder: g.stackOrder,
    opacity: g.opacity,
    blendMode: g.blendMode,
    effects: (g.effects ?? []).some((e) => e.enabled),
    precomposeGroupId: g.precomposeGroupId,
    transition: g.transition
  }));
  return { layers, precomposites, dropped: scene.droppedLayers };
}

function compareFixture(bin, fixture) {
  const doc = JSON.parse(fs.readFileSync(fixture, "utf8"));
  return compareDoc(bin, path.relative(process.cwd(), fixture), doc, [fixture]);
}

// Server mode: the document from `timeline.get` and the plan from the native
// client's server open.
async function compareServerTimeline(bin, server, id, cacheDir) {
  const label = `${server} timeline ${id}`;
  // Redirects are refused: a GET must not follow one to another server.
  const r = await fetch(`${server}/trpc/timeline.get?input=${encodeURIComponent(JSON.stringify({ id }))}`, { redirect: "manual" });
  if (r.status >= 300 && r.status < 400) {
    return { fixture: label, times: 0, layersCompared: 0, mismatches: [`timeline.get answered a redirect to ${r.headers.get("location")}`] };
  }
  const body = await r.json();
  if (body.error) return { fixture: label, times: 0, layersCompared: 0, mismatches: [`timeline.get: ${body.error.message}`] };
  const doc = body.result.data;
  const reportDir = fs.mkdtempSync(path.join(cacheDir ?? fs.realpathSync(root), ".plan-report-"));
  const nativeArgs = ["--server", server, "--timeline", id, "--loader-report", path.join(reportDir, "report.json")];
  if (cacheDir) nativeArgs.push("--cache-dir", cacheDir);
  const result = compareDoc(bin, label, doc, nativeArgs);
  fs.rmSync(reportDir, { recursive: true, force: true });
  return result;
}

// The shipped example bundles as sequence documents, written under
// build-m5/plan-examples/ so the native app opens them as files.
function exampleFixtures() {
  const dir = path.resolve(root, "..", "..", "packages", "base-nodes", "nodetool", "examples", "timelines");
  const out = path.join(root, "build-m5", "plan-examples");
  fs.mkdirSync(out, { recursive: true });
  const files = [];
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".timeline.json")).sort()) {
    const bundle = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    const slug = name.slice(0, -".timeline.json".length);
    const doc = {
      id: `example-${slug}`,
      projectId: "examples",
      name: bundle.name,
      fps: bundle.fps,
      width: bundle.width,
      height: bundle.height,
      durationMs: bundle.durationMs,
      ...bundle.document,
      createdAt: "1970-01-01T00:00:00.000Z",
      updatedAt: "1970-01-01T00:00:00.000Z"
    };
    const file = path.join(out, `${slug}.json`);
    fs.writeFileSync(file, JSON.stringify(doc));
    files.push(file);
  }
  return files;
}

const near = (a, b) => Math.abs(a - b) <= TOLERANCE;
const numOrNull = (v) => (typeof v === "number" ? v : null);

/** Differences between two optional numbers, or null. */
function diffNumber(name, web, native) {
  const w = numOrNull(web);
  const n = numOrNull(native);
  if (w === null && n === null) return null;
  if (w === null || n === null || !(Math.abs(w - n) <= TOLERANCE)) return `${name} web ${web} native ${native}`;
  return null;
}

function diffTransform(web, native) {
  if (!web && !native) return [];
  // An absent transform draws as the identity; compare through it.
  const w = web ?? IDENTITY_TRANSFORM;
  const n = native ?? IDENTITY_TRANSFORM;
  const out = [
    diffNumber("transform.position.x", w.position.x, n.position.x),
    diffNumber("transform.position.y", w.position.y, n.position.y),
    diffNumber("transform.scale.x", w.scale.x, n.scale.x),
    diffNumber("transform.scale.y", w.scale.y, n.scale.y),
    diffNumber("transform.rotation", w.rotation, n.rotation),
    diffNumber("transform.anchor.x", w.anchor.x, n.anchor.x),
    diffNumber("transform.anchor.y", w.anchor.y, n.anchor.y),
    diffNumber("transform.rotationX", w.rotationX ?? 0, n.rotationX ?? 0),
    diffNumber("transform.rotationY", w.rotationY ?? 0, n.rotationY ?? 0),
    diffNumber("transform.perspective", w.perspective ?? 0, n.perspective ?? 0),
    diffNumber("transform.depthPx", w.depthPx ?? 0, n.depthPx ?? 0)
  ];
  return out.filter(Boolean);
}

function diffTransition(web, native) {
  if (!web && !native) return [];
  if (!web || !native) return [`transition web ${web ? web.type : "none"} native ${native ? native.type : "none"}`];
  const out = [];
  if (web.type !== native.type || web.role !== native.role) out.push(`transition ${web.type}/${web.role} vs ${native.type}/${native.role}`);
  out.push(diffNumber("transition.progress", web.progress, native.progress));
  out.push(diffNumber("transition.opacity", web.opacity, native.opacity));
  out.push(diffNumber("transition.scale", web.scale, native.scale));
  out.push(diffNumber("transition.offset.x", web.offset?.x, native.offset?.x));
  out.push(diffNumber("transition.offset.y", web.offset?.y, native.offset?.y));
  out.push(diffNumber("transition.mask.progress", web.mask?.progress, native.mask?.progress));
  out.push(diffNumber("transition.mask.softness", web.mask?.softness, native.mask?.softness));
  if ((web.mask?.direction ?? null) !== (native.mask?.direction ?? null)) out.push("transition.mask.direction");
  out.push(diffNumber("transition.solid.opacity", web.solid?.opacity, native.solid?.opacity));
  if ((web.solid?.color ?? null) !== (native.solid?.color ?? null)) out.push("transition.solid.color");
  out.push(diffNumber("transition.iris.progress", web.iris?.progress, native.iris?.progress));
  out.push(diffNumber("transition.iris.softness", web.iris?.softness, native.iris?.softness));
  if (JSON.stringify(canonicalEffect(web.effect)) !== JSON.stringify(canonicalEffect(native.effect))) {
    out.push(`transition.effect web ${JSON.stringify(web.effect)} native ${JSON.stringify(native.effect)}`);
  }
  return out.filter(Boolean);
}

/** An effect object with keys sorted and numbers rounded to the tolerance. */
function canonicalEffect(effect) {
  if (!effect) return null;
  const out = {};
  for (const key of Object.keys(effect).sort()) {
    const v = effect[key];
    out[key] = typeof v === "number" ? Math.round(v / TOLERANCE) * TOLERANCE : v;
  }
  return out;
}

function compareLayer(w, g) {
  const out = [];
  if (w.z !== g.z) out.push(`z web ${w.z} native ${g.z}`);
  if (w.kind !== g.kind) out.push(`kind web ${w.kind} native ${g.kind}`);
  if (!near(w.opacity, g.opacity)) out.push(`opacity web ${w.opacity} native ${g.opacity}`);
  if (!near(w.drawOpacity, g.drawOpacity)) out.push(`drawOpacity web ${w.drawOpacity} native ${g.drawOpacity}`);
  if ((w.assetId ?? null) !== (g.assetId ?? null)) out.push(`assetId web ${w.assetId} native ${g.assetId}`);
  if (w.sourceTimeMs !== null && !near(w.sourceTimeMs, g.sourceTimeMs)) out.push(`sourceTimeMs web ${w.sourceTimeMs} native ${g.sourceTimeMs}`);
  if ((w.blendMode ?? "normal") !== (g.blendMode ?? "normal")) out.push(`blendMode web ${w.blendMode} native ${g.blendMode}`);
  if ((w.stackOrder ?? null) !== (g.stackOrder ?? null)) out.push(`stackOrder web ${w.stackOrder} native ${g.stackOrder}`);
  if ((w.precomposeGroupId ?? "") !== (g.precomposeGroupId ?? "")) {
    out.push(`precomposeGroupId web ${w.precomposeGroupId} native ${g.precomposeGroupId}`);
  }
  for (let k = 0; k < 16; k++) {
    if (!(Math.abs(w.matrix[k] - g.matrix[k]) <= TOLERANCE)) {
      out.push(`matrix[${k}] web ${w.matrix[k]} native ${g.matrix[k]}`);
      break;
    }
  }
  out.push(...diffTransform(w.transform, g.transform));
  out.push(...diffTransition(w.transition, g.transition));
  out.push(...[diffNumber("mask.progress", w.mask?.progress, g.mask?.progress), diffNumber("mask.softness", w.mask?.softness, g.mask?.softness)].filter(Boolean));
  if ((w.mask?.direction ?? null) !== (g.mask?.direction ?? null)) out.push(`mask.direction web ${w.mask?.direction} native ${g.mask?.direction}`);
  return out;
}

function comparePrecomposite(w, g) {
  const out = [];
  if (w.z !== g.z) out.push(`z web ${w.z} native ${g.z}`);
  if ((w.stackOrder ?? null) !== (g.stackOrder ?? null)) out.push(`stackOrder web ${w.stackOrder} native ${g.stackOrder}`);
  if (!near(w.opacity, g.opacity)) out.push(`opacity web ${w.opacity} native ${g.opacity}`);
  if (w.blendMode !== g.blendMode) out.push(`blendMode web ${w.blendMode} native ${g.blendMode}`);
  if (w.effects !== g.effects) out.push(`effects web ${w.effects} native ${g.effects}`);
  if ((w.precomposeGroupId ?? "") !== (g.precomposeGroupId ?? "")) out.push("precomposeGroupId");
  out.push(...diffTransition(w.transition, g.transition));
  return out;
}

// ── the exclusion baseline (fixtures/plan/exclusions.json) ───────────────
// { "<sequence name>": { "<clip id>": ["<field>", ...] } }. A document absent
// from the file must exclude nothing.
const BASELINE_FILE = path.join(root, "fixtures", "plan", "exclusions.json");
const baseline = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8")) : {};
const observed = {};

function compareBaseline(name, fields) {
  observed[name] = fields;
  const want = baseline[name] ?? {};
  const out = [];
  for (const id of new Set([...Object.keys(want), ...Object.keys(fields)])) {
    const a = JSON.stringify([...(want[id] ?? [])].sort());
    const b = JSON.stringify([...(fields[id] ?? [])].sort());
    if (a !== b) out.push(`exclusion baseline: ${id} expected ${a} native ${b}`);
  }
  return out.slice(0, 20);
}

// An independent check of the main exclusion reason: the clips under a flex
// container, computed here from the document, are exactly the ones native
// excludes with `flexLayout`.
function checkFlexReason(doc, fields) {
  const byId = new Map(doc.clips.map((c) => [c.id, c]));
  const inFlex = (clip) => {
    let cursor = clip.parentId ? byId.get(clip.parentId) : undefined;
    for (let hops = 0; cursor && hops < 64; hops++) {
      if (cursor.layout?.display === "flex") return true;
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    return false;
  };
  const out = [];
  for (const clip of doc.clips) {
    const native = (fields[clip.id] ?? []).includes("flexLayout");
    if (inFlex(clip) !== native) out.push(`flex exclusion: ${clip.id} in a flex tree ${inFlex(clip)}, native ${native}`);
  }
  return out.slice(0, 10);
}

function compareDoc(bin, label, doc, nativeArgs) {
  const parsed = timelineSequenceResponse.safeParse(doc);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `schema: ${issue.path.join(".")}: ${issue.message}`);
    return { fixture: label, times: 0, layersCompared: 0, mismatches: issues };
  }
  const times = sampleTimes(doc);
  const out = execFileSync(bin, [...nativeArgs, "--dump-plan", "--times", times.join(",")], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const native = JSON.parse(out);
  // The native loader report's plan-level unsupported clips, left out on
  // both sides. A layer the web derives from a clip (a repeater copy,
  // `<id>:repeat:<n>`, or an echo) goes with its clip.
  const excluded = new Set(native.planUnsupported ?? []);
  // The exclusions must match the checked-in baseline (fixtures/plan/exclusions.json):
  // a clip that newly drops out, or a changed reason, fails the run.
  const baselineDiff = [
    ...compareBaseline(doc.name, native.planUnsupportedFields ?? {}),
    ...checkFlexReason(doc, native.planUnsupportedFields ?? {})
  ];
  const keep = (id) => !excluded.has(id) && !excluded.has(id.split(":")[0]);
  const mismatches = [...baselineDiff];
  let layersCompared = 0;
  let precompositesCompared = 0;
  if (!Array.isArray(native.frames) || native.frames.length !== times.length) {
    mismatches.push(`native returned ${native.frames?.length ?? "no"} frames for ${times.length} times`);
    return { fixture: label, times: times.length, layersCompared, mismatches };
  }
  const cache = createAnimationCompileCache();
  native.frames.forEach((frame, i) => {
    const t = times[i];
    // Validate before comparing: NaN or a missing value compares as "not
    // over tolerance", so a malformed layer would otherwise count as a match.
    if (!isFiniteNumber(frame.timeMs) || Math.abs(frame.timeMs - t) > TOLERANCE) {
      mismatches.push(`frame ${i}: native timeMs ${frame.timeMs}, requested ${t}`);
      return;
    }
    if (!Array.isArray(frame.layers) || !Array.isArray(frame.precomposites) || !Array.isArray(frame.dropped)) {
      mismatches.push(`t=${t}: native layers, precomposites or dropped is not an array`);
      return;
    }
    const web = oraclePlan(doc, t, cache);
    const want = web.layers.filter((l) => keep(l.clipId));
    const got = frame.layers.filter((l) => keep(l.clipId));
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
      const diffs = compareLayer(w, g);
      if (diffs.length > 0) mismatches.push(`t=${t} ${w.clipId}: ${diffs.slice(0, 3).join("; ")}`);
      else layersCompared++;
    });
    const wantGroups = web.precomposites.filter((g) => keep(g.clipId));
    const gotGroups = frame.precomposites.filter((g) => keep(g.clipId));
    const wantGroupIds = wantGroups.map((g) => g.clipId).join(",");
    const gotGroupIds = gotGroups.map((g) => g.clipId).join(",");
    if (wantGroupIds !== gotGroupIds) {
      mismatches.push(`t=${t}: precomposites web [${wantGroupIds}] native [${gotGroupIds}]`);
    } else {
      wantGroups.forEach((w, j) => {
        const diffs = comparePrecomposite(w, gotGroups[j]);
        if (diffs.length > 0) mismatches.push(`t=${t} precomposite ${w.clipId}: ${diffs.slice(0, 3).join("; ")}`);
        else precompositesCompared++;
      });
    }
    const wantDropped = web.dropped.filter((d) => keep(d.clipId)).map((d) => `${d.clipId}:${d.reason}`).join(",");
    const gotDropped = frame.dropped.filter((d) => keep(d.clipId)).map((d) => `${d.clipId}:${d.reason}`).join(",");
    if (wantDropped !== gotDropped) mismatches.push(`t=${t}: dropped web [${wantDropped}] native [${gotDropped}]`);
  });
  return { fixture: label, times: times.length, layersCompared, precompositesCompared, excludedClips: excluded.size, mismatches };
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

const { bin, fixtures, json, server, timelines, cacheDir, updateExclusions } = parseArgs(process.argv.slice(2));
const results = fixtures.map((fixture) => compareFixture(bin, fixture));
for (const id of server ? timelines : []) results.push(await compareServerTimeline(bin, server, id, cacheDir));
if (updateExclusions) {
  // Records what native excludes now for every document of this run.
  const next = { ...baseline };
  for (const [name, fields] of Object.entries(observed)) {
    if (Object.keys(fields).length > 0) next[name] = fields;
    else delete next[name];
  }
  fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(next, null, 2)}\n`);
}
const layersCompared = results.reduce((n, r) => n + r.layersCompared, 0);
// A server timeline whose every visual clip has a plan-level unsupported
// field has nothing to compare. It is reported as "empty", not as a pass, and
// the run still needs at least one compared layer overall.
const isEmpty = (r) => r.layersCompared === 0 && r.mismatches.length === 0 && (r.excludedClips ?? 0) > 0;
const failures = results.flatMap((r) => [
  ...r.mismatches.map((m) => `${r.fixture}: ${m}`),
  ...(r.layersCompared === 0 && !isEmpty(r) ? [`${r.fixture}: compared 0 layers`] : [])
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
        precompositesCompared: r.precompositesCompared ?? 0,
        excludedClips: r.excludedClips ?? 0,
        verdict: isEmpty(r) ? "empty" : r.mismatches.length === 0 && r.layersCompared > 0 ? "pass" : "fail",
        mismatches: r.mismatches
      }))
    })
  );
} else {
  for (const r of results) {
    const left = r.excludedClips ? `, ${r.excludedClips} clips left out (plan-level unsupported fields)` : "";
    console.log(`${r.fixture}: ${r.times} times, ${r.layersCompared} layers compared, ${r.mismatches.length} mismatches${left}`);
    for (const m of r.mismatches.slice(0, 20)) console.log(`  ${m}`);
    if (r.mismatches.length > 20) console.log(`  ... ${r.mismatches.length - 20} more`);
    if (isEmpty(r)) console.log("  EMPTY: no clip without a plan-level unsupported field");
    else if (r.layersCompared === 0) console.log("  FAIL: compared 0 layers");
  }
  console.log(pass ? `PASS: ${layersCompared} layers match` : `FAIL: ${failures.length} failures`);
}
process.exit(pass ? 0 : 1);
