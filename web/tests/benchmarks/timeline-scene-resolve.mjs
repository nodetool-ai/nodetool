#!/usr/bin/env node
/**
 * Time the per-frame scene work the editor preview does on every played
 * frame, over every shipped example timeline: resolving active layers, sampling
 * their animation, and the animation check that keeps the render loop running.
 * No browser and no GPU, so the numbers isolate the scene model.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createCanvas } from "@napi-rs/canvas";

const repoRoot = resolve(import.meta.dirname, "../../..");
const scene = process.env.TIMELINE_SCENE_MODULE
  ? await import(pathToFileURL(resolve(process.env.TIMELINE_SCENE_MODULE)).href)
  : await import("../../../packages/timeline/src/scene.ts");
const { registerBundledFonts } = await import("../../../packages/timeline/src/fonts/register-node.ts");
const {
  computeActiveLayersWithHorizon,
  createAnimationCompileCache,
  hasActiveAnimation,
  measureTextWith,
  resolveAnimatedLayerProps
} = scene;

const examplesDir = join(repoRoot, "packages/base-nodes/nodetool/examples/timelines");
const reportDir = process.env.TIMELINE_PERF_REPORT_DIR ?? join(tmpdir(), "nodetool-timeline-perf-reports");
const FPS = Number(process.env.TIMELINE_SCENE_FPS ?? 30);
// The first pass fills every per-document cache; the second is what playback costs.
const PASSES = 2;

registerBundledFonts();
const measureText = measureTextWith(createCanvas(1, 1).getContext("2d"));

function quantile(sorted, q) {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function benchmark(file) {
  const doc = JSON.parse(readFileSync(join(examplesDir, file), "utf8"));
  const { tracks, clips, camera2d, tempo } = doc.document;
  const canvas = { width: doc.width, height: doc.height, measureText };
  const animationCache = createAnimationCompileCache();
  const options = { maxVideoLayers: 8, canvas, animationCache, camera2d, tempo, mediaTracks: [] };
  const frames = Math.max(1, Math.round((doc.durationMs * FPS) / 1000));
  let samples = [];
  let layersMax = 0;
  for (let pass = 0; pass < PASSES; pass++) {
    samples = [];
    for (let frame = 0; frame < frames; frame++) {
      const timeMs = (frame * 1000) / FPS;
      const start = performance.now();
      const { layers } = computeActiveLayersWithHorizon(tracks, clips, timeMs, options);
      for (const layer of layers) {
        resolveAnimatedLayerProps(layer, timeMs, canvas, animationCache, { mediaTracks: [], clips, tempo });
      }
      hasActiveAnimation(layers, timeMs, canvas, animationCache, clips, tempo);
      samples.push(performance.now() - start);
      layersMax = Math.max(layersMax, layers.length);
    }
  }
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    timeline: file.replace(/\.timeline\.json$/, ""),
    tracks: tracks.length,
    clips: clips.length,
    frames,
    layersMax,
    meanMs: round(samples.reduce((sum, value) => sum + value, 0) / samples.length),
    p95Ms: round(quantile(sorted, 0.95)),
    maxMs: round(sorted.at(-1) ?? 0)
  };
}

const only = process.env.TIMELINE_SCENE_ONLY;
const results = readdirSync(examplesDir)
  .filter((file) => file.endsWith(".timeline.json") && (!only || file.startsWith(only)))
  .sort()
  .map(benchmark);

mkdirSync(reportDir, { recursive: true });
const reportPath = join(reportDir, "timeline-scene-resolve.json");
writeFileSync(
  reportPath,
  `${JSON.stringify({ kind: "timeline-scene-resolve-v1", fps: FPS, node: process.version, results }, null, 2)}\n`
);
console.table(results);
console.log(`wrote ${reportPath}`);
