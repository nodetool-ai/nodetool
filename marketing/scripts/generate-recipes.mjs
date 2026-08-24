// Generates marketing/src/data/recipeEntries.generated.ts and the downloadable
// .nodetool bundles in marketing/public/recipes/ from the editorial specs in
// scripts/recipes.mjs.
//
// Regenerate: npm run gen:recipes        Verify: npm run gen:recipes -- --check
//
// The generated module is checked in, so the site builds without this script.
// What the script adds is that a recipe cannot outlive its ingredients: every
// step is resolved against the shipped example workflows, and a slug that stops
// resolving throws here rather than shipping a page whose bundle is short a
// workflow. The models and API keys each recipe lists are read out of the
// graphs, never written by hand.
//
// The .nodetool bundles are NOT deterministic — packWorkflowsBundle stamps a
// created_at and the running NodeTool version into the manifest — so --check
// asserts that each bundle exists and holds the right workflows, and compares
// bytes only for the generated TypeScript.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
// The bundle codec, imported by source path rather than by the
// `@nodetool-ai/websocket` specifier: the package entry pulls in the whole
// Fastify server, and tsx would resolve the specifier to a stale `dist/`.
// The codec itself only needs fflate and node:crypto.
import { packWorkflowsBundle } from "../../packages/websocket/src/lib/workflow-bundle.ts";
import { recipes } from "./recipes.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARKETING = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(MARKETING, "..");
const EXAMPLES_DIR = path.join(
  REPO_ROOT,
  "packages/base-nodes/nodetool/examples/nodetool-base",
);
const TEMPLATE_ENTRIES = path.join(
  MARKETING,
  "src/data/templateEntries.generated.ts",
);
const BUNDLE_DIR = path.join(MARKETING, "public/recipes");
const SAMPLE_DIR = path.join(MARKETING, "public/recipes/samples");
const OUT_FILE = path.join(MARKETING, "src/data/recipeEntries.generated.ts");

const CHECK = process.argv.includes("--check");

/**
 * Stamped into each bundle manifest, matching what the CLI exporter writes.
 * The root package.json carries no version, so read the CLI's own — the same
 * file `cliVersion()` reads in packages/cli/src/nodetool.ts.
 */
const NODETOOL_VERSION = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "packages/cli/package.json"), "utf8"),
).version;

/** Runtime provider id to the env var NodeTool reads for BYOK. */
const PROVIDER_ENV = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  fal_ai: "FAL_API_KEY",
  replicate: "REPLICATE_API_TOKEN",
  kie: "KIE_API_KEY",
  elevenlabs: "ELEVENLABS_API_KEY",
  huggingface: "HF_TOKEN",
  together: "TOGETHER_API_KEY",
  atlascloud: "ATLASCLOUD_API_KEY",
  topaz: "TOPAZ_API_KEY",
};

function fail(message) {
  console.error(`generate-recipes: ${message}`);
  process.exit(1);
}

/** Parse the JSON array literal out of the generated templates module. */
function readTemplateEntries() {
  const src = fs.readFileSync(TEMPLATE_ENTRIES, "utf8");
  const start = src.indexOf("= [");
  const end = src.lastIndexOf("];");
  if (start < 0 || end < 0) {
    fail(`could not find the entries array in ${TEMPLATE_ENTRIES}`);
  }
  return JSON.parse(src.slice(start + 2, end + 1));
}

/**
 * Every {provider, model} a graph references, in first-seen order.
 *
 * A model reference is any object carrying a `provider` field — that covers a
 * top-level model property, one inside a settings object, and one nested in a
 * list, which is why this walks rather than reads known keys.
 */
function modelRefs(graph) {
  const seen = new Map();
  const walk = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    const provider = value.provider;
    if (typeof provider === "string" && provider) {
      const model = value.id ?? value.model ?? value.repo_id ?? value.name;
      if (typeof model === "string" && model) {
        const key = `${provider} ${model}`;
        if (!seen.has(key)) seen.set(key, { provider, model });
      }
    }
    for (const item of Object.values(value)) walk(item);
  };
  walk(graph);
  return [...seen.values()];
}

