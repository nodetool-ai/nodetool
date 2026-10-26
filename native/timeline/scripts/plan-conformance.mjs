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
// is compared for video and image layers only.
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
import { fileURLToPath, pathToFileURL } from "node:url";

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

import { TOLERANCE, auditExclusions, checkFlexReasons, diffNumber, exclusionsFrom, near, newestBinary, orZero, staleSources } from "./plan-compare.mjs";
const GRID_MS = 100;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const comparators = [];
const comparatorProblems = [];
const comparatorDirectory = path.join(root, "scripts/conformance/plan");
if (fs.existsSync(comparatorDirectory)) {
  for (const name of fs.readdirSync(comparatorDirectory).filter((n) => n.endsWith(".mjs")).sort()) {
    try {
      const { default: comparator } = await import(pathToFileURL(path.join(comparatorDirectory, name)).href);
      if (!comparator || !["layer", "precomposite", "frame"].some((key) => typeof comparator[key] === "function")) {
        throw new Error("expected a layer, precomposite or frame comparator");
      }
      comparators.push({ name, comparator });
    } catch (error) {
      comparatorProblems.push(`${name}: comparator failed to load: ${error.message}`);
    }
  }
}

function extraComparisons(kind, context) {
  const out = [];
  for (const { name, comparator } of comparators) {
    if (!comparator[kind]) continue;
    try {
      const diffs = comparator[kind](context);
      if (!Array.isArray(diffs) || diffs.some((diff) => typeof diff !== "string")) {
        throw new Error("expected an array of mismatch strings");
      }
      out.push(...diffs.map((diff) => `${name}: ${diff}`));
    } catch (error) {
      out.push(`${name}: ${kind} comparator failed: ${error.message}`);
    }
  }
  return out;
}

