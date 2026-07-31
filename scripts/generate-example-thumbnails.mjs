// Generates card art for shipped example workflows into
// packages/base-nodes/nodetool/assets/nodetool-base/<name>.jpg.
//
// The art gates marketing: generate-template-entries.mjs emits
// `indexable: false` for any example without a matching <name>.jpg, keeping
// its /templates page out of the sitemap and the smoke walk. So an example
// with no card is a page nobody finds.
//
// Two sources, in order of preference:
//
//   1. A real run output. Point --outputs at a directory of
//      "<Example Name>.(png|jpg|webp|mp4|mov)" files — the workspace of a
//      `nodetool workflows run` sweep, collected by name. The image (or the
//      first frame of the video) becomes the card, full bleed, with a
//      gradient scrim carrying the title. Showing what the workflow produced
//      beats any illustration of it.
//
//   2. A rendered card, when no output exists. Title, description and the
//      node pipeline, drawn from the workflow itself so it stays true to the
//      graph as the graph changes.
//
// Existing art is never overwritten; pass --force to rebuild it.
//
//   node scripts/generate-example-thumbnails.mjs
//   node scripts/generate-example-thumbnails.mjs --outputs /tmp/sweep --force

import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLES_DIR = path.join(
  REPO_ROOT,
  "packages/base-nodes/nodetool/examples/nodetool-base"
);
const ASSETS_DIR = path.join(
  REPO_ROOT,
  "packages/base-nodes/nodetool/assets/nodetool-base"
);

const W = 1280;
const H = 720;
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".webm"]);

/** Accent per primary tag, so a gallery row reads by kind at a glance. */
const ACCENT = {
  image: "#38bdf8",
  video: "#a78bfa",
  audio: "#34d399",
  text: "#fbbf24",
  data: "#f472b6"
};
const DEFAULT_ACCENT = "#818cf8";

function xml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Greedy wrap by character budget — close enough for a fixed card width. */
function wrap(text, width, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > width && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) return lines;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

/** Title block drawn over the bottom of a full-bleed output. */
function scrimOverlay(name, kicker, accent) {
  const lines = wrap(name, 30, 2);
  const top = H - 138;
  const titles = lines
    .map(
      (ln, i) =>
        `<text x="64" y="${top + 40 + i * 54}" font-family="DejaVu Sans, sans-serif" ` +
        `font-size="46" font-weight="700" fill="#eef0f5">${xml(ln)}</text>`
    )
    .join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs>
        <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.40" stop-color="#080a0f" stop-opacity="0"/>
          <stop offset="0.72" stop-color="#080a0f" stop-opacity="0.72"/>
          <stop offset="1" stop-color="#080a0f" stop-opacity="0.97"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#scrim)"/>
      <rect width="${W}" height="6" fill="${accent}"/>
      <text x="64" y="${H - 152}" font-family="DejaVu Sans, sans-serif" font-size="20"
        font-weight="700" letter-spacing="2" fill="${accent}">${xml(kicker.toUpperCase())}</text>
      ${titles}
    </svg>`
  );
}

/** Standalone card for an example with no captured output. */
function renderedCard(name, kicker, accent, description, steps) {
  const titleLines = wrap(name, 24, 2);
  const descLines = wrap(description, 52, 4);
  const titles = titleLines
    .map(
      (ln, i) =>
        `<text x="64" y="${168 + i * 62}" font-family="DejaVu Sans, sans-serif" ` +
        `font-size="52" font-weight="700" fill="#eef0f5">${xml(ln)}</text>`
    )
    .join("");
  const desc = descLines
    .map(
      (ln, i) =>
        `<text x="64" y="${168 + titleLines.length * 62 + 34 + i * 32}" ` +
        `font-family="DejaVu Sans, sans-serif" font-size="23" fill="#8c94a5">${xml(ln)}</text>`
    )
    .join("");

  // Pipeline chips: what the workflow is actually made of.
  let x = 64;
  const chips = [];
  const shownSteps = steps.slice(0, 5);
  for (const [i, step] of shownSteps.entries()) {
    const w = Math.min(260, 17 + step.length * 12);
    if (x + w > W - 64) break;
    chips.push(
      `<rect x="${x}" y="${H - 132}" width="${w}" height="46" rx="23"
         fill="#181b24" stroke="#333a49"/>
       <text x="${x + w / 2}" y="${H - 101}" text-anchor="middle"
         font-family="DejaVu Sans, sans-serif" font-size="19"
         fill="#c3cad8">${xml(step)}</text>`
    );
    x += w + 14;
    if (x < W - 120 && i < shownSteps.length - 1) {
      chips.push(
        `<text x="${x - 8}" y="${H - 101}" font-family="DejaVu Sans, sans-serif"
           font-size="19" fill="#5c6474">›</text>`
      );
      x += 18;
    }
  }

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs>
        <radialGradient id="glow" cx="0.82" cy="0.12" r="0.72">
          <stop offset="0" stop-color="${accent}" stop-opacity="0.5"/>
          <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="glow2" cx="0.04" cy="0.96" r="0.6">
          <stop offset="0" stop-color="${accent}" stop-opacity="0.22"/>
          <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="#0e1016"/>
      <rect width="${W}" height="${H}" fill="url(#glow)"/>
      <rect width="${W}" height="${H}" fill="url(#glow2)"/>
      <rect width="${W}" height="6" fill="${accent}"/>
      <text x="64" y="112" font-family="DejaVu Sans, sans-serif" font-size="20"
        font-weight="700" letter-spacing="2" fill="${accent}">${xml(kicker.toUpperCase())}</text>
      ${titles}${desc}${chips.join("")}
      <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="#2e3442"/>
    </svg>`
  );
}

