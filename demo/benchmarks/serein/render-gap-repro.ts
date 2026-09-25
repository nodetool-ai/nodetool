/** Render the local Serein timeline gap fixture through preview and export. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { timelineDocument } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import type { TimelineSequence } from "@nodetool-ai/timeline";

import { renderTimelineFrames } from "../../../packages/agents/src/timeline-preview/frames.js";
import { renderTimelineComposited } from "../../../packages/video-nodes/src/nodes/timeline/compositeRender.js";
import { resolveTimelineOutput } from "../../../packages/video-nodes/src/nodes/timeline/outputFormats.js";

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(await readFile(resolve(here, "timeline-gap-repro.json"), "utf8"));
const document = timelineDocument.parse(input.document);
const sequence: TimelineSequence = {
  id: input.id,
  projectId: "serein-gap-repro",
  name: input.name,
  fps: input.fps,
  width: input.width,
  height: input.height,
  durationMs: input.durationMs,
  tracks: document.tracks,
  clips: document.clips,
  markers: document.markers,
  camera2d: document.camera2d,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};
const outputDir = resolve(here, "../../out/serein-gap-repro");
await mkdir(outputDir, { recursive: true });

const timesMs = [100, 600, 1100, 1700, 2600, 3000, 3450, 4100, 4500, 5900, 6200, 6700, 7100, 7200, 7400, 7600, 7800, 8000, 8500, 9300];
const preview = await renderTimelineFrames({
  sequence,
  timesMs,
  width: 480,
  loadAsset: async () => null
});
for (const frame of preview.frames) {
  await writeFile(resolve(outputDir, `preview-${String(frame.time_ms).padStart(4, "0")}.png`), frame.png);
}
await writeFile(resolve(outputDir, "preview-report.json"), JSON.stringify({
  effectsNotApplied: preview.effectsNotApplied,
  frames: preview.frames.map(({ png: _png, ...report }) => report)
}, null, 2));

if (process.argv.includes("--export")) {
  const result = await renderTimelineComposited({
    sequence,
    width: 480,
    height: 270,
    fps: 30,
    durationMs: sequence.durationMs,
    resolveAssetPath: async () => null,
    outPath: resolve(outputDir, "export.zip"),
    output: resolveTimelineOutput({ format: "png_sequence" })
  });
  process.stdout.write(`Exported ${result.totalFrames} frames to ${outputDir}/export.zip\n`);
}
process.stdout.write(`Previewed ${preview.frames.length} frames in ${outputDir}\n`);