function parseArgs(argv) {
  let bin = null;  // default: the newest build (newestBinary)
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
  bin = bin ? path.resolve(bin) : newestBinary(root);
  if (!bin) {
    console.error(`error: no build*/nodetool-timeline under ${root}; build one or pass --bin`);
    process.exit(2);
  }
  // A binary older than the code it is meant to check compares old code.
  const stale = staleSources(root, bin);
  if (stale.length > 0) {
    console.error(`error: ${path.relative(process.cwd(), bin)} is older than ${stale.length} source file(s), newest ` +
      `${path.relative(process.cwd(), stale[0])}; rebuild it, or pass --bin with a current build`);
    process.exit(2);
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
  const docClipById = new Map(doc.clips.map((c) => [c.id, c]));
  const layers = scene.layers.map((layer, order) => {
    // A flex group resized the drawn clip: its styles are new objects.
    const docClip = docClipById.get(layer.clipId.split(":")[0]);
    const shape = layer.clip.shapeStyle;
    const flexShapeBox =
      shape && docClip && shape !== docClip.shapeStyle ? [shape.x, shape.y, shape.width, shape.height] : undefined;
    const textStyle = layer.clip.textStyle;
    const flexTextMaxWidthFrac = textStyle && docClip && textStyle !== docClip.textStyle ? textStyle.maxWidthFrac : undefined;
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
      flexShapeBox,
      flexTextMaxWidthFrac,
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
  // What draws into each surface: its layers in frame order, then its nested
  // surfaces in list order.
  for (const g of precomposites) {
    g.children = [
      ...layers.filter((l) => l.precomposeChain === g.clipId).map((l) => l.clipId),
      ...precomposites.filter((p) => p.precomposeGroupId === g.clipId).map((p) => p.clipId)
    ];
  }
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
    diffNumber("transform.rotationX", orZero(w.rotationX), orZero(n.rotationX)),
    diffNumber("transform.rotationY", orZero(w.rotationY), orZero(n.rotationY)),
    diffNumber("transform.perspective", orZero(w.perspective), orZero(n.perspective)),
    diffNumber("transform.depthPx", orZero(w.depthPx), orZero(n.depthPx))
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
  // A layer without source media (web null) has no source time to compare.
  if (w.sourceTimeMs !== null && !near(w.sourceTimeMs, g.sourceTimeMs)) out.push(`sourceTimeMs web ${w.sourceTimeMs} native ${g.sourceTimeMs}`);
  if ((w.blendMode ?? "normal") !== (g.blendMode ?? "normal")) out.push(`blendMode web ${w.blendMode} native ${g.blendMode}`);
  if ((w.stackOrder ?? null) !== (g.stackOrder ?? null)) out.push(`stackOrder web ${w.stackOrder} native ${g.stackOrder}`);
  if ((w.precomposeGroupId ?? "") !== (g.precomposeGroupId ?? "")) {
    out.push(`precomposeGroupId web ${w.precomposeGroupId} native ${g.precomposeGroupId}`);
  }
  for (let k = 0; k < 16; k++) {
    if (!near(w.matrix?.[k], g.matrix?.[k])) {
      out.push(`matrix[${k}] web ${w.matrix[k]} native ${g.matrix[k]}`);
      break;
    }
  }
  out.push(...diffTransform(w.transform, g.transform));
  for (let k = 0; k < 4; k++) {
    const d = diffNumber(`flexShapeBox[${k}]`, w.flexShapeBox?.[k], g.flexShapeBox?.[k]);
    if (d) out.push(d);
  }
  const flexText = diffNumber("flexTextMaxWidthFrac", w.flexTextMaxWidthFrac, g.flexTextMaxWidthFrac);
  if (flexText) out.push(flexText);
  out.push(...diffTransition(w.transition, g.transition));
  out.push(...[diffNumber("mask.progress", w.mask?.progress, g.mask?.progress), diffNumber("mask.softness", w.mask?.softness, g.mask?.softness)].filter(Boolean));
  if ((w.mask?.direction ?? null) !== (g.mask?.direction ?? null)) out.push(`mask.direction web ${w.mask?.direction} native ${g.mask?.direction}`);
  return out;
}

let keepId = () => true;  // set per document by compareDoc

function comparePrecomposite(w, g) {
  const out = [];
  if (w.z !== g.z) out.push(`z web ${w.z} native ${g.z}`);
  if ((w.stackOrder ?? null) !== (g.stackOrder ?? null)) out.push(`stackOrder web ${w.stackOrder} native ${g.stackOrder}`);
  if (!near(w.opacity, g.opacity)) out.push(`opacity web ${w.opacity} native ${g.opacity}`);
  if (w.blendMode !== g.blendMode) out.push(`blendMode web ${w.blendMode} native ${g.blendMode}`);
  if (w.effects !== g.effects) out.push(`effects web ${w.effects} native ${g.effects}`);
  if ((w.precomposeGroupId ?? "") !== (g.precomposeGroupId ?? "")) out.push("precomposeGroupId");
  const kids = (list) => (list ?? []).filter((id) => keepId(id)).join(",");
  if (kids(w.children) !== kids(g.children)) out.push(`children web [${kids(w.children)}] native [${kids(g.children)}]`);
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

function compareDoc(bin, label, doc, nativeArgs) {
  const parsed = timelineSequenceResponse.safeParse(doc);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `schema: ${issue.path.join(".")}: ${issue.message}`);
    return { fixture: label, times: 0, layersCompared: 0, mismatches: issues };
  }
  const times = sampleTimes(doc);
  const clipsById = new Map(doc.clips.map((clip) => [clip.id, clip]));
  const out = execFileSync(bin, [...nativeArgs, "--dump-plan", "--times", times.join(",")], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const native = JSON.parse(out);
  // The native loader report's plan-level unsupported clips, left out on
  // both sides. A layer the web derives from a clip (a repeater copy,
  // `<id>:repeat:<n>`, or an echo) goes with its clip.
  // F6: derived from validated reasons; both native lists must agree.
  const { excluded, errors: exclusionErrors } = exclusionsFrom(native);
  // The exclusions must match the checked-in baseline (fixtures/plan/exclusions.json):
  // a clip that newly drops out, or a changed reason, fails the run.
  const baselineDiff = [
    ...compareBaseline(doc.name, native.planUnsupportedFields ?? {}),
    // Flex is ported: a flex reason fails the run.
    ...checkFlexReasons(native.planUnsupportedFields ?? {})
  ];
  // A clip excluded only for a reason the oracle matches by construction is
  // compared as usual (its fallback plan); only its stale check is waived,
  // and what the oracle cannot check is reported as unverified.
  const fields = native.planUnsupportedFields ?? {};
  const waived = [...excluded].filter((id) => (fields[id] ?? []).every((r) => MATCHES_WITHOUT_MEASURER.has(r)));
  for (const id of waived) excluded.delete(id);
  const unverified = waived.map((id) => ({ clipId: id, reasons: fields[id], unverified: "line wrapping by measured text width" }));
  const keep = (id) => !excluded.has(id) && !excluded.has(id.split(":")[0]);
  keepId = keep;
  const mismatches = [...exclusionErrors, ...baselineDiff];
  let layersCompared = 0;
  let precompositesCompared = 0;
  if (!Array.isArray(native.frames) || native.frames.length !== times.length) {
    mismatches.push(`native returned ${native.frames?.length ?? "no"} frames for ${times.length} times`);
    return { fixture: label, times: times.length, layersCompared, mismatches };
  }
  const cache = createAnimationCompileCache();
  // Per excluded clip, its layers compared anyway: one that matches in every
  // frame it draws has a stale exclusion, and fails the run.
  const excludedTally = new Map();
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
    tallyExcluded(web.layers.filter((l) => !keep(l.clipId)), frame.layers.filter((l) => !keep(l.clipId)), excludedTally,
      (w, g) => invalidLayer(g) || compareLayer(w, g).length > 0);
    tallyExcluded(web.precomposites.filter((g) => !keep(g.clipId)), frame.precomposites.filter((g) => !keep(g.clipId)),
      excludedTally, (w, g) => comparePrecomposite(w, g).length > 0);
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
      const diffs = [...compareLayer(w, g), ...extraComparisons("layer", {
        web: w, native: g, document: doc, timeMs: t,
        clip: clipsById.get(w.clipId) ?? clipsById.get(w.clipId.split(":")[0])
      })];
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
        const diffs = [...comparePrecomposite(w, gotGroups[j]), ...extraComparisons("precomposite", {
          web: w, native: gotGroups[j], document: doc, timeMs: t,
          clip: clipsById.get(w.clipId)
        })];
        if (diffs.length > 0) mismatches.push(`t=${t} precomposite ${w.clipId}: ${diffs.slice(0, 3).join("; ")}`);
        else precompositesCompared++;
      });
    }
    const wantDropped = web.dropped.filter((d) => keep(d.clipId)).map((d) => `${d.clipId}:${d.reason}`).join(",");
    const gotDropped = frame.dropped.filter((d) => keep(d.clipId)).map((d) => `${d.clipId}:${d.reason}`).join(",");
    if (wantDropped !== gotDropped) mismatches.push(`t=${t}: dropped web [${wantDropped}] native [${gotDropped}]`);
    mismatches.push(...extraComparisons("frame", { web, native: frame, document: doc, timeMs: t })
      .map((diff) => `t=${t}: ${diff}`));
  });
  // Every excluded id, judged by its own and its descendants' layers and
  // surfaces; an id with nothing to compare is reported as uncovered.
  const audit = auditExclusions(doc.clips, [...excluded], excludedTally, fields, () => true);
  mismatches.push(...audit.stale);
  return {
    fixture: label,
    times: times.length,
    layersCompared,
    precompositesCompared,
    excludedClips: excluded.size,
    exclusionAudit: { audited: audit.audited, uncovered: audit.uncovered },
    unverified,
    mismatches
  };
}