/** First frame of a clip, as a temp PNG. */
async function firstFrame(videoPath) {
  const out = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "nt-thumb-")),
    "frame.png"
  );
  try {
    await execFileAsync("ffmpeg", [
      "-y", "-ss", "0.5", "-i", videoPath, "-frames:v", "1", out
    ]);
    return fs.existsSync(out) ? out : null;
  } catch {
    return null; // no ffmpeg, or an unreadable clip — fall through to a card
  }
}

/** Captured output for `name`, if the sweep directory holds one. */
async function outputFor(dir, name) {
  if (!dir) return null;
  for (const ext of [...IMAGE_EXT, ...VIDEO_EXT]) {
    const candidate = path.join(dir, `${name}${ext}`);
    if (!fs.existsSync(candidate)) continue;
    return VIDEO_EXT.has(ext) ? await firstFrame(candidate) : candidate;
  }
  return null;
}

async function main() {
  const argv = process.argv.slice(2);
  const force = argv.includes("--force");
  const outIdx = argv.indexOf("--outputs");
  const outputsDir = outIdx >= 0 ? argv[outIdx + 1] : null;

  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  let fromOutput = 0;
  let rendered = 0;
  let kept = 0;

  for (const file of fs.readdirSync(EXAMPLES_DIR).sort()) {
    if (!file.endsWith(".json")) continue;
    const name = file.slice(0, -5);
    const dest = path.join(ASSETS_DIR, `${name}.jpg`);
    if (fs.existsSync(dest) && !force) {
      kept += 1;
      continue;
    }

    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, file), "utf8"));
    } catch {
      continue;
    }
    const tags = (doc.tags ?? []).filter((t) => t !== "example");
    const kicker = tags[0] ?? "workflow";
    const accent = ACCENT[kicker] ?? DEFAULT_ACCENT;
    const steps = (doc.graph?.nodes ?? [])
      .map((n) => String(n.type ?? "").split(".").pop())
      .filter(Boolean);

    const output = await outputFor(outputsDir, name);
    if (output) {
      await sharp(output)
        .resize(W, H, { fit: "cover", position: "centre" })
        .composite([{ input: scrimOverlay(name, kicker, accent) }])
        .jpeg({ quality: 88 })
        .toFile(dest);
      fromOutput += 1;
    } else {
      await sharp(renderedCard(name, kicker, accent, doc.description ?? "", steps))
        .jpeg({ quality: 88 })
        .toFile(dest);
      rendered += 1;
    }
  }

  console.log(
    `card art — ${fromOutput} from run output, ${rendered} rendered, ${kept} already present`
  );
}

await main();
