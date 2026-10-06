// Generates marketing/src/data/storyboardEntries.generated.ts from the shipped
// example storyboards, for the /storyboards overview and /storyboards/<slug>
// pages.
//
// Sources: the bundles in packages/base-nodes/nodetool/examples/storyboards/
// and, per bundle, the rendered film and shot stills in
// packages/base-nodes/nodetool/assets/nodetool-base/storyboards/<slug>/.
// A bundle without a rendered film gets no page.
//
// The script copies the stills to public/storyboards/<slug>/, extracts a poster
// from the film, and reads the film's dimensions and duration with ffprobe.
// The films themselves are served from the media bucket
// (MEDIA_BASE/showcase/storyboards/<slug>/<slug>.mp4), not from git.
//
// Regenerate with `npm run gen:storyboards`; verify drift with
// `npm run gen:storyboards -- --check`. Needs ffmpeg and ffprobe.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const MARKETING = path.resolve(__dirname, "..");
const BUNDLES = path.join(
  REPO_ROOT,
  "packages/base-nodes/nodetool/examples/storyboards"
);
const ASSETS = path.join(
  REPO_ROOT,
  "packages/base-nodes/nodetool/assets/nodetool-base/storyboards"
);
const PUBLIC_DIR = path.join(MARKETING, "public/storyboards");
const OUT_FILE = path.join(
  MARKETING,
  "src/data/storyboardEntries.generated.ts"
);
const MEDIA_BASE = "https://media.nodetool.ai/showcase/storyboards";
const CHECK = process.argv.includes("--check");

/** One category per storyboard, picked from its tags in this order. */
const CATEGORY_RULES = [
  ["advertising", "commercial"],
  ["nature", "nature"],
  ["animation", "animation"],
  ["film", "film"],
  ["action", "film"]
];

function categoryOf(tags) {
  for (const [tag, category] of CATEGORY_RULES) {
    if (tags.includes(tag)) {
      return category;
    }
  }
  return "film";
}

function sentence(text) {
  const clean = String(text).replace(/[-\s]+/g, " ").trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function jpegSize(file) {
  const out = execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0",
    file
  ])
    .toString()
    .trim();
  const [width, height] = out.split(",").map(Number);
  return { width, height };
}

function filmFacts(file) {
  const out = execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,duration",
    "-of",
    "json",
    file
  ]).toString();
  const stream = JSON.parse(out).streams[0];
  return {
    width: stream.width,
    height: stream.height,
    duration: Number(Number(stream.duration).toFixed(2))
  };
}

const entries = [];
const files = fs
  .readdirSync(BUNDLES)
  .filter((name) => name.endsWith(".storyboard.json"))
  .sort();

for (const name of files) {
  const slug = name.replace(/\.storyboard\.json$/, "");
  const film = path.join(ASSETS, slug, `${slug}.mp4`);
  if (!fs.existsSync(film)) {
    console.log(`skip ${slug}: no rendered film`);
    continue;
  }
  const bundle = JSON.parse(fs.readFileSync(path.join(BUNDLES, name), "utf8"));
  const doc = bundle.document;
  const facts = filmFacts(film);
  const outDir = path.join(PUBLIC_DIR, slug);
  fs.mkdirSync(outDir, { recursive: true });

  const posterFile = path.join(outDir, "poster.jpg");
  const posterWidth = facts.height > facts.width ? 720 : 1280;
  if (!CHECK || !fs.existsSync(posterFile)) {
    execFileSync("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-ss",
      "0.4",
      "-i",
      film,
      "-frames:v",
      "1",
      "-vf",
      `scale=${posterWidth}:-2`,
      "-q:v",
      "4",
      posterFile
    ]);
  }
  const poster = jpegSize(posterFile);

  const shots = doc.shots.map((shot, index) => {
    const stillName = path.basename(shot.keyframe.uri);
    const source = path.join(ASSETS, slug, stillName);
    fs.copyFileSync(source, path.join(outDir, stillName));
    const size = jpegSize(source);
    return {
      number: index + 1,
      title: sentence(shot.slug),
      action: shot.action,
      framing: sentence(shot.camera.framing),
      movement: sentence(shot.camera.movement),
      seconds: shot.duration_seconds,
      image: {
        src: `/storyboards/${slug}/${stillName}`,
        width: size.width,
        height: size.height
      }
    };
  });

  entries.push({
    slug,
    route: `/storyboards/${slug}`,
    title: bundle.name,
    description: bundle.description,
    brief: doc.brief,
    style: doc.style,
    tags: bundle.tags,
    category: categoryOf(bundle.tags),
    aspectRatio: doc.aspectRatio,
    plannedSeconds: shots.reduce((sum, shot) => sum + shot.seconds, 0),
    bundle: name,
    video: {
      src: `${MEDIA_BASE}/${slug}/${slug}.mp4`,
      poster: {
        src: `/storyboards/${slug}/poster.jpg`,
        width: poster.width,
        height: poster.height
      },
      width: facts.width,
      height: facts.height,
      duration: facts.duration
    },
    shots
  });
}

const output = `// Generated by scripts/generate-storyboards.mjs. Do not edit by hand.
// Run \`npm run gen:storyboards\` after changing a storyboard bundle.

export const storyboardEntries = ${JSON.stringify(entries, null, 2)} as const;
`;

if (CHECK) {
  const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, "utf8") : "";
  if (current !== output) {
    console.error("storyboardEntries.generated.ts is out of date. Run npm run gen:storyboards.");
    process.exit(1);
  }
  console.log(`storyboard entries up to date (${entries.length})`);
} else {
  fs.writeFileSync(OUT_FILE, output);
  console.log(`wrote ${entries.length} storyboards`);
}