/**
 * Resolve a recipe's sample block, failing when a file it names is absent.
 *
 * A sample is the recipe actually run against live models, so the page must
 * not claim one that is not on disk: an <img> with a dead src still renders a
 * page, which is exactly the failure this catches at build time.
 */
function buildSample(spec) {
  if (!spec.sample) return null;
  const files = [spec.sample.image, spec.sample.poster].filter(Boolean);
  if (spec.sample.video) {
    files.push(spec.sample.video, spec.sample.video.replace(/\.mp4$/, ".webm"));
  }
  for (const file of files) {
    if (!fs.existsSync(path.join(SAMPLE_DIR, file))) {
      fail(
        `recipe "${spec.slug}" names sample file ${file}, which is not in ` +
          `public/recipes/samples/`,
      );
    }
  }
  const at = (file) => (file ? `/recipes/samples/${file}` : null);
  return {
    image: at(spec.sample.image),
    video: at(spec.sample.video),
    webm: spec.sample.video ? at(spec.sample.video.replace(/\.mp4$/, ".webm")) : null,
    poster: at(spec.sample.poster),
    hasAudio: spec.sample.hasAudio === true,
    caption: spec.sample.caption,
    producedBy: spec.sample.producedBy,
  };
}

/** Resolve one recipe spec into the record the page renders. */
function buildRecipe(spec, byTemplateSlug) {
  const steps = spec.steps.map((step) => {
    const entry = byTemplateSlug.get(step.template);
    if (!entry) {
      fail(
        `recipe "${spec.slug}" step "${step.template}" resolves to no shipped ` +
          "template. Run `npm run gen:templates` first; if the example was " +
          "renamed, update scripts/recipes.mjs.",
      );
    }
    const file = path.join(EXAMPLES_DIR, `${entry.name}.json`);
    if (!fs.existsSync(file)) {
      fail(`recipe "${spec.slug}": no example workflow at ${file}`);
    }
    const graph = JSON.parse(fs.readFileSync(file, "utf8")).graph ?? {};
    return {
      entry,
      file,
      step: {
        template: entry.slug,
        name: entry.name,
        route: entry.route,
        role: step.role,
        handoff: step.handoff,
        thumbnail: entry.thumbnail,
        nodeCount: entry.nodeCount,
        models: modelRefs(graph),
      },
    };
  });

  if (!steps.some((s) => s.entry.slug === spec.heroStep)) {
    fail(
      `recipe "${spec.slug}": heroStep "${spec.heroStep}" is not one of its steps`,
    );
  }

  const providers = [
    ...new Set(steps.flatMap((s) => s.step.models.map((m) => m.provider))),
  ];
  const unknown = providers.filter((p) => !PROVIDER_ENV[p]);
  if (unknown.length > 0) {
    fail(
      `recipe "${spec.slug}" uses provider(s) ${unknown.join(", ")} with no ` +
        "entry in PROVIDER_ENV — add the BYOK env var name.",
    );
  }

  return {
    files: steps.map((s) => s.file),
    record: {
      sample: buildSample(spec),
      route: `/recipes/${spec.slug}`,
      title: `${spec.name} — NodeTool Recipe`,
      description: spec.outcome,
      priority: 0.8,
      changeFrequency: "monthly",
      indexable: true,
      slug: spec.slug,
      name: spec.name,
      outcome: spec.outcome,
      audience: spec.audience,
      summary: spec.summary,
      caveats: spec.caveats,
      heroThumbnail: steps.find((s) => s.entry.slug === spec.heroStep).step
        .thumbnail,
      bundle: `/recipes/${spec.slug}.nodetool`,
      workflowCount: steps.length,
      nodeCount: steps.reduce((n, s) => n + s.step.nodeCount, 0),
      keys: providers.map((id) => ({ provider: id, env: PROVIDER_ENV[id] })),
      steps: steps.map((s) => s.step),
    },
  };
}

/**
 * Resolve a `package://<pkg>/<file>` ref to bytes on disk, so a bundle carries
 * the sample inputs a shipped example pins. Anything else (a per-install
 * `asset://`, a remote URL) resolves to null and stays a plain ref.
 */
