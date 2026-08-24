// Turns what render-recipe-samples.mjs produced into the files the recipe
// pages serve: one contact sheet per recipe, plus an mp4/webm/poster set where
// the recipe ends in a clip.
//
//   node scripts/compose-recipe-samples.mjs
//   node scripts/compose-recipe-samples.mjs --only trailer
//
// Separate from the renderer on purpose. Composition is free and fiddly;
// generation is neither. A cropping mistake should cost a re-run of this, not
// another round of model calls.
//
// Everything here reads out of nodetool-debug/recipe-samples/<recipe>/ and
// writes into public/recipes/samples/. It calls no model.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARKETING = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(MARKETING, "..");
const WORK = path.join(REPO_ROOT, "nodetool-debug/recipe-samples");
const OUT = path.join(MARKETING, "public/recipes/samples");

const ONLY = process.argv.includes("--only")
  ? process.argv[process.argv.indexOf("--only") + 1]
  : null;

const BG = "#0d0d12";
const SHEET_W = 1280;
const SHEET_H = 720;

function fail(message) {
  console.error(`compose-recipe-samples: ${message}`);
  process.exit(1);
}

const MANIFEST = JSON.parse(
  fs.readFileSync(path.join(__dirname, "recipe-samples.manifest.json"), "utf8"),
);

/**
 * The file a render step produced, by step id.
 *
 * The extension is looked up rather than assumed: the renderer names each
 * artifact by what its bytes actually are, and a Replicate image output comes
 * back as WebP even though the node's output type is just "image".
 */
function src(recipe, stepId) {
  const file = MANIFEST[recipe]?.artifacts?.[stepId];
  if (!file) fail(`${recipe}: no artifact for step "${stepId}" in the manifest`);
  const full = path.join(WORK, recipe, file);
  if (!fs.existsSync(full)) fail(`missing ${path.relative(REPO_ROOT, full)}`);
  return full;
}

function ffmpeg(args) {
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args], {
    stdio: ["ignore", "inherit", "inherit"],
  });
}

/** A caption bar, drawn over the bottom of a cell. */
function caption(text, width) {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return Buffer.from(
    `<svg width="${width}" height="34"><rect width="100%" height="100%" fill="#000" fill-opacity="0.64"/>` +
      `<text x="12" y="23" font-family="Helvetica,Arial" font-size="15" fill="#e8e8ef">${escaped}</text></svg>`,
  );
}

/** Grid of labelled cells at the standard sheet size. */
async function sheet(cells, cols, out, { fit = "cover" } = {}) {
  const rows = Math.ceil(cells.length / cols);
  const cw = Math.floor(SHEET_W / cols);
  const ch = Math.floor(SHEET_H / rows);
  const composite = [];
  for (const [i, cell] of cells.entries()) {
    const buf = await sharp(cell.file)
      .flatten({ background: BG })
      .resize(cw, ch, { fit, background: BG })
      .toBuffer();
    const x = (i % cols) * cw;
    const y = Math.floor(i / cols) * ch;
    composite.push({ input: buf, left: x, top: y });
    composite.push({ input: caption(cell.label, cw), left: x, top: y + ch - 34 });
  }
  await sharp({
    create: { width: SHEET_W, height: SHEET_H, channels: 3, background: BG },
  })
    .composite(composite)
    .jpeg({ quality: 88 })
    .toFile(out);
  console.log(`  ${path.basename(out)}`);
}

/** One frame out of a clip, as a PNG next to it. */
function frame(file, seconds) {
  const out = `${file.replace(/\.[^.]+$/, "")}-t${seconds}.png`;
  ffmpeg(["-ss", String(seconds), "-i", file, "-vframes", "1", out]);
  return out;
}

/** mp4 + webm + WebP poster at one width, ready to serve. */
async function clip(file, slug, width, { audio = false, trim = null } = {}) {
  const base = path.join(OUT, slug);
  const scale = ["-vf", `scale=${width}:-2`];
  const cut = trim ? ["-t", String(trim)] : [];
  ffmpeg([
    "-i", file, ...cut, ...scale,
    "-c:v", "libx264", "-crf", "29", "-preset", "slow",
    ...(audio ? ["-c:a", "aac", "-b:a", "96k"] : ["-an"]),
    "-movflags", "+faststart", `${base}.mp4`,
  ]);
  ffmpeg([
    "-i", file, ...cut, ...scale,
    "-c:v", "libvpx-vp9", "-crf", "40", "-b:v", "0", "-row-mt", "1",
    ...(audio ? ["-c:a", "libopus", "-b:a", "80k"] : ["-an"]),
    `${base}.webm`,
  ]);
  const still = `${base}-poster.png`;
  ffmpeg(["-ss", "1", "-i", file, ...scale, "-vframes", "1", still]);
  await sharp(still).webp({ quality: 78 }).toFile(`${base}-poster.webp`);
  fs.rmSync(still);
  console.log(`  ${slug}.mp4 / .webm / -poster.webp`);
}

async function ecommerce() {
  const r = "ecommerce-sku-visual-factory";
  const turntable = src(r, "turntable");
  await sheet(
    [
      { file: src(r, "packshot"), label: "1 · packshot in" },
      { file: src(r, "cutout"), label: "2 · cutout, real alpha" },
      { file: src(r, "backdrop"), label: "3 · studio scene" },
      { file: src(r, "relight"), label: "4 · seasonal relight" },
      { file: frame(turntable, 2), label: "5 · turntable clip" },
      { file: src(r, "print"), label: "6 · 4096px print master" },
    ],
    3,
    path.join(OUT, `${r}.jpg`),
  );
  await clip(turntable, r, 900);
}

