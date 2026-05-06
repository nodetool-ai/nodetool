/**
 * Convert every *.png in the nodetool-base assets directory into a 16:9
 * JPEG sized for the workflow gallery card (1280×720, q=85). The PNG
 * masters are kept — the card image src points at the .jpg variant.
 *
 * The source images are 1536×1024 (gpt-image-1's closest aspect to 16:9).
 * We center-crop 1536×864 to drop the top/bottom letterboxing, then
 * downscale to 1280×720.
 *
 *   npx tsx packages/base-nodes/scripts/convert-thumbnails.ts
 */

import { readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(__dirname, "../nodetool/assets/nodetool-base");

const TARGET_WIDTH = 1280;
const TARGET_HEIGHT = 720;
const JPEG_QUALITY = 85;

// gpt-image-1 leans hard into the neon cyan/magenta we ask for, so every
// thumbnail looks identical and very "AI" out of the box. Tone it down at
// conversion time instead of regenerating: pull saturation down and shift
// the hue slightly off pure neon toward warmer/less synthetic colour.
const SATURATION = 0.3;
const HUE_SHIFT_DEG = 25;

async function convertOne(name: string): Promise<{ kb: number; w: number; h: number }> {
  const srcPath = join(ASSETS_DIR, name);
  const dstPath = join(ASSETS_DIR, name.replace(/\.png$/i, ".jpg"));

  const meta = await sharp(srcPath).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error(`${name}: missing dimensions`);

  // Center-crop to 16:9 then resize. sharp's resize with `fit: "cover"`
  // does both in one step and matches the UI's objectFit: "cover".
  // modulate() desaturates and shifts hue to mute the AI-neon look.
  await sharp(srcPath)
    .resize(TARGET_WIDTH, TARGET_HEIGHT, { fit: "cover", position: "centre" })
    .modulate({ saturation: SATURATION, hue: HUE_SHIFT_DEG })
    .jpeg({ quality: JPEG_QUALITY, progressive: true, mozjpeg: true })
    .toFile(dstPath);

  const kb = Math.round(statSync(dstPath).size / 1024);
  return { kb, w, h };
}

async function main() {
  const pngs = readdirSync(ASSETS_DIR)
    .filter((n) => n.toLowerCase().endsWith(".png"))
    .sort();

  if (pngs.length === 0) {
    console.error(`[thumbnails] no PNGs in ${ASSETS_DIR}`);
    return;
  }

  console.error(
    `[thumbnails] converting ${pngs.length} PNGs to ${TARGET_WIDTH}×${TARGET_HEIGHT} JPEGs`
  );

  let totalKb = 0;
  for (const name of pngs) {
    const { kb, w, h } = await convertOne(name);
    totalKb += kb;
    console.error(`  ${name} (${w}×${h}) → ${kb} KB`);
  }
  console.error(`[thumbnails] done — ${pngs.length} files, ${totalKb} KB total`);
}

await main();
