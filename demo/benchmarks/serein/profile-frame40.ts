/** Render the Serein bottleneck frame in-process after `node build.js`. */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderTimelineFrames } from "../../../packages/agents/src/timeline-preview/frames.js";
import type { TimelineSequence } from "../../../packages/timeline/src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(resolve(here, "../../out/serein-doc.json"), "utf8"));
const sequence = {
  ...input.document,
  id: input.timeline_id,
  projectId: "local",
  name: "Serein",
  fps: 30,
  width: 1920,
  height: 1080,
  durationMs: 26000,
  createdAt: "",
  updatedAt: ""
} as TimelineSequence;
const start = performance.now();
const { frames } = await renderTimelineFrames({
  sequence,
  timesMs: [Math.floor(40 * 1000 / 30) + 5],
  width: 640,
  loadAsset: async () => null
});
process.stdout.write(JSON.stringify({
  frame: 40,
  elapsedMs: Math.round(performance.now() - start),
  layers: frames[0]?.layers.length,
  dropped: frames[0]?.dropped.length,
  degraded: frames[0]?.degraded.length
}) + "\n");
