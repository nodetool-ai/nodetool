// Builds the stills the marketing chat casts embed, from the trailer shots
// already shipped for the marketing site.
//
//   node scripts/build-chat-cast-assets.mjs
//
// Output: web/public/demo-assets/chat-marketing/{contact-sheet.jpg,teaser.mp4}
// Requires ffmpeg on PATH.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = path.resolve(WEB, "../marketing/public");
const OUT = path.join(WEB, "public/demo-assets/chat-marketing");
const TILE = "scale=640:360:force_original_aspect_ratio=increase,crop=640:360";

fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "chat-cast-assets-"));

const ff = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args]);

const tiles = [1, 2, 3, 4, 5, 6].map((i) => {
  const src = path.join(SHOTS, `trailer-shot-${i}.png`);
  if (!fs.existsSync(src)) throw new Error(`Missing shot: ${src}`);
  const out = path.join(tmp, `tile-${i}.jpg`);
  ff(["-i", src, "-vf", TILE, "-q:v", "4", out]);
  return out;
});

ff([
  ...tiles.flatMap((t) => ["-i", t]),
  "-filter_complex",
  "[0][1][2][3][4][5]xstack=inputs=6:layout=0_0|w0_0|w0+w1_0|0_h0|w0_h0|w0+w1_h0",
  "-q:v",
  "4",
  path.join(OUT, "contact-sheet.jpg"),
]);

// The delivered cast embeds a real clip so the chat renders its video player.
// Kept full length — the player prints its duration, and a trimmed copy would
// contradict the message that names it. Squeezed hard instead: the shot only
// ever shows frame one.
ff([
  "-i",
  path.join(SHOTS, "movie_trailer_example.mp4"),
  "-an",
  "-vf",
  "scale=854:-2,fps=20",
  "-c:v",
  "libx264",
  "-crf",
  "38",
  "-preset",
  "veryslow",
  "-movflags",
  "+faststart",
  path.join(OUT, "teaser.mp4"),
]);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`✓ contact-sheet.jpg, teaser.mp4 → ${path.relative(WEB, OUT)}`);