// Reasons the stale check skips: the oracle has no text measurer, so a
// `"line"` stagger counts explicit line breaks on both sides and matches by
// construction, while the browser wraps by measured width.
const MATCHES_WITHOUT_MEASURER = new Set(["animations.stagger.unit=line"]);

/**
 * Counts, per base clip id, the excluded layers (or surfaces) that match the
 * web and the ones that do not; one on one side only is a mismatch.
 */
function tallyExcluded(want, got, tally, differs) {
  const entry = (id) => {
    const base = id.split(":")[0];
    if (!tally.has(base)) tally.set(base, { compared: 0, mismatched: 0 });
    return tally.get(base);
  };
  const gotById = new Map();
  for (const g of got) {
    if (!gotById.has(g.clipId)) gotById.set(g.clipId, []);
    gotById.get(g.clipId).push(g);
  }
  for (const w of want) {
    const g = gotById.get(w.clipId)?.shift();
    const e = entry(w.clipId);
    if (!g || differs(w, g)) e.mismatched++;
    else e.compared++;
  }
  for (const rest of gotById.values()) for (const g of rest) entry(g.clipId).mismatched++;
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
failures.push(...comparatorProblems);
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
        exclusionAudit: r.exclusionAudit ?? null,
        unverified: r.unverified ?? [],
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
    const audit = r.exclusionAudit;
    if (audit && audit.audited > 0) {
      const none = audit.uncovered.length ? `; no coverage (nothing drawn at the sampled times): ${audit.uncovered.join(", ")}` : "";
      console.log(`  exclusions audited: ${audit.audited}${none}`);
    }
    for (const u of r.unverified ?? []) console.log(`  unverified: ${u.clipId} (${u.reasons.join(", ")}): ${u.unverified}`);
    if (isEmpty(r)) console.log("  EMPTY: no clip without a plan-level unsupported field");
    else if (r.layersCompared === 0) console.log("  FAIL: compared 0 layers");
  }
  console.log(pass ? `PASS: ${layersCompared} layers match` : `FAIL: ${failures.length} failures`);
}
process.exit(pass ? 0 : 1);
