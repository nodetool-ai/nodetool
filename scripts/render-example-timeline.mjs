// Renders a shipped example timeline to the video and poster its bundle names.
//
//   node scripts/render-example-timeline.mjs <slug> [--out <file.mp4>] [--poster-frame <n>]
//
// The frames come from `renderTimelineComposited`, the GPU compositor behind
// the Render Timeline node, so the file matches what the editor previews.
// Needs `npm run build:packages`, ffmpeg, and a WebGPU adapter (a Vulkan ICD
// such as lavapipe on a headless machine). Without `--out` the video and
// poster are written to the package asset paths the bundle's URIs point at.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parsePackageAssetUri } from "@nodetool-ai/protocol";
import { timelineDocument } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { renderTimelineComposited } from "@nodetool-ai/video-nodes/nodes/timeline/compositeRender";
import { resolveTimelineOutput } from "@nodetool-ai/video-nodes/nodes/timeline/outputFormats";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = path.join(ROOT, "packages/base-nodes/nodetool");

const argv = process.argv.slice(2);
const flag = (name) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
};
const slug = argv[0];
if (!slug || slug.startsWith("--")) {
  console.error("Usage: node scripts/render-example-timeline.mjs <slug> [--out <file.mp4>] [--poster-frame <n>]");
  process.exit(2);
}

const bundle = JSON.parse(readFileSync(path.join(BASE, "examples/timelines", `${slug}.timeline.json`), "utf8"));
const document = timelineDocument.parse(bundle.document);
const assetPath = (uri) => {
  const ref = parsePackageAssetUri(uri);
  if (!ref) throw new Error(`Not a package asset URI: ${uri}`);
  return path.join(BASE, "assets", ref.packageName, ref.path);
};
const outPath = path.resolve(flag("--out") ?? assetPath(bundle.videoUri));
const posterPath = flag("--out") ? outPath.replace(/\.mp4$/, ".poster.jpg") : assetPath(bundle.posterUri);
const posterFrame = Number(flag("--poster-frame") ?? Math.round((bundle.durationMs / 1000) * bundle.fps) - 30);
mkdirSync(path.dirname(outPath), { recursive: true });
mkdirSync(path.dirname(posterPath), { recursive: true });

const now = new Date().toISOString();
const sequence = {
  id: slug, projectId: "examples", name: bundle.name,
  fps: bundle.fps, width: bundle.width, height: bundle.height, durationMs: bundle.durationMs,
  ...document, createdAt: now, updatedAt: now
};

const started = Date.now();
const totalFrames = Math.round((bundle.durationMs / 1000) * bundle.fps);
let lastLogged = -1;
const { skippedClips } = await renderTimelineComposited({
  sequence,
  width: bundle.width,
  height: bundle.height,
  fps: bundle.fps,
  durationMs: bundle.durationMs,
  // Example timelines are pure motion graphics: no clip reads an asset.
  resolveAssetPath: async () => null,
  outPath,
  // 4 Mbps keeps gradients and fine type clean at 1080p at a size the repo can carry.
  output: resolveTimelineOutput({ format: "mp4", bitrate: 4_000_000 }),
  onProgress: (frame) => {
    const tenth = Math.floor((frame / totalFrames) * 10);
    if (tenth !== lastLogged) {
      lastLogged = tenth;
      console.log(`frame ${frame}/${totalFrames}`);
    }
  }
});
if (skippedClips.length) console.warn(`Skipped clips: ${skippedClips.join(", ")}`);

execFileSync("ffmpeg", ["-v", "error", "-y", "-i", outPath, "-vf", `select=eq(n\\,${posterFrame}),scale=1280:-2`, "-frames:v", "1", "-q:v", "3", posterPath]);
console.log(`${totalFrames} frames in ${((Date.now() - started) / 1000).toFixed(1)}s -> ${outPath}`);
console.log(`poster (frame ${posterFrame}) -> ${posterPath}`);
// The GPU device keeps the event loop alive after the last frame.
process.exit(0);
