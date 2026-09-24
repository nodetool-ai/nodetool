// Builds the shipped example storyboards.
//
// Input:  scripts/example-storyboards/boards.mjs — the curated spec
// Output: packages/base-nodes/nodetool/examples/storyboards/<slug>.storyboard.json
//         packages/base-nodes/nodetool/assets/nodetool-base/storyboards/<slug>/
//           <shot>.jpg (the still)
//
// An example storyboard is the storyboard twin of an example workflow: a file
// on disk, shipped with the app and the server image, that installs into a
// user's library. What makes it worth shipping is that the shots arrive
// finished — text and still — so the board demonstrates a directed
// sequence instead of an empty grid. The media are `package://` assets, the
// same constant-asset scheme example workflows use for their sample inputs, so
// one copy on disk serves every user and no bytes are written per install.
//
// The checked-in stills are rendered through `nodetool generate`. The default
// build preserves them. `--draw-stills` draws the spec's vector fallback when
// a new board has no generated media yet.
//
//   node scripts/build-example-storyboards.mjs           # build everything
//   node scripts/build-example-storyboards.mjs --check   # fail if a bundle would change
//   node scripts/build-example-storyboards.mjs --board sneaker-drop
//   node scripts/build-example-storyboards.mjs --draw-stills  # vector fallback
//
// `--check` compares the JSON bundles and asserts every referenced media file
// exists. It deliberately does not compare media bytes.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { EXAMPLE_STORYBOARDS } from "./example-storyboards/boards.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE = "nodetool-base";
const BUNDLES_OUT = path.join(
  ROOT,
  "packages/base-nodes/nodetool/examples/storyboards"
);
const ASSETS_OUT = path.join(
  ROOT,
  "packages/base-nodes/nodetool/assets",
  PACKAGE,
  "storyboards"
);

const BUNDLE_SCHEMA_VERSION = 1;
/** The still's pixel size. The frame space is 1600x900 regardless. */
const STILL = { width: 1280, height: 720 };
const FRAME_W = 1600;
const FRAME_H = 900;

const argv = process.argv.slice(2);
const args = new Set(argv);
const checkOnly = args.has("--check");
const drawStills = args.has("--draw-stills");
const onlyBoard = (() => {
  const at = argv.indexOf("--board");
  return at >= 0 ? argv[at + 1] : undefined;
})();

const fail = (message) => {
  console.error(`error: ${message}`);
  process.exit(1);
};

const slugify = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// ── Still rendering ─────────────────────────────────────────────────────────

const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** A smooth silhouette from `y` down to the floor, waving by `amp`. */
function ridgePath(y, amp) {
  const steps = 6;
  const dx = FRAME_W / steps;
  let d = `M0 ${y}`;
  for (let i = 0; i < steps; i += 1) {
    // Alternating control points give a rolling line without randomness, so
    // the same spec always draws the same ridge.
    const lift = i % 2 === 0 ? -amp : amp;
    d += ` Q ${dx * i + dx / 2} ${y + lift} ${dx * (i + 1)} ${y}`;
  }
  return `${d} L${FRAME_W} ${FRAME_H} L0 ${FRAME_H} Z`;
}

/** A light cone `length` long, opening by `spread` degrees around `angle`. */
function beamPath(x, y, angle, length, spread) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const a1 = rad(angle - spread);
  const a2 = rad(angle + spread);
  const p1 = [x + Math.cos(a1) * length, y + Math.sin(a1) * length];
  const p2 = [x + Math.cos(a2) * length, y + Math.sin(a2) * length];
  const round = (n) => Math.round(n * 100) / 100;
  return `M${x} ${y} L${round(p1[0])} ${round(p1[1])} L${round(p2[0])} ${round(p2[1])} Z`;
}