async function fetchAssetBytes(ref) {
  const match = /^package:\/\/([^/]+)\/(.+)$/.exec(ref);
  if (!match) return null;
  const file = path.join(
    REPO_ROOT,
    "packages/base-nodes/nodetool",
    "assets",
    match[1],
    match[2],
  );
  if (!fs.existsSync(file)) return null;
  return new Uint8Array(fs.readFileSync(file));
}

/** The bundle payload for one example workflow file. */
function bundledWorkflow(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return {
    name: typeof raw.name === "string" ? raw.name : path.basename(file, ".json"),
    description: typeof raw.description === "string" ? raw.description : "",
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t) => typeof t === "string") : [],
    run_mode: raw.run_mode ?? null,
    settings: raw.settings ?? null,
    graph: raw.graph ?? raw,
  };
}

/** Pack one recipe's workflows into a portable .nodetool bundle. */
async function packBundle(slug, files) {
  const out = path.join(BUNDLE_DIR, `${slug}.nodetool`);
  const { bytes, manifest, skipped } = await packWorkflowsBundle({
    workflows: files.map(bundledWorkflow),
    fetchAssetBytes,
    nodetoolVersion: NODETOOL_VERSION,
  });
  for (const ref of skipped) {
    console.warn(`  warning: ${slug} could not embed ${ref} (left as a ref)`);
  }
  fs.writeFileSync(out, bytes);
  return manifest;
}

/** Names of the workflows inside an existing bundle, for --check. */
function bundledWorkflowNames(file) {
  const manifest = execFileSync("unzip", ["-p", file, "manifest.json"], {
    encoding: "utf8",
  });
  return JSON.parse(manifest).workflows.map((w) => w.name);
}

function render(records) {
  return `// AUTO-GENERATED by marketing/scripts/generate-recipes.mjs — do not edit by hand.
// Regenerate: npm run gen:recipes
//
// Editorial content (the prose) lives in marketing/scripts/recipes.mjs. Every
// other field here — models, keys, node counts, card art — is read out of the
// shipped example workflows each step names.
import type { RecipeEntry } from "./recipes";

export const recipeEntries: RecipeEntry[] = ${JSON.stringify(records, null, 2)};
`;
}

async function main() {
  const byTemplateSlug = new Map(readTemplateEntries().map((t) => [t.slug, t]));
  const slugs = new Set();
  for (const spec of recipes) {
    if (slugs.has(spec.slug)) fail(`duplicate recipe slug "${spec.slug}"`);
    slugs.add(spec.slug);
  }

  const built = recipes.map((spec) => buildRecipe(spec, byTemplateSlug));
  const source = render(built.map((b) => b.record));

  if (CHECK) {
    const current = fs.existsSync(OUT_FILE)
      ? fs.readFileSync(OUT_FILE, "utf8")
      : "";
    if (current !== source) {
      fail(
        `${path.relative(REPO_ROOT, OUT_FILE)} is stale — run \`npm run gen:recipes\``,
      );
    }
    for (const { record, files } of built) {
      const bundle = path.join(BUNDLE_DIR, `${record.slug}.nodetool`);
      if (!fs.existsSync(bundle)) {
        fail(
          `missing bundle ${path.relative(REPO_ROOT, bundle)} — run \`npm run gen:recipes\``,
        );
      }
      const want = files.map((f) => path.basename(f, ".json"));
      const have = bundledWorkflowNames(bundle);
      if (want.join("|") !== have.join("|")) {
        fail(
          `${record.slug}.nodetool holds [${have.join(", ")}] but the recipe ` +
            `names [${want.join(", ")}] — run \`npm run gen:recipes\``,
        );
      }
    }
    console.log(`generate-recipes: ${built.length} recipes up to date`);
    return;
  }

  fs.mkdirSync(BUNDLE_DIR, { recursive: true });
  for (const { record, files } of built) {
    const manifest = await packBundle(record.slug, files);
    console.log(
      `  ${record.slug}.nodetool — ${manifest.workflows.length} workflows, ` +
        `${manifest.assets.length} assets`,
    );
  }
  fs.writeFileSync(OUT_FILE, source);
  console.log(
    `generate-recipes: wrote ${built.length} recipes to ${path.relative(REPO_ROOT, OUT_FILE)}`,
  );
}

await main();
