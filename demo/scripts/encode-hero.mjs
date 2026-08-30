// Turns the rendered hero masters into what the landing page serves.
//
//   node scripts/encode-hero.mjs [--frame <n>]
//
// `remotion render` writes visually lossless masters (a 22 s reel comes out
// around 12 MB); the hero autoplays on first paint, so it ships re-encoded at
// roughly a third of that, in both codecs, with the WebP posters the
// <img> srcSet needs. Reads `out/hero-project*.mp4` and writes into
// `marketing/public/`.
//
// ffmpeg comes from Remotion's bundled binary, so this needs nothing on PATH
// beyond what a render already needs.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(DEMO, "out");
const PUBLIC = path.resolve(DEMO, "../marketing/public");

/** Frame the 16:9 poster is taken from. The default is the assembled cut. */
const frameArg = process.argv.indexOf("--frame");
const POSTER_FRAME = frameArg === -1 ? 1040 : Number(process.argv[frameArg + 1]);
const FPS = 30;

const ffmpeg = (args) =>
  execFileSync("npx", ["remotion", "ffmpeg", "-v", "error", "-y", ...args], {
    cwd: DEMO,
    stdio: ["ignore", "inherit", "inherit"]
  });

/** mp4 + webm at the master's own size, no audio — the reel is silent. */
function encode(master, slug) {
  const base = path.join(PUBLIC, slug);
  ffmpeg([
    "-i", master,
    "-c:v", "libx264", "-crf", "29", "-preset", "slow",
    "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart",
    `${base}.mp4`
  ]);
  ffmpeg([
    "-i", master,
    "-c:v", "libvpx-vp9", "-crf", "46", "-b:v", "0",
    "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", "-an",
    `${base}.webm`
  ]);
}

/** The poster the hero paints before the video is anywhere near loaded. */
async function poster(master, slug, widths) {
  const still = path.join(OUT, `${slug}-poster.png`);
  ffmpeg([
    "-ss", String(POSTER_FRAME / FPS),
    "-i", master, "-frames:v", "1", still
  ]);
  for (const [width, suffix] of widths) {
    await sharp(still)
      .resize({ width })
      .webp({ quality: 80 })
      .toFile(path.join(PUBLIC, `${slug}-poster${suffix}.webp`));
  }
  fs.rmSync(still);
}

const size = (file) =>
  `${(fs.statSync(file).size / 1e6).toFixed(1)} MB`;

for (const [slug, widths] of [
  ["hero-project", [[1920, ""], [960, "-960"]]],
  ["hero-project-vertical", [[1080, ""]]]
]) {
  const master = path.join(OUT, `${slug}.mp4`);
  if (!fs.existsSync(master)) {
    console.log(`skip ${slug}: no master at out/${slug}.mp4`);
    continue;
  }
  encode(master, slug);
  await poster(master, slug, widths);
  console.log(
    `${slug}: ${size(path.join(PUBLIC, `${slug}.mp4`))} mp4, ` +
      `${size(path.join(PUBLIC, `${slug}.webm`))} webm, ` +
      `poster from frame ${POSTER_FRAME}`
  );
}