function frameSvg(layers, id) {
  const defs = [];
  const body = [];
  let n = 0;
  for (const layer of layers) {
    n += 1;
    const key = `${id}-${n}`;
    const opacity = layer.opacity ?? 1;
    switch (layer.kind) {
      case "sky": {
        const [top, mid, bottom] = layer.colors;
        defs.push(
          `<linearGradient id="g${key}" x1="0" y1="0" x2="0" y2="1">` +
            `<stop offset="0" stop-color="${esc(top)}"/>` +
            `<stop offset="0.55" stop-color="${esc(mid)}"/>` +
            `<stop offset="1" stop-color="${esc(bottom)}"/></linearGradient>`
        );
        body.push(
          `<rect width="${FRAME_W}" height="${FRAME_H}" fill="url(#g${key})" opacity="${opacity}"/>`
        );
        break;
      }
      case "glow": {
        defs.push(
          `<radialGradient id="g${key}">` +
            `<stop offset="0" stop-color="${esc(layer.color)}" stop-opacity="1"/>` +
            `<stop offset="1" stop-color="${esc(layer.color)}" stop-opacity="0"/></radialGradient>`
        );
        body.push(
          `<circle cx="${layer.x}" cy="${layer.y}" r="${layer.r}" fill="url(#g${key})" opacity="${opacity}"/>`
        );
        break;
      }
      case "disc":
        body.push(
          `<circle cx="${layer.x}" cy="${layer.y}" r="${layer.r}" fill="${esc(layer.color)}" opacity="${opacity}"/>`
        );
        break;
      case "band":
        body.push(
          `<rect x="0" y="${layer.y}" width="${FRAME_W}" height="${layer.h}" fill="${esc(layer.color)}" opacity="${opacity}"/>`
        );
        break;
      case "ridge":
        body.push(
          `<path d="${ridgePath(layer.y, layer.amp)}" fill="${esc(layer.color)}" opacity="${opacity}"/>`
        );
        break;
      case "poly":
        body.push(
          `<polygon points="${layer.points.map((p) => p.join(",")).join(" ")}" fill="${esc(layer.color)}" opacity="${opacity}"/>`
        );
        break;
      case "beam":
        body.push(
          `<path d="${beamPath(layer.x, layer.y, layer.angle, layer.length, layer.spread)}" fill="${esc(layer.color)}" opacity="${opacity}"/>`
        );
        break;
      case "vignette":
        defs.push(
          `<radialGradient id="g${key}">` +
            `<stop offset="0.45" stop-color="#000000" stop-opacity="0"/>` +
            `<stop offset="1" stop-color="#000000" stop-opacity="1"/></radialGradient>`
        );
        body.push(
          `<rect width="${FRAME_W}" height="${FRAME_H}" fill="url(#g${key})" opacity="${opacity}"/>`
        );
        break;
      default:
        fail(`unknown frame layer kind: ${layer.kind}`);
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME_W}" height="${FRAME_H}" ` +
    `viewBox="0 0 ${FRAME_W} ${FRAME_H}"><defs>${defs.join("")}</defs>${body.join("")}</svg>`
  );
}

// ── Bundles ─────────────────────────────────────────────────────────────────

const packageUri = (board, file) =>
  `package://${PACKAGE}/storyboards/${board.slug}/${file}`;

function buildShot(board, shot, index) {
  const name = slugify(shot.slug);
  if (!name) fail(`${board.slug}: shot ${index} has no slug to name its media after`);
  const stillFile = `${name}.jpg`;
  const keyframe = {
    type: "image",
    uri: packageUri(board, stillFile),
    asset_id: null
  };
  return {
    shot: {
      type: "shot",
      id: `${board.slug}-shot-${index + 1}`,
      index,
      slug: shot.slug,
      action: shot.action,
      camera: shot.camera,
      motion: shot.motion,
      duration_seconds: shot.durationSeconds,
      duration_source: "manual",
      entity_ids: [],
      keyframe,
      keyframe_versions: [keyframe],
      clip: null,
      clip_versions: [],
      status: "keyframe_ready"
    },
    media: { stillFile }
  };
}

