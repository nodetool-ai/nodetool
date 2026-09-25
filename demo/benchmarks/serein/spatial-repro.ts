/** Small timeline repro for Serein S1 wall perspective and S4a card flights. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TimelineClip, TimelineSequence, TimelineTrack } from "../../../packages/timeline/src/types.js";
import { renderTimelineFrames } from "../../../packages/agents/src/timeline-preview/frames.js";
import { renderTimelineComposited } from "../../../packages/video-nodes/src/nodes/timeline/compositeRender.js";
import { resolveTimelineOutput } from "../../../packages/video-nodes/src/nodes/timeline/outputFormats.js";

const WIDTH = 640;
const HEIGHT = 360;
const DURATION_MS = 3000;
const OUT = new URL("../../out/serein-spatial-repro/", import.meta.url).pathname;

const tracks: TimelineTrack[] = [];
const clips: TimelineClip[] = [];
function track(id: string): string {
  tracks.push({ id, name: id, type: "video", index: tracks.length, visible: true, locked: false });
  return id;
}

function card(id: string, color: string, x: number, y: number, depthPx: number, startMs: number, durationMs: number, parentId?: string): TimelineClip {
  const trackId = track(id);
  const result: TimelineClip = {
    id, trackId, name: id, startMs, durationMs,
    mediaType: "shape", sourceType: "generated", status: "generated",
    locked: false, versions: [], parentId,
    // The source geometry stays inside the raster, while transform places it.
    shapeStyle: {
      kind: "rect", fill: color,
      x: (WIDTH - 140) / (2 * WIDTH), y: (HEIGHT - 42) / (2 * HEIGHT),
      width: 140 / WIDTH, height: 42 / HEIGHT, cornerRadius: 6 / WIDTH
    },
    transform: {
      position: { x, y }, scale: { x: 1, y: 1 }, rotation: 0,
      depthPx, anchor: { x: 0.5, y: 0.5 }
    }
  };
  clips.push(result);
  return result;
}

const wallTrack = track("wall-group");
clips.push({
  id: "wall", trackId: wallTrack, name: "Tilted wall", startMs: 0, durationMs: 1000,
  mediaType: "group", sourceType: "generated", status: "generated", locked: false, versions: [],
  transform: {
    position: { x: 0, y: 0 }, scale: { x: 1, y: 1 },
    rotation: -12 * Math.PI / 180, rotationX: 28, perspective: 1800,
    anchor: { x: 0.5, y: 0.5 }
  }
});

const layers = [
  { name: "far", depth: -300, color: "#5b497b", speed: 0.85, xs: [-210, 30], ys: [-170, -35, 100] },
  { name: "mid", depth: 0, color: "#b47fbd", speed: 1, xs: [-50, 185], ys: [-150, -15, 120] },
  { name: "near", depth: 220, color: "#edba91", speed: 1.19, xs: [-185, 90], ys: [-110, 65] }
];
for (const layer of layers) {
  layer.ys.forEach((y, row) => {
    layer.xs.forEach((x, column) => {
      const c = card(`${layer.name}-${row}-${column}`, layer.color, x, y, layer.depth, 0, 1000, "wall");
      c.opacity = layer.name === "far" ? 0.5 : 1;
      c.animations = [{
        id: `${c.id}-scroll`, role: "emphasis", preset: "custom", durationMs: 1000,
        custom: { curves: [{ property: "offsetY", keyframes: [
          { t: 0, value: 0 }, { t: 1, value: -165 * layer.speed }
        ] }] }
      }];
    });
  });
}

const flight = [
  { name: "flight-left", color: "#87d6be", x: -170, y: -75, fromX: -430, fromY: -110 },
  { name: "flight-center", color: "#baaaec", x: 0, y: 15, fromX: 250, fromY: -320 },
  { name: "flight-right", color: "#edba91", x: 170, y: 105, fromX: 500, fromY: 190 }
];
for (const spec of flight) {
  const c = card(spec.name, spec.color, spec.x, spec.y, 0, 1000, 1000);
  c.animations = [{
    id: `${c.id}-fly`, role: "in", preset: "custom", durationMs: 650,
    custom: { curves: [
      { property: "offsetX", keyframes: [
        { t: 0, value: spec.fromX }, { t: 1, value: 0, easing: "spring(170,18,1)" }
      ] },
      { property: "offsetY", keyframes: [
        { t: 0, value: spec.fromY }, { t: 1, value: 0, easing: "spring(170,18,1)" }
      ] }
    ] }
  }];
}

// At 2s, the blue shape is entirely outside its source raster even though its
// transform would move it into the output. The green shape places its source
// geometry inside the raster and reaches the same destination by transform.
const clipped = card("clipped-before-placement", "#548cfa", -640, -70, 0, 2000, 1000);
clipped.shapeStyle = { kind: "rect", fill: "#548cfa", x: 1.05, y: 0.25, width: 140 / WIDTH, height: 42 / HEIGHT };
const placed = card("in-bounds-then-placed", "#8edabc", -218, 70, 0, 2000, 1000);
placed.shapeStyle = { kind: "rect", fill: "#8edabc", x: 250 / WIDTH, y: 0.6, width: 140 / WIDTH, height: 42 / HEIGHT };

const sequence: TimelineSequence = {
  id: "serein-spatial-repro", projectId: "local", name: "Serein spatial repro",
  fps: 30, width: WIDTH, height: HEIGHT, durationMs: DURATION_MS,
  tracks, clips, markers: [],
  camera2d: {
    position: { x: 0, y: 0 }, depthPx: 0, focalLengthPx: 1800,
    focusDepthPx: 0, aperturePx: 14,
    keyframes: [
      { timeMs: 0, position: { x: 0, y: 0 }, depthPx: 0 },
      { timeMs: 1000, position: { x: 0, y: 0 }, depthPx: 260 },
      { timeMs: 3000, position: { x: 0, y: 0 }, depthPx: 260 }
    ]
  },
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z"
};

await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, "timeline.json"), JSON.stringify(sequence, null, 2));
const timesMs = [0, 333, 667, 967, 1000, 1167, 1333, 1667, 1967, 2333];
const result = await renderTimelineFrames({ sequence, timesMs, width: WIDTH, loadAsset: async () => null });
for (let index = 0; index < result.frames.length; index++) {
  const frame = result.frames[index];
  await writeFile(join(OUT, `frame-${String(index).padStart(2, "0")}-${timesMs[index]}.png`), frame.png);
}
await writeFile(join(OUT, "report.json"), JSON.stringify({
  effectsNotApplied: result.effectsNotApplied,
  frames: result.frames.map((frame) => ({ timeMs: frame.time_ms, layers: frame.layers.length, dropped: frame.dropped, degraded: frame.degraded }))
}, null, 2));
if (process.env.EXPORT_SPATIAL_REPRO === "1") {
  await renderTimelineComposited({
    sequence, width: WIDTH, height: HEIGHT, fps: 10,
    durationMs: DURATION_MS, resolveAssetPath: async () => null,
    outPath: join(OUT, "exported-frames.zip"),
    output: resolveTimelineOutput({ format: "png_sequence" })
  });
}
process.stdout.write(`${OUT}\n`);
