#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { computeActiveLayersWithHorizon, resolveAnimatedLayerProps, createAnimationCompileCache } from "@nodetool-ai/timeline/scene";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repo = path.resolve(root, "../..");
const visual = new Set(["text", "shape", "caption"]);
const videoEffects = new Set(["colorCorrection", "videoBlur", "sharpen", "vignette", "chromaKey"]);
const omitted = new Set(["video", "image", "audio", "model3d", "adjustment"]);

export function comparisonDocument(bundle, slug) {
  const document = structuredClone({
    id: `example-${slug}`, projectId: "examples", name: bundle.name,
    fps: bundle.fps, width: bundle.width, height: bundle.height, durationMs: bundle.durationMs,
    ...bundle.document, createdAt: "1970-01-01T00:00:00.000Z", updatedAt: "1970-01-01T00:00:00.000Z"
  });
  const removed = [];
  // A source referenced by a valid matte never draws onto the original
  // frame, even when its consumer is omitted media. Preserve that meaning
  // after stripping the consumer or its matte field.
  const matteSources = new Set(document.clips
    .filter((clip) => ["alpha", "luma"].includes(clip.matte?.mode))
    .map((clip) => clip.matte.sourceClipId));
  document.clips = document.clips.filter((clip) => {
    if (matteSources.has(clip.id)) {
      removed.push(`${clip.id}: clip (matte source removed with matte)`);
      return false;
    }
    if (!omitted.has(clip.mediaType)) return true;
    removed.push(`${clip.id}: clip (${clip.mediaType})`);
    return false;
  });
  for (const clip of document.clips) {
    for (const field of ["effects", "blendMode", "matte", "mask"]) {
      if (field in clip) { removed.push(`${clip.id}.${field}`); delete clip[field]; }
    }
  }
  for (const track of document.tracks) {
    if (Array.isArray(track.effects)) {
      const keep = track.effects.filter((effect) => {
        if (!videoEffects.has(effect.type)) return true;
        removed.push(`track ${track.id}.effects:${effect.id ?? effect.type}`);
        return false;
      });
      if (keep.length !== track.effects.length) {
        if (keep.length) track.effects = keep;
        else delete track.effects;
      }
    }
  }
  return { document, removed };
}

function jsonOutput(output) {
  if (!output.trim()) throw new Error("server render returned no JSON report");
  return JSON.parse(output.slice(output.indexOf("{")));
}

// Use the same scene-model entry points and inputs as plan-conformance.mjs.
// Keep effect payloads here: the plan comparator intentionally omits them.
export function frameEligibility(document, timeMs, exclusions = {}, cache = createAnimationCompileCache()) {
  const canvas = { width: document.width, height: document.height, fps: document.fps };
  const scene = computeActiveLayersWithHorizon(document.tracks, document.clips, timeMs, {
    canvas, animationCache: cache, camera2d: document.camera2d ?? null,
    tempo: document.tempo, mediaTracks: document.mediaTracks ?? []
  });
  const tracking = { clips: document.clips, tempo: document.tempo, mediaTracks: document.mediaTracks ?? [] };
  const clips = new Map(document.clips.map((clip) => [clip.id, clip]));
  const reasons = new Map();
  const add = (reason, clipId, detail) => {
    const key = `${reason}:${clipId}:${detail ?? ""}`;
    reasons.set(key, { reason, clipId, ...(detail ? { detail } : {}) });
  };
  if (!scene.layers.some((layer) => visual.has(layer.kind))) add("no-I-layer", null);
  const inspect = (id, props, transition) => {
    for (const effect of props.effects ?? []) {
      if (effect.enabled) add(`effect:${effect.id ?? effect.type}`, id, effect.type);
    }
    if (props.mask || props.clipMask || transition?.mask || transition?.iris) add("mask", id);
    if (transition?.effect) add("transition-effect", id, transition.type);
    if (transition?.solid) add("transition-solid", id, transition.type);
    const visited = new Set();
    for (let current = id; current && !visited.has(current);) {
      visited.add(current);
      const base = current.split(":repeat:")[0];
      for (const candidate of new Set([current, base])) {
        for (const field of exclusions[candidate] ?? []) add(`plan-exclusion:${field}`, id, candidate);
      }
      current = clips.get(base)?.parentId;
    }
  };
  for (const layer of scene.layers) {
    inspect(layer.clipId, resolveAnimatedLayerProps(layer, timeMs, canvas, cache, tracking), layer.transition);
  }
  for (const group of scene.precomposites) inspect(group.clipId, group, group.transition);
  return [...reasons.values()];
}