function buildBundle(board) {
  const built = board.shots.map((shot, index) => buildShot(board, shot, index));
  const shots = built.map((entry) => entry.shot);
  return {
    bundle: {
      schemaVersion: BUNDLE_SCHEMA_VERSION,
      name: board.name,
      description: board.description,
      tags: board.tags ?? [],
      document: {
        screenplay: {
          type: "screenplay",
          id: `${board.slug}-screenplay`,
          title: board.name,
          brief: board.brief,
          style_bible: board.style,
          aspect_ratio: board.aspectRatio,
          script_id: null,
          shots
        },
        shots,
        brief: board.brief,
        style: board.style,
        entityIds: [],
        aspectRatio: board.aspectRatio,
        directorModel: null,
        imageModel: null,
        videoModel: null
      }
    },
    media: built.map((entry, index) => ({
      ...entry.media,
      frame: board.shots[index].frame
    }))
  };
}

// ── Build ───────────────────────────────────────────────────────────────────

async function main() {
  const boards = onlyBoard
    ? EXAMPLE_STORYBOARDS.filter((board) => board.slug === onlyBoard)
    : EXAMPLE_STORYBOARDS;
  if (boards.length === 0) {
    fail(`no example storyboard named "${onlyBoard}"`);
  }

  const slugs = new Set();
  for (const board of EXAMPLE_STORYBOARDS) {
    if (slugs.has(board.slug)) fail(`duplicate board slug: ${board.slug}`);
    slugs.add(board.slug);
  }

  // Drawing is an explicit fallback. The default build keeps CLI-rendered stills.
  const renderMedia = drawStills && !checkOnly;
  const { default: sharp } = renderMedia
    ? await import("sharp")
    : { default: null };

  let changed = 0;
  for (const board of boards) {
    const { bundle, media } = buildBundle(board);
    const bundleFile = path.join(BUNDLES_OUT, `${board.slug}.storyboard.json`);
    const serialized = `${JSON.stringify(bundle, null, 2)}\n`;
    const current = fs.existsSync(bundleFile)
      ? fs.readFileSync(bundleFile, "utf8")
      : null;

    if (checkOnly) {
      if (current !== serialized) {
        changed += 1;
        console.error(
          `  DIFF  ${path.relative(ROOT, bundleFile)} — run node scripts/build-example-storyboards.mjs`
        );
      }
      for (const item of media) {
        const full = path.join(ASSETS_OUT, board.slug, item.stillFile);
        if (!fs.existsSync(full)) {
          changed += 1;
          console.error(`  MISSING  ${path.relative(ROOT, full)}`);
        }
      }
      continue;
    }

    fs.mkdirSync(BUNDLES_OUT, { recursive: true });
    fs.writeFileSync(bundleFile, serialized);

    if (renderMedia) {
      const dir = path.join(ASSETS_OUT, board.slug);
      fs.mkdirSync(dir, { recursive: true });
      for (const [index, item] of media.entries()) {
        const stillPath = path.join(dir, item.stillFile);
        const svg = frameSvg(item.frame, `${board.slug}-${index}`);
        await sharp(Buffer.from(svg))
          .resize(STILL.width, STILL.height)
          .jpeg({ quality: 82, mozjpeg: true })
          .toFile(stillPath);
      }
    }
    console.log(
      `  ok    ${board.slug} — ${board.shots.length} shot(s)${renderMedia ? " (vector stills drawn)" : ""}`
    );
  }

  if (checkOnly && !onlyBoard) {
    // A board dropped from the spec leaves its file behind, and a stale file
    // still installs — the listing reads the directory, not the spec.
    const known = new Set(boards.map((board) => `${board.slug}.storyboard.json`));
    const orphans = (
      fs.existsSync(BUNDLES_OUT) ? fs.readdirSync(BUNDLES_OUT) : []
    ).filter((file) => file.endsWith(".storyboard.json") && !known.has(file));
    for (const file of orphans) {
      changed += 1;
      console.error(
        `  ORPHAN  ${path.relative(ROOT, path.join(BUNDLES_OUT, file))} — no board in the spec builds it`
      );
    }
  }

  if (checkOnly) {
    if (changed > 0) {
      console.error(`\n${changed} example storyboard file(s) are out of date.`);
      process.exit(1);
    }
    console.log(`${boards.length} example storyboard(s) are up to date.`);
  }
}

await main();
