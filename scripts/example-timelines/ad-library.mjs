// The ad library's motion graphics: one NodeTool timeline per concept on the
// marketing site's /ad-library pages.
//
//   node scripts/example-timelines/ad-library.mjs build [slug…]
//   node scripts/example-timelines/ad-library.mjs review <slug> [--out sheet.png]
//   node scripts/example-timelines/ad-library.mjs render [slug…]
//   node scripts/example-timelines/ad-library.mjs record [slug…]
//
// Each builder in ad-library/<slug>.mjs is written like a shipped example: it
// imports `@nodetool-ai/sandbox-timeline` and saves its cut through
// `nodetool.timelines`. Slugs are the concept slugs in
// marketing/src/data/adLibrary.json, and every beat starts at the time that
// file gives it, so the page's beat sheet and the video stay in step.
//
// `build` bakes the builders into marketing/recipe-assets/ad-library/
// <slug>.timeline.json, the editable master. `review` renders a contact sheet
// of a bundle at the concept's own QA times. `render` renders each bundle
// through the GPU compositor (`nodetool timeline render`), then writes the cut
// the recipe page plays: marketing/public/ad-library/videos/<slug>.mp4 at
// 720×1280 with no audio, and <slug>.webp, its final frame, as the poster.
// It then runs `record`, which measures the cut and writes the
// facts as the concept's `video` in adLibrary.json. Needs a WebGPU adapter.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { pngFrames, probeMedia, transcodeVideo } from "@nodetool-ai/runtime/media";
import sharp from "sharp";

import { buildTimelines } from "./build.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
const BUILDERS = join(HERE, "ad-library");
const BUNDLES = join(ROOT, "marketing/recipe-assets/ad-library");
const VIDEOS = join(ROOT, "marketing/public/ad-library/videos");
const RECIPES_FILE = join(ROOT, "marketing/src/data/adLibrary.json");
const RECIPES = JSON.parse(readFileSync(RECIPES_FILE, "utf8"));

const [command, ...rest] = process.argv.slice(2);
const flagAt = rest.indexOf("--out");
const outFlag = flagAt >= 0 ? rest[flagAt + 1] : undefined;
const named = rest.filter((arg, i) => !arg.startsWith("--") && (flagAt < 0 || i !== flagAt + 1));
const available = RECIPES.map((recipe) => recipe.slug).filter((slug) => existsSync(join(BUILDERS, `${slug}.mjs`)));
const slugs = named.length ? named : available;
const unknown = slugs.filter((slug) => !available.includes(slug));
if (unknown.length) {
  console.error(`No builder for ${unknown.join(", ")}. Built: ${available.join(", ")}.`);
  process.exit(1);
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`${cmd} ${args.join(" ")} exited with ${result.status}`);
    process.exit(result.status || 1);
  }
}

/** `nodetool timeline render` from source, so a renderer change needs no rebuild. */
function renderTimeline(args) {
  run("npm", ["run", "-s", "dev:nodetool", "--", "timeline", "render", ...args]);
}

function bundlePath(slug) {
  const path = join(BUNDLES, `${slug}.timeline.json`);
  if (!existsSync(path)) {
    console.error(`${path} is missing. Run \`ad-library.mjs build ${slug}\` first.`);
    process.exit(1);
  }
  return path;
}

/** libav's names for the codecs Mediabunny names, as ffprobe printed them. */
const LIBAV_CODECS = { avc: "h264", hevc: "hevc", vp9: "vp9", vp8: "vp8", av1: "av1" };

/** Width, height, duration, frame rate and codec of a video. */
async function probe(file) {
  const { durationSec, video } = await probeMedia(file);
  if (!video) {
    console.error(`${file} has no video stream.`);
    process.exit(1);
  }
  return {
    width: video.width,
    height: video.height,
    duration_ms: Math.round((durationSec ?? 0) * 1000),
    fps: video.nominalFps ?? video.averageFps,
    codec: LIBAV_CODECS[video.codec] ?? video.codec
  };
}

/**
 * Measure each slug's web cut and write the facts as its concept's `video`.
 * adLibrary.json keeps its existing shape: two-space indent and every
 * non-ASCII character escaped, so a change shows only the fields it touched.
 */
async function record(names) {
  for (const slug of names) {
    const file = join(VIDEOS, `${slug}.mp4`);
    if (!existsSync(file)) {
      console.error(`${file} is missing. Run \`ad-library.mjs render ${slug}\` first.`);
      process.exit(1);
    }
    const recipe = RECIPES.find((item) => item.slug === slug);
    recipe.video = {
      src: `/ad-library/videos/${slug}.mp4`,
      poster: `/ad-library/videos/${slug}.webp`,
      ...(await probe(file)),
      timeline: `marketing/recipe-assets/ad-library/${slug}.timeline.json`
    };
    console.log(`${slug}: ${recipe.video.width}×${recipe.video.height}, ${recipe.video.duration_ms} ms, ${recipe.video.fps} fps`);
  }
  const text = JSON.stringify(RECIPES, null, 2).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  writeFileSync(RECIPES_FILE, `${text}\n`);
}

if (command === "build") {
  mkdirSync(BUNDLES, { recursive: true });
  await buildTimelines({ sourceDir: BUILDERS, outDir: BUNDLES, slugs });
} else if (command === "review") {
  if (slugs.length !== 1) {
    console.error("review takes one slug.");
    process.exit(2);
  }
  const [slug] = slugs;
  const recipe = RECIPES.find((item) => item.slug === slug);
  const last = Math.round((recipe.duration_ms / 1000) * recipe.fps) - 1;
  const frames = [...new Set(recipe.output_qa_times_ms.map((ms) => Math.min(last, Math.round((ms / 1000) * recipe.fps))))];
  const out = outFlag ?? join(tmpdir(), `ad-library-${slug}-review.png`);
  renderTimeline([bundlePath(slug), "--frames", frames.join(","), "--sheet", "4", "--scale", "0.35", "--out", out]);
} else if (command === "render") {
  mkdirSync(VIDEOS, { recursive: true });
  const scratch = mkdtempSync(join(tmpdir(), "ad-library-render-"));
  try {
    for (const slug of slugs) {
      const bundle = JSON.parse(readFileSync(bundlePath(slug), "utf8"));
      const master = join(scratch, `${slug}.mp4`);
      renderTimeline([bundlePath(slug), "--out", master, "--bitrate", "16000000"]);
      const video = join(VIDEOS, `${slug}.mp4`);
      await transcodeVideo({
        inputPath: master,
        outPath: video,
        spec: {
          codec: "libx264",
          pixelFormat: "yuv420p",
          filter: "scale=720:1280:flags=lanczos",
          options: { preset: "slow", crf: "22" }
        },
        muxerOptions: { movflags: "+faststart" }
      });
      const lastFrame = Math.round((bundle.durationMs / 1000) * bundle.fps) - 1;
      for await (const png of pngFrames({
        filePath: master,
        filter: `select=eq(n\\,${lastFrame}),scale=720:1280:flags=lanczos`,
        limit: 1
      })) {
        await sharp(png).webp({ quality: 82 }).toFile(join(VIDEOS, `${slug}.webp`));
      }
      console.log(`${slug} -> ${video}`);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  await record(slugs);
} else if (command === "record") {
  await record(slugs);
} else {
  console.error("Usage: node scripts/example-timelines/ad-library.mjs build|review|render|record [slug…]");
  process.exit(2);
}