async function adEngine() {
  const r = "viral-video-ad-engine";
  const vertical = src(r, "vertical");
  const thumbs = fs
    .readdirSync(path.join(WORK, r))
    .filter((f) => /^hooks(-\d+)?\.(png|jpg|webp)$/.test(f))
    .sort();
  if (thumbs.length === 0) fail(`${r}: no hook thumbnails`);

  // The vertical cut is 9:16 against 16:9 thumbnails, so it takes a column of
  // its own rather than a cell in the grid: one frame either crops the bottle
  // out of the ad or shrinks the thumbnails to stamps.
  const LW = 405;
  const RW = SHEET_W - LW;
  const cw = Math.floor(RW / 2);
  const ch = Math.floor(SHEET_H / Math.ceil(Math.min(thumbs.length, 4) / 2));
  const composite = [
    {
      input: await sharp(frame(vertical, 2))
        .resize(LW, SHEET_H, { fit: "cover" })
        .toBuffer(),
      left: 0,
      top: 0,
    },
  ];
  for (const [i, file] of thumbs.slice(0, 4).entries()) {
    composite.push({
      input: await sharp(path.join(WORK, r, file))
        .resize(cw, ch, { fit: "contain", background: BG })
        .toBuffer(),
      left: LW + (i % 2) * cw,
      top: Math.floor(i / 2) * ch,
    });
  }
  composite.push({
    input: caption("hero loop, cut to 1080x1920", LW),
    left: 0,
    top: SHEET_H - 34,
  });
  composite.push({
    input: caption(
      `${thumbs.length} hook lines, ${thumbs.length} thumbnails`,
      RW,
    ),
    left: LW,
    top: SHEET_H - 34,
  });
  await sharp({
    create: { width: SHEET_W, height: SHEET_H, channels: 3, background: BG },
  })
    .composite(composite)
    .jpeg({ quality: 88 })
    .toFile(path.join(OUT, `${r}.jpg`));
  console.log(`  ${r}.jpg`);
  await clip(vertical, r, 608);
}

async function dubber() {
  const r = "multilingual-video-dubber";
  const source = src(r, "presenter-clip");
  const dubbed = src(r, "dubbed");
  const spanish = fs.readFileSync(path.join(WORK, r, "spanish-text.txt"), "utf8").trim();
  const english =
    "Our insulated bottle keeps ice solid for a full twenty-four hours. One bottle, every day, for years.";
  const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");

  const IMGH = 520;
  const half = SHEET_W / 2;
  const panel = Buffer.from(
    `<svg width="${SHEET_W}" height="${SHEET_H - IMGH}"><rect width="100%" height="100%" fill="${BG}"/>` +
      `<text x="28" y="46" font-family="Helvetica,Arial" font-size="14" fill="#8a8a99">SOURCE SCRIPT (EN)</text>` +
      `<text x="28" y="74" font-family="Helvetica,Arial" font-size="18" fill="#e8e8ef">${esc(english)}</text>` +
      `<text x="28" y="128" font-family="Helvetica,Arial" font-size="14" fill="#c99b52">TRANSLATED AND REVOICED (ES)</text>` +
      `<text x="28" y="156" font-family="Helvetica,Arial" font-size="18" fill="#e8e8ef">${esc(spanish)}</text></svg>`,
  );
  await sharp({
    create: { width: SHEET_W, height: SHEET_H, channels: 3, background: BG },
  })
    .composite([
      {
        input: await sharp(frame(source, 2))
          .resize(half, IMGH, { fit: "cover" })
          .toBuffer(),
        left: 0,
        top: 0,
      },
      {
        input: await sharp(frame(dubbed, 2))
          .resize(half, IMGH, { fit: "cover" })
          .toBuffer(),
        left: half,
        top: 0,
      },
      { input: caption("source take", half), left: 0, top: IMGH - 34 },
      {
        input: caption("lip-synced to the Spanish voice", half),
        left: half,
        top: IMGH - 34,
      },
      { input: panel, left: 0, top: IMGH },
    ])
    .jpeg({ quality: 88 })
    .toFile(path.join(OUT, `${r}.jpg`));
  console.log(`  ${r}.jpg`);
  await clip(dubbed, r, 960, { audio: true });
}

async function trailer() {
  const r = "storyboard-to-trailer";
  const cut = src(r, "trailer");
  const scored = src(r, "scored");
  // The scored file runs as long as the music bed, which is longer than the
  // cut; trim it back to the video the Concat node produced.
  const seconds = Number(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of",
       "default=nw=1:nk=1", cut],
      { encoding: "utf8" },
    ).trim(),
  );
  const marks = [2, 7, 12, 17].filter((t) => t < seconds);
  await sheet(
    marks.map((t, i) => ({
      file: frame(cut, t),
      label: `shot ${i + 1}`,
    })),
    2,
    path.join(OUT, `${r}.jpg`),
  );
  await clip(scored, r, 960, { audio: true, trim: seconds });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, build] of [
    ["ecommerce-sku-visual-factory", ecommerce],
    ["viral-video-ad-engine", adEngine],
    ["multilingual-video-dubber", dubber],
    ["storyboard-to-trailer", trailer],
  ]) {
    if (ONLY && !name.includes(ONLY)) continue;
    if (!fs.existsSync(path.join(WORK, name))) {
      console.log(`${name}: not rendered, skipping`);
      continue;
    }
    console.log(name);
    await build();
  }
}

await main();
