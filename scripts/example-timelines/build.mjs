// Build the shipped example timelines through the QuickJS sandbox.
//
// `node scripts/example-timelines/build.mjs [slug…]` builds every slug in
// SLUGS, or the ones named. Each builder is a JS script body: it imports
// `@nodetool-ai/sandbox-timeline` (packages/sandbox-packs/sandbox-timeline),
// saves its cut through `nodetool.timelines`, and outputs the bundle's
// metadata with the timeline id. So the examples are authored through the
// pack and the API an agent uses, and a document they cannot express fails
// here.
//
// All builders run in one `nodetool jsscript run` against a scratch database,
// one block each, sharing one import of the pack. The document is read back
// from the database as stored, since a sandbox output is capped below a
// bundle's size, and the bundle is written to
// packages/base-nodes/nodetool/examples/timelines/<slug>.timeline.json —
// with its own builder script embedded as `document.source.code`, the same
// `{lang, code, bakedAt, scenes}` shape a live timeline carries after
// `set_timeline_code`, and the scene hashes computed with the same
// `hashSceneSubtree` a rebake merge checks against — so rebaking a shipped
// example reports zero conflicts.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { hashSceneSubtree } from "@nodetool-ai/timeline";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
const OUT_DIR = join(ROOT, "packages/base-nodes/nodetool/examples/timelines");
const SLUGS = ["kite", "prism", "t-minus-30", "tidewater", "voltra"];

const slugs = process.argv.length > 2 ? process.argv.slice(2) : SLUGS;
const unknown = slugs.filter((slug) => !SLUGS.includes(slug));
if (unknown.length) {
  console.error(`Unknown example ${unknown.join(", ")}. Known: ${SLUGS.join(", ")}.`);
  process.exit(1);
}

const PACK = "@nodetool-ai/sandbox-timeline";

/**
 * A builder as one block of the combined script: its import of the pack
 * becomes a destructure of the shared one, and its output is named by slug.
 */
function asBlock(slug) {
  const source = readFileSync(join(HERE, `${slug}.mjs`), "utf8")
    .replace(/^import (\{[^}]*\}) from "@nodetool-ai\/sandbox-timeline";$/m, "const $1 = __timeline;")
    .replace(/await output\("timeline",/, `await output(${JSON.stringify(slug)},`);
  return `{\n${source}\n}`;
}

const code = [`import * as __timeline from "${PACK}";`, ...slugs.map(asBlock)].join("\n");
const script = {
  name: "Example timelines",
  document: {
    schemaVersion: 1,
    description: "Builds the shipped example timelines through nodetool.timelines.",
    code,
    inputs: [],
    outputs: slugs.map((name) => ({ name, type: "any" })),
    packages: [],
    secrets: [],
    timeoutSeconds: 120,
    tests: []
  }
};

const scratch = mkdtempSync(join(tmpdir(), "example-timelines-"));
try {
  const scriptPath = join(scratch, "example-timelines.json");
  const dbPath = join(scratch, "db.sqlite3");
  writeFileSync(scriptPath, JSON.stringify(script));
  const run = spawnSync("npm", ["run", "-s", "dev:nodetool", "--", "jsscript", "run", scriptPath, "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, DB_PATH: dbPath, ASSET_FOLDER: join(scratch, "assets") }
  });
  let result;
  try {
    result = JSON.parse(run.stdout);
  } catch {
    console.error(run.stdout, run.stderr);
    process.exit(run.status || 1);
  }
  if (!result.ok) {
    for (const line of result.logs ?? []) console.error(typeof line === "string" ? line : JSON.stringify(line));
    console.error(result.error);
    process.exit(1);
  }
  const { initDb, TimelineSequence } = await import("@nodetool-ai/models");
  initDb(dbPath);
  for (const slug of slugs) {
    // The runner hands an `any` output back as its JSON text.
    const raw = result.outputs[slug];
    const { timeline_id: id, ...meta } = typeof raw === "string" ? JSON.parse(raw) : raw;
    const document = (await TimelineSequence.findById(id)).toDocument();

    // Embed the builder script as `document.source`, the same shape
    // `set_timeline_code` writes for a live timeline: the code, when it was
    // baked, and each scene's group id + subtree hash — so
    // `nodetool.timelines.code.rebake()` against a copy of this example
    // reports every scene untouched (zero conflicts) rather than treating
    // the shipped document as hand-edited.
    const code = readFileSync(join(HERE, `${slug}.mjs`), "utf8");
    const scenes = {};
    for (const clip of document.clips) {
      if (typeof clip.sourceScene === "string" && clip.sourceScene) {
        scenes[clip.sourceScene] = {
          groupId: clip.id,
          hash: hashSceneSubtree(document.clips, clip.id)
        };
      }
    }
    document.source = { lang: "js", code, bakedAt: new Date().toISOString(), scenes };

    const bundle = { ...meta, document };
    const out = join(OUT_DIR, `${slug}.timeline.json`);
    writeFileSync(out, `${JSON.stringify(bundle)}\n`);
    const { tracks, clips, markers } = bundle.document;
    console.log(`${slug}: ${clips.length} clips, ${tracks.length} tracks, ${markers.length} markers -> ${out}`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
