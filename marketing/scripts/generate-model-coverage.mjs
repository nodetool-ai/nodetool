// @ts-nocheck
/**
 * Generate `marketing/src/data/modelProviderCoverage.generated.ts` — a map from
 * launch-model slug → the runtime provider ids that serve that model.
 *
 * Provider coverage is deliberately NOT hand-written: it's derived from the same
 * node-package manifests that `nodetool generate <provider> --list-models`
 * reads (`packages/<provider>-nodes/src/<provider>-manifest.json`). For each
 * launch model, a provider covers it when any image/video node in that
 * provider's manifest matches one of the model's id keywords.
 *
 * Run: `node marketing/scripts/generate-model-coverage.mjs`
 * (wired as `npm run seo:model-coverage`). CI fails if the checked-in file is
 * stale.
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
  "modelProviderCoverage.generated.ts"
);

/**
 * Providers whose node package ships a model manifest — the exact set
 * `generate --list-models` can enumerate. `id` is the runtime provider id.
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

/**
 * Launch models: slug (page route) → { kind, keywords }. `keywords` are matched
 * (lowercased, substring) against each manifest node's id and name. Keep this in
 * sync with the launch set in `marketing/src/data/modelEntries.ts`.
 */
const MODELS = {
  seedance: { kind: "video", keywords: ["seedance"] },
  "veo-3": { kind: "video", keywords: ["veo3", "veo-3", "veo 3"] },
  kling: { kind: "video", keywords: ["kling"] },
  sora: { kind: "video", keywords: ["sora"] },
  hailuo: { kind: "video", keywords: ["hailuo"] },
  wan: { kind: "video", keywords: ["wan-2", "wan2", "/wan", "wan-22"] },
  seedream: { kind: "image", keywords: ["seedream"] },
  flux: { kind: "image", keywords: ["flux"] },
  "gpt-image": { kind: "image", keywords: ["gpt-image", "gpt image"] },
  imagen: { kind: "image", keywords: ["imagen"] },
  "nano-banana": {
    kind: "image",
    keywords: ["nano-banana", "nano banana", "gemini-2.5-flash-image"],
  },
  // "recraft-v" and the version paths skip Recraft's utility nodes (remove
  // background, upscale, vectorize), which are not the image models.
  recraft: {
    kind: "image",
    keywords: ["recraft-v", "recraft/v3", "recraft/v4", "recraft-20b"],
  },
  ideogram: { kind: "image", keywords: ["ideogram"] },
  "qwen-image": { kind: "image", keywords: ["qwen-image"] },
  "stable-diffusion-3-5": {
    kind: "image",
    keywords: ["stable-diffusion-3.5", "stable-diffusion-3-5", "sd3.5"],
  },
  // "reve/" and "/reve" keep out words that merely contain "reve".
  reve: { kind: "image", keywords: ["reve/", "/reve"] },
  "krea-2": { kind: "image", keywords: ["krea-2", "krea 2"] },
  hidream: { kind: "image", keywords: ["hidream"] },
  "hunyuan-image": {
    kind: "image",
    keywords: ["hunyuan-image", "hunyuan image", "hunyuanimage"],
  },
  "grok-imagine-image": { kind: "image", keywords: ["grok-imagine-image"] },
  "gen4-image": { kind: "image", keywords: ["gen4-image", "gen4 image"] },
  riverflow: { kind: "image", keywords: ["riverflow"] },
  // Bria also ships eraser and background utilities, which are not listed.
  bria: {
    kind: "image",
    keywords: ["bria/fibo", "bria/image", "bria/text-to-image"],
  },
  "leonardo-ai": { kind: "image", keywords: ["leonardo"] },
  "minimax-image-01": { kind: "image", keywords: ["image-01"] },
  photon: { kind: "image", keywords: ["photon"] },
  "p-image": { kind: "image", keywords: ["p-image"] },
  "z-image": { kind: "image", keywords: ["z-image"] },
  "sana-sprint": { kind: "image", keywords: ["sana-sprint", "sana sprint"] },
  dreamina: { kind: "image", keywords: ["dreamina"] },
  bagel: { kind: "image", keywords: ["bagel"] },
  "retro-diffusion": {
    kind: "image",
    keywords: ["retro-diffusion", "retro diffusion"],
  },
  "ernie-image": { kind: "image", keywords: ["ernie-image"] },
  "mai-image": { kind: "image", keywords: ["mai-image"] },
  "uni-1": { kind: "image", keywords: ["uni-1"] },
  "muse-image": { kind: "image", keywords: ["muse-image"] },
};

/** outputType values that count for each model kind (mirrors buildImageModels/buildVideoModels). */
const KIND_OUTPUTS = {
  image: new Set(["image", "dict"]),
  video: new Set(["video"]),
};

function nodeId(n) {
  return n.modelId ?? n.endpointId ?? "";
}
function nodeName(n) {
  return n.title ?? n.className ?? "";
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

function main() {
  // provider id → { image: string[], video: string[] } of lowercased "id name"
  const haystacks = {};
  for (const { id, manifest } of PROVIDERS) {
    const nodes = loadManifest(manifest);
    const buckets = { image: [], video: [] };
    for (const n of nodes) {
      const out = n.outputType;
      const hay = `${nodeId(n)} ${nodeName(n)}`.toLowerCase();
      if (!hay.trim()) continue;
      if (KIND_OUTPUTS.image.has(out)) buckets.image.push(hay);
      if (KIND_OUTPUTS.video.has(out)) buckets.video.push(hay);
    }
    haystacks[id] = buckets;
  }

  const coverage = {};
  for (const [slug, { kind, keywords }] of Object.entries(MODELS)) {
    const kw = keywords.map((k) => k.toLowerCase());
    const providers = [];
    for (const { id } of PROVIDERS) {
      const hays = haystacks[id][kind] ?? [];
      const covered = hays.some((h) => kw.some((k) => h.includes(k)));
      if (covered) providers.push(id);
    }
    coverage[slug] = providers.sort();
  }

  const body = Object.entries(coverage)
    .map(([slug, ids]) => `  ${JSON.stringify(slug)}: ${JSON.stringify(ids)},`)
    .join("\n");

  const out = `// AUTO-GENERATED by marketing/scripts/generate-model-coverage.mjs — do not edit by hand.
// Regenerate: node marketing/scripts/generate-model-coverage.mjs
//
// Model slug → runtime provider ids that serve it, derived from the same
// node-package manifests \`generate <provider> --list-models\` reads.

export const modelProviderCoverage: Record<string, string[]> = {
${body}
};
`;

  writeFileSync(OUT, out);
  const total = Object.values(coverage).reduce((a, b) => a + b.length, 0);
  console.log(
    `Wrote ${OUT} — ${Object.keys(coverage).length} models, ${total} provider links.`
  );
}

main();