export function eligibleCandidates(document, candidates, exclusions = {}) {
  const cache = createAnimationCompileCache();
  const report = { candidates: candidates.length, eligible: [], excluded: [], reasons: {} };
  for (const frame of candidates) {
    const reasons = frameEligibility(document, frame * 1000 / document.fps, exclusions, cache);
    if (!reasons.length) { report.eligible.push(frame); continue; }
    report.excluded.push({ frame, reasons });
    for (const reason of new Set(reasons.map((entry) => entry.reason))) {
      const count = report.reasons[reason] ??= { count: 0, frames: [] };
      count.count++;
      if (count.frames.length < 6) count.frames.push(frame);
    }
  }
  return report;
}

export function spreadFrames(eligible, name) {
  if (eligible.length < 6) throw new Error(`${name}: only ${eligible.length} eligible frames, need 6`);
  return Array.from({ length: 6 }, (_, i) => eligible[Math.floor((i + 0.5) * eligible.length / 6)]);
}

export function pickFrames(document, file, bin, report = {}) {
  const total = Math.ceil(document.durationMs * document.fps / 1000);
  const candidates = [...new Set(Array.from({ length: Math.min(120, total) }, (_, i) =>
    Math.min(total - 1, Math.floor((i + 0.5) * total / Math.min(120, total)))))];
  const baseline = JSON.parse(fs.readFileSync(path.join(root, "fixtures/plan/exclusions.json"), "utf8"));
  Object.assign(report, eligibleCandidates(document, candidates, baseline[document.name] ?? {}));
  console.error(`${document.name}: excluded ${report.excluded.length}/${candidates.length} candidates`);
  for (const [reason, entry] of Object.entries(report.reasons)) {
    console.error(`  ${reason}: ${entry.count}, first frames ${entry.frames.join(", ")}`);
  }
  const frames = spreadFrames(report.eligible, document.name);
  // Verify the selected oracle frames also contain an I layer in native's
  // headless plan. Never silently substitute a frame after a plan failure.
  const output = execFileSync(bin, [file, "--dump-plan", "--times", frames.map((f) => f * 1000 / document.fps).join(",")],
    { timeout: 30000, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, QT_QPA_PLATFORM: "offscreen" }, maxBuffer: 64 * 1024 * 1024 });
  const plans = JSON.parse(output).frames;
  if (plans.length !== frames.length || plans.some((plan) => !plan.layers.some((layer) => visual.has(layer.kind)))) {
    throw new Error(`${document.name}: selected oracle frames lack native text/shapes/captions`);
  }
  return frames;
}

export function measure(a, b) {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-i", a, "-i", b, "-lavfi",
    "[0:v]format=rgb24[a];[1:v]format=rgb24[b];[a][b]psnr", "-f", "null", "-"], { timeout: 30000, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error || result.status !== 0) throw new Error(`ffmpeg failed: ${result.error ?? result.stderr}`);
  const match = /average:(inf|[0-9.]+)/.exec(result.stderr);
  if (!match) throw new Error(`no PSNR for ${a}`);
  return match[1] === "inf" ? Infinity : Number(match[1]);
}

export function comparePairs(frames, server, native, minPsnr) {
  const pairs = frames.map((frame) => {
    const png = `frame_${String(frame).padStart(6, "0")}.png`;
    const a = path.join(server,png), b = path.join(native,png);
    if (!fs.existsSync(a) || !fs.existsSync(b)) return { frame, pass: false, error: "missing still" };
    const value = measure(a,b);
    return { frame, psnr: Number.isFinite(value) ? value : "inf", pass: value >= minPsnr };
  });
  return { pairs, pass: pairs.length > 0 && pairs.every((pair) => pair.pass) };
}

