// @ts-nocheck
/**
 * Generate `marketing/src/data/providerCatalog.generated.ts` — per-provider
 * model catalogs for the `/providers/<slug>` landing pages.
 *
 * The catalog is derived from the same node-package manifests
 * `nodetool generate <provider> --list-models` reads
 * (`packages/<provider>-nodes/src/<provider>-manifest.json`), so the model
 * counts, modality breakdown, and highlighted model ids on each landing page
 * match what the provider actually serves. Never hand-write this file.
 *
 * Run: `node marketing/scripts/generate-provider-catalog.mjs`
 * (wired as `npm run seo:provider-catalog`). Pass `--check` to fail when the
 * checked-in file is stale (CI guard).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const OUT = resolve(
  __dirname,
  "..",
  "src",
  "data",
  "providerCatalog.generated.ts"
);

/**
 * Providers whose node package ships a model manifest — the exact set
 * `generate --list-models` can enumerate. `id` is the runtime provider id
 * (matches `providerDisplay.ts`).
 */
const PROVIDERS = [
  { id: "fal_ai", manifest: "packages/fal-nodes/src/fal-manifest.json" },
  {
    id: "replicate",
    manifest: "packages/replicate-nodes/src/replicate-manifest.json",
  },
  { id: "kie", manifest: "packages/kie-nodes/src/kie-manifest.json" },
  {
    id: "together",
    manifest: "packages/together-nodes/src/together-manifest.json",
  },
  {
    id: "atlascloud",
    manifest: "packages/atlascloud-nodes/src/atlascloud-manifest.json",
  },
  { id: "topaz", manifest: "packages/topaz-nodes/src/topaz-manifest.json" },
];

/** Normalize a manifest `outputType` to a user-facing model kind. */
const KIND_BY_OUTPUT = {
  image: "image",
  dict: "image", // fal returns some image endpoints as a dict payload
  video: "video",
  audio: "audio",
  model_3d: "3d",
  str: "text",
  string: "text",
  text: "text",
};

/** Display order + label for kinds. */
const KIND_ORDER = ["image", "video", "audio", "3d", "text"];

/** Max highlighted models per kind, per provider — keeps the file sane. */
const CAP_PER_KIND = { image: 40, video: 40, audio: 24, "3d": 16, text: 8 };

function nodeId(n) {
  return n.modelId ?? n.endpointId ?? "";
}
function rawName(n) {
  return n.title ?? n.className ?? "";
}
function rawDesc(n) {
  return n.description ?? n.docstring ?? "";
}
function rawTags(n) {
  if (Array.isArray(n.tags) && n.tags.length) return n.tags;
  if (Array.isArray(n.supportedTasks) && n.supportedTasks.length)
    return n.supportedTasks;
  if (typeof n.modality === "string" && n.modality) return [n.modality];
  return [];
}

/** camelCase / snake / kebab → "Title Case" display name. */
function prettyName(name) {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/** First sentence of a docstring, trimmed and length-capped. */
function shortDesc(desc) {
  const flat = desc.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const firstSentence = flat.split(/(?<=[.!?])\s/)[0] ?? flat;
  const out = firstSentence.length > 150 ? flat : firstSentence;
  return out.length > 160 ? `${out.slice(0, 157).trimEnd()}…` : out;
}

function cleanTag(t) {
  return prettyName(String(t)).toLowerCase();
}

/**
 * Locale-independent string comparison (code-unit order). `String.localeCompare`
 * tie-breaks differently across runtime locales, which would make the generated
 * file's ordering non-deterministic and fail the CI staleness check on some
 * runners.
 */
function byCodeUnit(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Load a manifest; return [] if the package isn't checked out. */
function loadManifest(relPath) {
  try {
    const data = JSON.parse(readFileSync(resolve(REPO_ROOT, relPath), "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function buildCatalog() {
  const catalog = {};
  for (const { id, manifest } of PROVIDERS) {
    const nodes = loadManifest(manifest);
    const counts = {};
    const tagCounts = {};
    const byKind = {};
    for (const n of nodes) {
      const kind = KIND_BY_OUTPUT[n.outputType];
      if (!kind) continue; // skip utility outputs (any, model refs, …)
      counts[kind] = (counts[kind] ?? 0) + 1;
      for (const t of rawTags(n)) {
        const tag = cleanTag(t);
        if (tag) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
      }
      const rid = nodeId(n);
      if (!rid) continue;
      (byKind[kind] ??= []).push({
        id: rid,
        name: prettyName(rawName(n)) || rid,
        kind,
        desc: shortDesc(rawDesc(n)),
        tags: rawTags(n).map(cleanTag).filter(Boolean).slice(0, 3),
      });
    }

    // Highlighted models: cap per kind, sorted by id for stable output.
    const models = [];
    for (const kind of KIND_ORDER) {
      const bucket = (byKind[kind] ?? []).sort((a, b) =>
        byCodeUnit(a.id, b.id)
      );
      models.push(...bucket.slice(0, CAP_PER_KIND[kind] ?? 20));
    }

    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1] || byCodeUnit(a[0], b[0]))
      .slice(0, 12)
      .map(([t]) => t);

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    catalog[id] = {
      id,
      total,
      counts,
      topTags,
      models,
    };
  }
  return catalog;
}

function render(catalog) {
  const body = Object.entries(catalog)
    .map(([id, c]) => `  ${JSON.stringify(id)}: ${JSON.stringify(c, null, 2).replace(/\n/g, "\n  ")},`)
    .join("\n");

  return `// AUTO-GENERATED by marketing/scripts/generate-provider-catalog.mjs — do not edit by hand.
// Regenerate: node marketing/scripts/generate-provider-catalog.mjs
//
// Per-provider model catalog derived from the node-package manifests
// \`generate <provider> --list-models\` reads. \`counts\` are the full modality
// totals; \`models\` is a capped, stable highlight set for the landing page.

export type ProviderModelKind = "image" | "video" | "audio" | "3d" | "text";

export interface ProviderCatalogModel {
  /** Serving model id (e.g. "fal-ai/flux/schnell") — what you pass at call time. */
  id: string;
  name: string;
  kind: ProviderModelKind;
  desc: string;
  tags: string[];
}

export interface ProviderCatalog {
  id: string;
  /** Total supported models across all modalities. */
  total: number;
  /** Count per modality (full totals, not capped). */
  counts: Partial<Record<ProviderModelKind, number>>;
  /** Most common capability tags across the provider's models. */
  topTags: string[];
  /** Highlighted models, capped per modality for the page. */
  models: ProviderCatalogModel[];
}

export const providerCatalog: Record<string, ProviderCatalog> = {
${body}
};
`;
}

function main() {
  const check = process.argv.includes("--check");
  const catalog = buildCatalog();
  const out = render(catalog);

  if (check) {
    let current = "";
    try {
      current = readFileSync(OUT, "utf8");
    } catch {
      // missing file → stale
    }
    if (current !== out) {
      console.error(
        `[provider-catalog] ${OUT} is stale. Run: npm run seo:provider-catalog`
      );
      process.exit(1);
    }
    console.log("[provider-catalog] up to date.");
    return;
  }

  writeFileSync(OUT, out);
  const providers = Object.keys(catalog).length;
  const total = Object.values(catalog).reduce((a, c) => a + c.total, 0);
  const shown = Object.values(catalog).reduce((a, c) => a + c.models.length, 0);
  console.log(
    `Wrote ${OUT} — ${providers} providers, ${total} models (${shown} highlighted).`
  );
}

main();
