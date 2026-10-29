// Stages the ad library's beat illustrations for the ad library Recipe apps.
//
//   node scripts/example-apps/ad-library-assets.mjs
//
// Copies marketing/public/ad-library/illustrations/<beat>.webp to the
// nodetool-base package assets as ad-library/<beat>.webp, which the apps show
// as package:// images. Writes ad-<slug>.jpg, three beats side by side at
// 1280×720, as each app's gallery thumbnail.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE = join(ROOT, "marketing/public/ad-library/illustrations");
const ASSETS = join(ROOT, "packages/base-nodes/nodetool/assets/nodetool-base");
const CONCEPTS = JSON.parse(readFileSync(join(ROOT, "marketing/src/data/adLibrary.json"), "utf8"));

mkdirSync(join(ASSETS, "ad-library"), {recursive: true});
for (const concept of CONCEPTS) {
  const beats = concept.beats.map(beat => beat.illustration_asset_id);
  for (const beat of beats) {
    copyFileSync(join(SOURCE, `${beat}.webp`), join(ASSETS, "ad-library", `${beat}.webp`));
  }
  const picked = [beats[0], beats[Math.floor(beats.length / 2)], beats.at(-1)];
  const thumbnail = join(ASSETS, `ad-${concept.slug}.jpg`);
  // Three 428×720 centre crops side by side, cut to 1280×720.
  const tiles = await Promise.all(picked.map(beat =>
    sharp(join(SOURCE, `${beat}.webp`)).resize(428, 720, {fit: "cover", position: "centre"}).toBuffer()
  ));
  await sharp({create: {width: 1284, height: 720, channels: 3, background: "#000000"}})
    .composite(tiles.map((input, i) => ({input, left: i * 428, top: 0})))
    .extract({left: 2, top: 0, width: 1280, height: 720})
    .jpeg({quality: 85})
    .toFile(thumbnail);
  console.log(`${concept.slug}: ${beats.length} beats, thumbnail ${thumbnail}`);
}