export function main(argv) {
  const args = { bin: path.join(root, "build/nodetool-timeline"), minPsnr: 35, examples: null, json: false, stage: "compare" };
  for (let i = 0; i < argv.length; ++i) {
    const arg = argv[i];
    if (arg === "--bin") args.bin = path.resolve(argv[++i]);
    else if (arg === "--min-psnr") args.minPsnr = Number(argv[++i]);
    else if (arg === "--examples") args.examples = argv[++i].split(",");
    else if (arg === "--json") args.json = true;
    else if (arg === "--stage") args.stage = argv[++i];
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!Number.isFinite(args.minPsnr) || !["prepare", "server", "compare"].includes(args.stage)) throw new Error("invalid threshold or stage");
  const runs = path.join(root, "build/render2d-stills");
  fs.mkdirSync(runs, { recursive: true });
  const run = fs.mkdtempSync(path.join(runs, "run-"));
  const home = path.join(run, "home"); fs.mkdirSync(home);
  const dir = path.join(repo, "packages/base-nodes/nodetool/examples/timelines");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".timeline.json")).sort();
  const selected = files.filter((f) => !args.examples || args.examples.includes(f.slice(0, -".timeline.json".length)));
  if (!selected.length || args.examples?.some((s) => !files.includes(`${s}.timeline.json`))) throw new Error("unknown or empty examples selection");
  const results = [];
  for (const name of selected) {
    const slug = name.slice(0, -".timeline.json".length);
    const result = { example: slug, removed: [], frames: [], pairs: [], pass: false };
    results.push(result);
    try {
      const { document, removed } = comparisonDocument(JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")), slug);
      const out = path.join(run, slug); fs.mkdirSync(out);
      const file = path.join(out, "comparison.json"); fs.writeFileSync(file, JSON.stringify(document));
      console.error(`${slug}: removed ${removed.length ? removed.join(", ") : "nothing"}`);
      result.coverage = {};
      const frames = pickFrames(document, file, args.bin, result.coverage);
      Object.assign(result, { removed, frames });
      if (args.stage === "prepare") continue;
      const server = path.join(out, "server");
      const stdoutFile = path.join(out, "server.json"), stderrFile = path.join(out, "server.log");
      const stdoutFd = fs.openSync(stdoutFile,"w"), stderrFd = fs.openSync(stderrFile,"w");
      let rendered;
      try { rendered = spawnSync(process.execPath, [path.join(repo, "packages/cli/dist/nodetool.js"), "timeline", "render", file,
        "--stills", "--frames", frames.join(","), "--out", server, "--json"],
      { timeout: 180000, stdio: ["ignore", stdoutFd, stderrFd], env: { ...process.env, HOME: home, DB_PATH: path.join(home, "nodetool.sqlite3"), ASSET_FOLDER: path.join(home, "assets"), QT_QPA_PLATFORM: "offscreen" } }); }
      finally { fs.closeSync(stdoutFd); fs.closeSync(stderrFd); }
      if (rendered.error || rendered.status !== 0) throw new Error(`${slug}: server render failed: ${rendered.error ?? fs.readFileSync(stderrFile,"utf8")} (${out})`);
      const report = jsonOutput(fs.readFileSync(stdoutFile,"utf8"));
      if (!Array.isArray(report.skippedClips) || !Array.isArray(report.fontsUnavailable) || report.skippedClips.length || report.fontsUnavailable.length) {
        throw new Error(`${slug}: skippedClips/fontsUnavailable: ${JSON.stringify(report)}`);
      }
      for (const frame of frames) {
        const png = `frame_${String(frame).padStart(6,"0")}.png`;
        if (!fs.existsSync(path.join(server,png))) throw new Error(`${slug}: server still missing: ${png}`);
      }
      result.serverReport = report;
      if (args.stage === "server") continue;
      const native = path.join(out, "native");
      execFileSync(args.bin, [file, "--stills", native, "--still-frames", frames.join(",")],
        { timeout: 180000, env: { ...process.env }, stdio: ["ignore", "ignore", "pipe"] });
      Object.assign(result,comparePairs(frames,server,native,args.minPsnr));
      if (!result.pass) {
        const plan = JSON.parse(execFileSync(args.bin,[file,"--dump-plan","--times",frames.map((f) => f*1000/document.fps).join(",")],
          { encoding:"utf8", stdio:["ignore","pipe","pipe"], env:{...process.env,QT_QPA_PLATFORM:"offscreen"}, maxBuffer:64*1024*1024 }));
        for (const pair of result.pairs.filter((p) => !p.pass)) {
          pair.clips = plan.frames[frames.indexOf(pair.frame)].layers.map((layer) => ({clipId:layer.clipId,kind:layer.kind}));
          console.error(`${slug} frame ${pair.frame}: ${pair.psnr ?? "missing"} dB, clips: ${pair.clips.map((c) => c.clipId).join(", ")}`);
        }
      }
    } catch (error) {
      result.error = error.message;
      console.error(`${slug}: ${result.error}`);
    }
  }
  const gaps = { run, examples: results.map((result) => ({ example: result.example, ...result.coverage })) };
  fs.writeFileSync(path.join(run, "excluded.json"), JSON.stringify(gaps, null, 2) + "\n");
  fs.writeFileSync(path.join(runs, "excluded.json"), JSON.stringify(gaps, null, 2) + "\n");
  const pass = args.stage === "compare" && results.length > 0 && results.every((r) => r.pass);
  if (args.json) console.log(JSON.stringify({ stage: args.stage, run, minPsnr: args.minPsnr, pass, results }));
  else {
    console.log("example\tframe\tPSNR dB\tresult");
    for (const r of results) {
      if (r.error) console.log(`${r.example}\t-\t-\tFAIL: ${r.error}`);
      for (const p of r.pairs) console.log(`${r.example}\t${p.frame}\t${p.psnr ?? "missing"}\t${p.pass ? "PASS" : "FAIL"}`);
    }
    console.log(`${args.stage}: ${pass ? "PASS" : args.stage === "compare" ? "FAIL" : "prepared"} (${run})`);
  }
  return results.some((r) => r.error) || (args.stage === "compare" && !pass) ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
