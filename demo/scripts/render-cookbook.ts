/**
 * Batch-render the cookbook recipe videos (and still thumbnails).
 *
 *   npm run render:cookbook            # all 15 recipes → MP4 + JPG
 *   npm run render:cookbook -- --stills-only
 *   npm run render:cookbook -- --only text-to-video
 *
 * Bundles the Remotion project once and renders every `Cookbook-<slug>`
 * composition, writing web/public/cookbook/<slug>.mp4 and <slug>.jpg. Bundling
 * once (rather than per `remotion render` CLI call) makes 15 renders far
 * cheaper. Set CHROMIUM_PATH to override the browser binary.
 */
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";

import { COOKBOOK } from "../src/cookbook";
import { webpackOverride } from "../src/webpackOverride";

const here = path.dirname(fileURLToPath(import.meta.url));
const demoRoot = path.resolve(here, "..");
const outDir = path.resolve(demoRoot, "../web/public/cookbook");

const args = process.argv.slice(2);
const stillsOnly = args.includes("--stills-only");
const videosOnly = args.includes("--videos-only");
const onlyIdx = args.indexOf("--only");
const onlySlug = onlyIdx >= 0 ? args[onlyIdx + 1] : undefined;
const browserExecutable = process.env.CHROMIUM_PATH || undefined;

/** A representative still: near the end of the replay, before the outro. */
const stillFrame = (entry: (typeof COOKBOOK)[number]): number => {
  const seconds = entry.props.introSeconds + entry.props.replayWindowMs / 1000 - 1;
  return Math.max(1, Math.round(seconds * entry.fps));
};

async function main() {
  const entries = onlySlug
    ? COOKBOOK.filter((e) => e.slug === onlySlug)
    : COOKBOOK;
  if (entries.length === 0) throw new Error(`No cookbook recipe matched --only ${onlySlug}`);

  await mkdir(outDir, { recursive: true });

  console.log(`Bundling Remotion project (${entries.length} recipe(s))…`);
  const serveUrl = await bundle({
    entryPoint: path.resolve(demoRoot, "src/index.ts"),
    webpackOverride,
  });

  for (const entry of entries) {
    const { compositionId, slug } = entry;
    const composition = await selectComposition({
      serveUrl,
      id: compositionId,
      browserExecutable,
    });

    if (!stillsOnly) {
      const mp4 = path.join(outDir, `${slug}.mp4`);
      console.log(`▶ ${compositionId} → ${path.relative(demoRoot, mp4)}`);
      await renderMedia({
        composition,
        serveUrl,
        codec: "h264",
        outputLocation: mp4,
        browserExecutable,
      });
    }

    if (!videosOnly) {
      const jpg = path.join(outDir, `${slug}.jpg`);
      console.log(`◳ ${compositionId} still → ${path.relative(demoRoot, jpg)}`);
      await renderStill({
        composition,
        serveUrl,
        output: jpg,
        frame: stillFrame(entry),
        imageFormat: "jpeg",
        jpegQuality: 80,
        browserExecutable,
      });
    }
  }

  console.log(`Done. Output in ${path.relative(process.cwd(), outDir)}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
