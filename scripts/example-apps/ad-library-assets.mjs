// Stages the ad library's beat illustrations for the ad library Recipe apps.
//
//   node scripts/example-apps/ad-library-assets.mjs
//
// Copies marketing/public/ad-library/illustrations/<beat>.webp to the
// nodetool-base package assets as ad-library/<beat>.webp, which the apps show
// as package:// images. Writes ad-<slug>.jpg, three beats side by side at
// 1280×720, as each app's gallery thumbnail. Needs ffmpeg.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE = join(ROOT, "marketing/public/ad-library/illustrations");
const ASSETS = join(ROOT, "packages/base-nodes/nodetool/assets/nodetool-base");
const CONCEPTS = JSON.parse(readFileSync(join(ROOT, "marketing/src/data/adLibrary.json"), "utf8"));

if (spawnSync("ffmpeg", ["-version"]).status !== 0) {
  console.error("ffmpeg is required to write the app thumbnails.");
  process.exit(1);
}
mkdirSync(join(ASSETS, "ad-library"), {recursive: true});
for (const concept of CONCEPTS) {
  const beats = concept.beats.map(beat => beat.illustration_asset_id);
  for (const beat of beats) {
    copyFileSync(join(SOURCE, `${beat}.webp`), join(ASSETS, "ad-library", `${beat}.webp`));
  }
  const picked = [beats[0], beats[Math.floor(beats.length / 2)], beats.at(-1)];
  const thumbnail = join(ASSETS, `ad-${concept.slug}.jpg`);
  const result = spawnSync("ffmpeg", [
    "-v", "error", "-y",
    ...picked.flatMap(beat => ["-i", join(SOURCE, `${beat}.webp`)]),
    "-filter_complex", picked.map((_, i) => `[${i}]scale=428:-2,crop=428:720[b${i}]`).join(";") + ";[b0][b1][b2]hstack=3,crop=1280:720",
    "-q:v", "4", thumbnail
  ], {stdio: "inherit"});
  if (result.status !== 0) {
    console.error(`ffmpeg failed for ${concept.slug}`);
    process.exit(result.status || 1);
  }
  console.log(`${concept.slug}: ${beats.length} beats, thumbnail ${thumbnail}`);
}
