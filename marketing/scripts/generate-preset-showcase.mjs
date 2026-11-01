// Generates marketing/src/data/presetShowcase.generated.ts from the preset
// catalogue (packages/presets/catalog) and its run records
// (packages/presets/runs).
//
// Regenerate: npm run gen:presets        Verify: npm run gen:presets -- --check
//
// A run record holds local paths and Dreamina credits next to the facts the
// page may show. The page data is built from an allow-list of fields, so
// `output_path`, `credits`, `cost_usd`, the prompt and the workflow graph never
// reach the generated file. Dreamina credits are not a list price.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARKETING = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(MARKETING, "..");
const DEFAULT_PRESETS_DIR = path.join(REPO_ROOT, "packages/presets");
const DEFAULT_OUT_FILE = path.join(
  MARKETING,
  "src/data/presetShowcase.generated.ts"
);

/** Kinds that carry previews. Studios are bundles of presets and have none. */
const SHOWCASE_KINDS = ["camera", "effect", "look"];

/**
 * Display names for the model ids the run records name, from
 * packages/runtime/src/providers/dreamina-models.ts. An id without a name here
 * fails the generator so a new model is labelled on purpose.
 */
const MODEL_LABELS = {
  dreamina_seedance_45_pro_draft: "Dreamina Seedance 2.5 (for preview)",
  dreamina_seedance_45_pro: "Dreamina Seedance 2.5",
  dreamina_gpt_image_2_5_sunburst: "GPT Image 2.5 Sunburst"
};

const PROVIDER_LABELS = { dreamina: "Dreamina" };

/** The node that does the generating, and the mode its type means. */
const GENERATE_NODES = {
  "nodetool.video.ImageToVideo": "image_to_video",
  "nodetool.video.ReferenceToVideo": "reference_to_video",
  "nodetool.image.ImageToImage": "image_edit"
};

const SUPABASE_PREVIEW_PATH = /\/presets\/([a-z0-9.-]+)\/[0-9a-f]{64}\.mp4$/;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function jsonFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => path.join(dir, name));
}

function requireHttps(id, field, value) {
  if (typeof value !== "string" || !value.startsWith("https://")) {
    throw new Error(`${id}: preview.${field} must be an https URL`);
  }
  return value;
}

/** The fields of the run record's generate node that the page may show. */
function generateNode(id, run) {
  const nodes = run.workflow?.nodes ?? [];
  const found = nodes.filter((node) => node.type in GENERATE_NODES);
  if (found.length !== 1) {
    throw new Error(
      `${id}: expected one generate node in the run record, found ${found.length}`
    );
  }
  return found[0];
}

/**
 * The catalogue id a restyle's reference video came from. Dreamina has no
 * video-to-video mode, so a restyle renders as reference-to-video from another
 * preset's published preview.
 */
function referenceSource(id, run, catalogIds) {
  const match = SUPABASE_PREVIEW_PATH.exec(run.source_url ?? "");
  if (!match || !catalogIds.has(match[1])) {
    throw new Error(
      `${id}: source_url does not point at a published preset preview`
    );
  }
  return match[1];
}

export function buildShowcase(presetsDir = DEFAULT_PRESETS_DIR) {
  const catalogDir = path.join(presetsDir, "catalog");
  const runsDir = path.join(presetsDir, "runs");
  const catalog = SHOWCASE_KINDS.flatMap((kind) =>
    jsonFiles(path.join(catalogDir, kind)).map(readJson)
  );
  const catalogIds = new Set(catalog.map((preset) => preset.id));

  const entries = [];
  for (const preset of catalog) {
    const { id, kind, preview } = preset;
    if (!preview) {
      continue;
    }
    const runFile = path.join(presetsDir, preview.run ?? "");
    if (!preview.run || !fs.existsSync(runFile)) {
      throw new Error(`${id}: preview.run names a missing run record`);
    }
    const run = readJson(runFile);
    if (run.id !== id || run.status !== "completed") {
      throw new Error(`${id}: run record is not a completed run of this preset`);
    }
    const modelLabel = MODEL_LABELS[run.model];
    const providerLabel = PROVIDER_LABELS[run.provider];
    if (!modelLabel || !providerLabel) {
      throw new Error(
        `${id}: no display name for ${run.provider}/${run.model}; add it to the generator`
      );
    }
    const node = generateNode(id, run);
    const mode = GENERATE_NODES[node.type];
    const sourcePreset =
      mode === "reference_to_video"
        ? referenceSource(id, run, catalogIds)
        : null;
    const resolution =
      typeof node.data?.resolution === "string" ? node.data.resolution : null;

    entries.push({
      id,
      kind,
      name: preset.name,
      description: preset.description,
      slot: preset.slot,
      mode,
      provider: providerLabel,
      model: modelLabel,
      modelId: run.model,
      resolution,
      sourcePreset,
      previewUrl: requireHttps(id, "url", preview.url),
      posterUrl: requireHttps(id, "poster", preview.poster)
    });
  }
  return entries;
}

export function renderModule(entries) {
  return `// Generated by scripts/generate-preset-showcase.mjs. Do not edit by hand.
// Run \`npm run gen:presets\` after changing packages/presets/catalog or runs.

export const presetShowcaseEntries = ${JSON.stringify(entries, null, 2)} as const;
`;
}

function parseArgs(argv) {
  const value = (flag) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : path.resolve(argv[index + 1]);
  };
  return {
    check: argv.includes("--check"),
    presetsDir: value("--presets-dir") ?? DEFAULT_PRESETS_DIR,
    outFile: value("--out") ?? DEFAULT_OUT_FILE
  };
}

function main() {
  const { check, presetsDir, outFile } = parseArgs(process.argv.slice(2));
  const entries = buildShowcase(presetsDir);
  if (entries.length === 0) {
    throw new Error("generate-preset-showcase: no preset with a preview found");
  }
  const next = renderModule(entries);
  const relative = path.relative(REPO_ROOT, outFile);
  if (check) {
    const current = fs.existsSync(outFile)
      ? fs.readFileSync(outFile, "utf8")
      : "";
    if (current !== next) {
      console.error(
        `${relative} is stale. Run 'npm run gen:presets' in marketing/ and commit the result.`
      );
      process.exit(1);
    }
    console.log(`${relative} is up to date (${entries.length} presets).`);
    return;
  }
  fs.writeFileSync(outFile, next);
  console.log(`Wrote ${entries.length} presets to ${relative}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
