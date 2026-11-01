#!/usr/bin/env node
// Golden import (DESIGN.md Q1): renders a media fixture through
// `nodetool timeline render --stills`, the export path the native preview is
// compared against.
//
// `timeline render` resolves clip media only through the local asset store, so
// the script:
//   1. validates the fixture with the protocol's Zod schema,
//   2. imports each clip's `mediaPath` file as an asset into a scratch store
//      (build/golden/store: its own SQLite file and asset folder, so the
//      user's NodeTool data is never touched),
//   It deletes only folders it created (they hold a marker file), and it
//   refuses an --out that overlaps the NodeTool data, asset or database
//   folder, the fixture folder, the sources (outside build/), or the repo.
//   3. writes a copy of the fixture with those asset ids as `currentAssetId`,
//   4. renders the chosen frames as PNG stills with that store,
//   5. fails unless every requested still exists and no clip was skipped.
//
// Usage (needs `npm run build:packages` and `scripts/make-fixtures.sh`):
//   node native/timeline/scripts/golden-import.mjs [fixture.json] [--frames 0,255,390] [--out DIR]
// Default fixture: native/timeline/fixtures/media-tracks.json.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "..", "..");

const CONTENT_TYPES = { ".mp4": "video/mp4", ".mov": "video/quicktime", ".png": "image/png", ".jpg": "image/jpeg", ".wav": "audio/wav" };

function parseArgs(argv) {
  const args = { fixture: path.join(root, "fixtures", "media-tracks.json"), frames: "0,255,390", out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--frames") args.frames = argv[++i];
    else if (argv[i] === "--out") args.out = path.resolve(argv[++i]);
    else args.fixture = path.resolve(argv[i]);
  }
  args.out ??= path.join(root, "build", "golden", path.basename(args.fixture, ".json"));
  return args;
}

function fail(message) {
  console.error(`golden-import: FAIL: ${message}`);
  process.exit(1);
}

// A folder the script creates holds this marker. The script deletes a folder
// only when the marker is in it, so it never removes data it did not write.
const OWNED_MARKER = ".golden-import-owned";

function inside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function overlaps(a, b) {
  return inside(a, b) || inside(b, a);
}

/** Empty `dir` for a new run: create it, or clear it only when this script owns it. */
function claimRunDir(dir) {
  if (fs.existsSync(dir)) {
    const entries = fs.readdirSync(dir);
    if (entries.length > 0 && !entries.includes(OWNED_MARKER)) {
      fail(`${dir} exists and was not created by golden-import (no ${OWNED_MARKER}). Choose an empty or new folder.`);
    }
    if (entries.includes(OWNED_MARKER)) fs.rmSync(dir, { recursive: true });
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, OWNED_MARKER), "golden-import run folder\n");
}

const args = parseArgs(process.argv.slice(2));
const store = path.join(root, "build", "golden", "store");

// The real NodeTool paths, read before this process points them at the store.
const { getNodetoolDataDir, getDefaultAssetsPath, getDefaultDbPath } = await import("@nodetool-ai/config");
const protectedPaths = [
  ["the NodeTool data folder", getNodetoolDataDir()],
  ["the NodeTool asset folder", getDefaultAssetsPath()],
  ["the NodeTool database folder", path.dirname(getDefaultDbPath())],
  ["the fixture folder", path.dirname(args.fixture)],
  ["the native/timeline sources", root],
  ["the repository", repoRoot]
];
for (const [label, protectedPath] of protectedPaths) {
  const resolved = path.resolve(protectedPath);
  // Only the build folder inside the sources may hold output.
  if (overlaps(args.out, resolved) && !inside(args.out, path.join(root, "build"))) {
    fail(`--out ${args.out} overlaps ${label} (${resolved}). Use a folder outside it.`);
  }
}
if (overlaps(args.out, store)) fail(`--out ${args.out} overlaps the scratch store ${store}`);

claimRunDir(store);
claimRunDir(args.out);
// Set before any NodeTool package reads its paths.
const storeEnv = { DB_PATH: path.join(store, "nodetool.sqlite3"), ASSET_FOLDER: path.join(store, "assets") };
Object.assign(process.env, storeEnv);

const { timelineSequenceResponse } = await import("@nodetool-ai/protocol/api-schemas/timeline.js");
const { getAssetFileName } = await import("@nodetool-ai/protocol");
const { assetObjectKey } = await import("@nodetool-ai/storage");
const { initDb, migrateSqliteDb, Asset } = await import("@nodetool-ai/models");

const doc = JSON.parse(fs.readFileSync(args.fixture, "utf8"));
const parsed = timelineSequenceResponse.safeParse(doc);
if (!parsed.success) {
  fail(`${args.fixture} is not a valid sequence: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
}

await migrateSqliteDb(storeEnv.DB_PATH);
initDb(storeEnv.DB_PATH);
const userId = "1"; // the user `timeline render` resolves assets for
const fixtureDir = path.dirname(args.fixture);
const imported = [];
for (const clip of doc.clips) {
  if (!clip.mediaPath) continue;
  const file = path.resolve(fixtureDir, clip.mediaPath);
  if (!fs.existsSync(file)) {
    fail(`${clip.id}: ${file} is missing. Run native/timeline/scripts/make-fixtures.sh first.`);
  }
  const contentType = CONTENT_TYPES[path.extname(file).toLowerCase()];
  if (!contentType) fail(`${clip.id}: no content type for ${file}`);
  const asset = await Asset.create({
    user_id: userId,
    name: path.basename(file),
    content_type: contentType,
    parent_id: null,
    project_id: "default",
    size: fs.statSync(file).size
  });
  const key = assetObjectKey(userId, getAssetFileName(asset.id, contentType));
  const dest = path.join(storeEnv.ASSET_FOLDER, key);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(file, dest);
  clip.currentAssetId = asset.id;
  delete clip.mediaPath; // prototype-only field
  imported.push({ clipId: clip.id, assetId: asset.id, file: path.relative(repoRoot, file) });
}
if (imported.length === 0) fail(`${args.fixture} has no clip with a mediaPath to import`);

const copy = path.join(args.out, `${path.basename(args.fixture, ".json")}.imported.json`);
fs.writeFileSync(copy, `${JSON.stringify(doc, null, 2)}\n`);

const stillsDir = path.join(args.out, "stills");
const requested = args.frames.split(",").filter((f) => f.trim() !== "").length;
let stdout;
try {
  stdout = execFileSync(
    "npm",
    ["run", "--silent", "dev:nodetool", "--", "timeline", "render", copy, "--stills", "--frames", args.frames, "--out", stillsDir, "--json"],
    { cwd: repoRoot, env: { ...process.env, ...storeEnv }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
} catch (error) {
  fail(`timeline render exited ${error.status}: ${String(error.stderr ?? "").trim().split("\n").slice(-5).join(" | ")}`);
}
const result = JSON.parse(stdout.slice(stdout.indexOf("{")));
const pngs = fs.existsSync(stillsDir) ? fs.readdirSync(stillsDir).filter((f) => f.endsWith(".png")) : [];

const summary = {
  fixture: path.relative(repoRoot, args.fixture),
  imported: imported.length,
  requestedFrames: requested,
  stills: pngs.length,
  skippedClips: result.skippedClips ?? [],
  out: path.relative(repoRoot, stillsDir)
};
console.log(JSON.stringify(summary));
if (pngs.length !== requested) fail(`expected ${requested} stills, found ${pngs.length}`);
if (summary.skippedClips.length > 0) fail(`render skipped clips: ${summary.skippedClips.join(", ")}`);
console.log("golden-import: PASS");
