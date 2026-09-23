// Turns the rendered landing-page masters into what the page serves: the
// hero reel and the agents section's redo reel.
//
//   node scripts/encode-hero.mjs [--only <slug>] [--frame <n>]
//
// `remotion render` writes visually lossless masters (a 22 s reel comes out
// around 12 MB); the hero autoplays on first paint, so it ships re-encoded at
// roughly a third of that, in both codecs, with the WebP posters the
// <img> srcSet needs. Reads `out/hero-project*.mp4`, `out/sizzle.mp4` and `out/redo.mp4`, and
// writes into `marketing/public/`.
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

/** Overrides the hero's poster frame. The default is the assembled cut. */
const frameArg = process.argv.indexOf("--frame");
const HERO_POSTER_FRAME =
  frameArg === -1 ? 1040 : Number(process.argv[frameArg + 1]);
const FPS = 30;

const ffmpeg = (args) =>
  execFileSync("npx", ["remotion", "ffmpeg", "-v", "error", "-y", ...args], {
    cwd: DEMO,
    stdio: ["ignore", "inherit", "inherit"]
  });

/**
 * Remotion writes the master full-range (`yuvj420p`, `pc`), because that is
 * what a browser screenshot is. Video has to ship limited-range: a
 * full-range H.264 track is the one thing Safari and iOS will accept, decode,
 * and then decline to paint — you get the poster and no error. So remap the
 * samples rather than only retagging them, which would crush black and clip
 * white instead.
 */
const TO_LIMITED_RANGE = [
  "-vf", "scale=in_range=full:out_range=tv",
  "-color_range", "tv"
];

/** mp4 + webm at the master's own size, no audio — the reel is silent. */
function encode(master, slug) {
  const base = path.join(PUBLIC, slug);
  ffmpeg([
    "-i", master, ...TO_LIMITED_RANGE,
    "-c:v", "libx264", "-crf", "29", "-preset", "slow",
    "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart",
    `${base}.mp4`
  ]);
  ffmpeg([
    "-i", master, ...TO_LIMITED_RANGE,
    "-c:v", "libvpx-vp9", "-crf", "46", "-b:v", "0",
    "-pix_fmt", "yuv420p",
    "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", "-an",
    `${base}.webm`
  ]);
}

/** The poster the hero paints before the video is anywhere near loaded. */
async function poster(master, slug, widths, frame) {
  const still = path.join(OUT, `${slug}-poster.png`);
  ffmpeg([
    "-ss", String(frame / FPS),
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

const REELS = [
  { master: "hero-project", slug: "hero-project", frame: HERO_POSTER_FRAME, widths: [[1920, ""], [960, "-960"]] },
  { master: "hero-project-vertical", slug: "hero-project-vertical", frame: HERO_POSTER_FRAME, widths: [[1080, ""]] },
  // The landing hero: the beat-cut spot, posted on its "Cut." shot. The
  // page plays it muted, so the score is dropped with the rest.
  { master: "sizzle", slug: "hero-sizzle", frame: 612, widths: [[1920, ""], [960, "-960"]] },
  // The agents section: the wide shot of the board after the redo, with the
  // night card among five unchanged ones.
  { master: "redo", slug: "agent-redo", frame: 395, widths: [[1920, ""], [960, "-960"]] }
];

/** Encodes one reel, so publishing it leaves the others' files alone. */
const onlyArg = process.argv.indexOf("--only");
const ONLY = onlyArg === -1 ? null : process.argv[onlyArg + 1];
const selected = ONLY ? REELS.filter((r) => r.slug === ONLY) : REELS;
if (selected.length === 0) {
  throw new Error(`No reel named ${ONLY}`);
}

for (const { master: name, slug, frame, widths } of selected) {
  const master = path.join(OUT, `${name}.mp4`);
  if (!fs.existsSync(master)) {
    console.log(`skip ${slug}: no master at out/${name}.mp4`);
    continue;
  }
  encode(master, slug);
  await poster(master, slug, widths, frame);
  console.log(
    `${slug}: ${size(path.join(PUBLIC, `${slug}.mp4`))} mp4, ` +
      `${size(path.join(PUBLIC, `${slug}.webm`))} webm, ` +
      `poster from frame ${frame}`
  );
}
