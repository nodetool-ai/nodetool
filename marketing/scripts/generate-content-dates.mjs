#!/usr/bin/env node
// Writes src/data/contentDates.generated.ts: the day each capability page and
// storyboard page last changed, and the day each published film was added.
//
// Dates come from commits, never from the build clock. A page's entry holds a
// hash of its source files next to its date. When the hash still matches, the
// date is kept. When it changed, the date becomes the last commit that touched
// those files, or today when the files have uncommitted edits (the change is
// being committed now). A film's date is the commit that first added it and
// never moves.
//
// --check needs no git history: it recomputes the hashes and fails when one
// differs, so CI's shallow checkout can run it. Writing needs full history
// (`git fetch --unshallow`), and the script refuses to write from a shallow
// clone because the oldest reachable commit would stand in for older dates.
//
//   node scripts/generate-content-dates.mjs          # update the file
//   node scripts/generate-content-dates.mjs --check  # fail on drift

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MARKETING = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(MARKETING, "..");
const OUT = path.join(MARKETING, "src/data/contentDates.generated.ts");
const BUNDLES = "packages/base-nodes/nodetool/examples/storyboards";
const AD_VIDEOS = "marketing/public/ad-library/videos";
const CHECK = process.argv.includes("--check");

/** Route → the repository paths whose content is the page. */
const ROUTE_SOURCES = {
  "/agents": ["marketing/src/app/agents", "marketing/src/components/agents", "marketing/src/data/agentsPage.ts"],
  "/marketing": ["marketing/src/app/marketing", "marketing/src/data/marketingPage.ts"],
  "/gamedev": ["marketing/src/app/gamedev/page.tsx", "marketing/src/data/gamedevPage.ts"],
  "/gamedev/ai-game-engines": ["marketing/src/app/gamedev/ai-game-engines", "marketing/src/data/gameEngineComparison.ts"],
  "/ai-video-editor": ["marketing/src/app/ai-video-editor", "marketing/src/data/videoEditorPage.ts"],
  "/ai-image-editor": ["marketing/src/app/ai-image-editor", "marketing/src/data/imageEditorPage.ts"],
  "/mcp": ["marketing/src/app/mcp", "marketing/src/data/mcpPage.ts"],
  "/developers": ["marketing/src/app/developers", "marketing/src/components/developers"],
  "/studio": ["marketing/src/app/studio", "marketing/src/data/studioPage.ts"],
  "/storyboards": ["marketing/src/app/storyboards/page.tsx", "marketing/src/data/storyboards.ts"],
};

function git(args) {
  return execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
}

function filesUnder(rel) {
  const abs = path.join(REPO, rel);
  if (!fs.existsSync(abs)) {
    throw new Error(`generate-content-dates: ${rel} does not exist`);
  }
  if (fs.statSync(abs).isFile()) {
    return [rel];
  }
  return fs
    .readdirSync(abs, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(REPO, path.join(entry.parentPath, entry.name)))
    .sort();
}

function hashOf(paths) {
  const hash = crypto.createHash("sha256");
  for (const file of paths.flatMap(filesUnder).sort()) {
    hash.update(file.split(path.sep).join("/"));
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(REPO, file)));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

function lastChanged(paths) {
  if (git(["status", "--porcelain", "--", ...paths]) !== "") {
    return new Date().toISOString().slice(0, 10);
  }
  return git(["log", "-1", "--format=%cs", "--", ...paths]);
}

function firstAdded(file) {
  const dates = git(["log", "--diff-filter=A", "--follow", "--format=%cs", "--", file]).split("\n");
  return dates[dates.length - 1];
}

function readCurrent() {
  if (!fs.existsSync(OUT)) {
    return { routes: {}, films: {} };
  }
  const text = fs.readFileSync(OUT, "utf8");
  const json = text.slice(text.indexOf("= {") + 2, text.lastIndexOf("}") + 1);
  return JSON.parse(json);
}

const storyboardSlugs = fs
  .readdirSync(path.join(REPO, BUNDLES))
  .filter((name) => name.endsWith(".storyboard.json"))
  .map((name) => name.replace(/\.storyboard\.json$/, ""))
  .sort();
const adSlugs = fs
  .readdirSync(path.join(REPO, AD_VIDEOS))
  .filter((name) => name.endsWith(".mp4"))
  .map((name) => name.replace(/\.mp4$/, ""))
  .sort();

const sources = { ...ROUTE_SOURCES };
for (const slug of storyboardSlugs) {
  sources[`/storyboards/${slug}`] = [`${BUNDLES}/${slug}.storyboard.json`];
}
const filmFiles = {
  ...Object.fromEntries(storyboardSlugs.map((slug) => [`storyboard:${slug}`, `${BUNDLES}/${slug}.storyboard.json`])),
  ...Object.fromEntries(adSlugs.map((slug) => [`ad:${slug}`, `${AD_VIDEOS}/${slug}.mp4`])),
};

const current = readCurrent();
const routes = {};
const films = {};
const stale = [];

for (const [route, paths] of Object.entries(sources)) {
  const hash = hashOf(paths);
  const recorded = current.routes[route];
  if (recorded?.hash === hash) {
    routes[route] = recorded;
    continue;
  }
  stale.push(route);
  if (!CHECK) {
    routes[route] = { date: lastChanged(paths), hash };
  }
}
for (const [key, file] of Object.entries(filmFiles)) {
  if (current.films[key]) {
    films[key] = current.films[key];
    continue;
  }
  stale.push(key);
  if (!CHECK) {
    films[key] = firstAdded(file);
  }
}
const removed = [
  ...Object.keys(current.routes).filter((route) => !(route in sources)),
  ...Object.keys(current.films).filter((key) => !(key in filmFiles)),
];

if (CHECK) {
  const drift = [...stale, ...removed];
  if (drift.length > 0) {
    console.error(
      `generate-content-dates: ${drift.length} stale entr${drift.length === 1 ? "y" : "ies"}: ${drift.join(", ")}.\n` +
        "Run `node scripts/generate-content-dates.mjs` in marketing/ with full git history and commit the result."
    );
    process.exit(1);
  }
  console.log(`generate-content-dates: ${Object.keys(sources).length} routes and ${Object.keys(filmFiles).length} films up to date`);
  process.exit(0);
}

if (stale.length > 0 && git(["rev-parse", "--is-shallow-repository"]) === "true") {
  console.error("generate-content-dates: this clone is shallow, so commit dates are unreliable. Run `git fetch --unshallow` first.");
  process.exit(1);
}

const body = JSON.stringify({ routes, films }, null, 2);
fs.writeFileSync(
  OUT,
  `// Generated by scripts/generate-content-dates.mjs. Do not edit by hand.\n` +
    `// Dates are commit days. See the script header for how they are chosen.\n\n` +
    `export const contentDates: {\n` +
    `  routes: Record<string, { date: string; hash: string }>;\n` +
    `  films: Record<string, string>;\n` +
    `} = ${body};\n`
);
console.log(`generate-content-dates: wrote ${Object.keys(routes).length} routes and ${Object.keys(films).length} films (${stale.length} updated)`);
