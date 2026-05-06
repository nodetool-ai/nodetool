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
// conversion time instead of regenerating:
//
//   modulate(saturation, hue, brightness)
//     — desaturate, nudge hue off pure neon, lift exposure.
//   gamma()
//     — open the deep shadows so subjects don't get swallowed at
//       thumbnail size.
//   linear(slope, intercept)
//     — restore contrast and deepen the blacks the gamma lift hazed out.
//       This is the cinematic-look move: lifted midtones + crushed blacks.
//   sharpen()
//     — crisp the details after the downscale.
//   composite(vignette)
//     — radial gradient multiplied onto each frame so the corners fall
//       off and the eye lands on the subject.
const SATURATION = 0.3;
const HUE_SHIFT_DEG = 25;
const BRIGHTNESS = 1.1;
const GAMMA = 1.12;
const LINEAR_SLOPE = 1.08;
const LINEAR_INTERCEPT = -8;
const SHARPEN_SIGMA = 0.7;
const VIGNETTE_STRENGTH = 0.55; // 0 = none, 1 = corners → black

/**
 * Build a 1280×720 vignette overlay (white centre → black corners) once and
 * reuse it for every thumbnail. Blended with multiply, it darkens the
 * corners without touching the subject.
 */
function buildVignetteSvg(): Buffer {
  // Strength 0 → fully white (no vignette); 1 → corners pure black.
  const cornerLuma = Math.max(0, Math.round(255 * (1 - VIGNETTE_STRENGTH)));
  const corner = `rgb(${cornerLuma},${cornerLuma},${cornerLuma})`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TARGET_WIDTH}" height="${TARGET_HEIGHT}">
  <defs>
    <radialGradient id="v" cx="50%" cy="50%" r="75%" fx="50%" fy="50%">
      <stop offset="55%" stop-color="white" stop-opacity="1"/>
      <stop offset="100%" stop-color="${corner}" stop-opacity="1"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#v)"/>
</svg>`;
  return Buffer.from(svg);
}

const vignette = buildVignetteSvg();

async function convertOne(name: string): Promise<{ kb: number; w: number; h: number }> {
  const srcPath = join(ASSETS_DIR, name);
  const dstPath = join(ASSETS_DIR, name.replace(/\.png$/i, ".jpg"));

  const meta = await sharp(srcPath).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error(`${name}: missing dimensions`);

  // Pipeline: center-crop to 16:9 (matches the UI's objectFit: "cover")
  // → tone-map (modulate + gamma + linear) → sharpen → vignette → JPEG.
  await sharp(srcPath)
    .resize(TARGET_WIDTH, TARGET_HEIGHT, { fit: "cover", position: "centre" })
    .modulate({
      saturation: SATURATION,
      hue: HUE_SHIFT_DEG,
      brightness: BRIGHTNESS
    })
    .gamma(GAMMA)
    .linear(LINEAR_SLOPE, LINEAR_INTERCEPT)
    .sharpen({ sigma: SHARPEN_SIGMA })
    .composite([{ input: vignette, blend: "multiply" }])
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
