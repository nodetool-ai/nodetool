// The price table behind the BYOK calculator
// (src/data/calculatorPricing.generated.ts).
//
// Every number comes from packages/model-pricing's generated GenSpend
// catalog — the same table NodeTool bills a run against — so the calculator
// quotes what a workflow actually costs rather than a figure typed into a
// marketing page. GenSpend requires attribution; ATTRIBUTION carries it.
//
// Usage:
//   node marketing/scripts/generate-calculator-pricing.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARKETING_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(MARKETING_ROOT, "..");
const SOURCE = path.join(
  REPO_ROOT,
  "packages/model-pricing/src/generated/genspend-pricing.json"
);
const OUT = path.join(MARKETING_ROOT, "src/data/calculatorPricing.generated.ts");

/** The three unit classes a creative workload is actually billed in. */
const CLASSES = {
  "per-image": "image",
  "per-video-second": "video",
  "per-1m-chars": "speech",
};

/** Providers NodeTool ships a node package for, in preference order. */
const PROVIDERS = [
  "fal_ai",
  "replicate",
  "kie",
  "openai",
  "gemini",
  "elevenlabs",
  "minimax",
  "together",
  "atlascloud",
];

/** How many models each modality offers in the picker. */
const PER_MODALITY = 18;

/** Words a slug spells in lower case that a reader expects in caps. */
const ACRONYMS = new Map(
  [
    "gpt", "ai", "sdxl", "sd", "hd", "tts", "stt", "llm", "xl", "3d", "hq",
    "pro", "ultra", "lite", "max", "mini", "turbo", "fast", "std", "std",
  ].map((w) => [w, w.length <= 4 && !"pro ultra lite max mini turbo fast".includes(w)
    ? w.toUpperCase()
    : w.charAt(0).toUpperCase() + w.slice(1)])
);

const titleCase = (slug) =>
  slug
    .split(/[-_/]/)
    .filter(Boolean)
    .map((w) => {
      const known = ACRONYMS.get(w.toLowerCase());
      if (known) return known;
      // Version-ish fragments read better untouched: "2.5", "v3", "20b".
      if (/^v?\d/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");

/**
 * One row per (provider, model), cheapest variant kept — a model's edit and
 * text-to-image entries are the same price to a person planning a month.
 */
function collapse(prices) {
  const byModel = new Map();
  for (const [key, price] of Object.entries(prices)) {
    const modality = CLASSES[price.unit_class];
    if (!modality) continue;
    if (!price.live || typeof price.unit_price !== "number") continue;
    const provider = key.slice(0, key.indexOf(":"));
    if (!PROVIDERS.includes(provider)) continue;
    const slug = price.model_slug ?? key.slice(key.indexOf(":") + 1);
    const id = `${provider}:${slug}:${modality}`;
    const seen = byModel.get(id);
    if (seen && seen.unitPrice <= price.unit_price) continue;
    byModel.set(id, {
      id,
      provider,
      modality,
      name: titleCase(slug),
      unitPrice: price.unit_price,
      sourceUrl: price.source_url ?? null,
    });
  }
  return [...byModel.values()];
}

/**
 * Keep the price *range* rather than the cheapest N: a calculator whose
 * picker holds eighteen budget models cannot show what a frontier month
 * costs. Always keeps the floor and the ceiling.
 */
function spread(rows, count) {
  const sorted = rows.sort((a, b) => a.unitPrice - b.unitPrice);
  if (sorted.length <= count) return sorted;
  const picked = [];
  for (let i = 0; i < count; i += 1) {
    const at = Math.round((i * (sorted.length - 1)) / (count - 1));
    if (!picked.includes(sorted[at])) picked.push(sorted[at]);
  }
  return picked;
}


/**
 * Weave model → the Kie or AtlasCloud entry that serves the same model.
 *
 * Only these two providers, so the comparison is like for like: the same
 * model, bought once as credits and once with your own key. A Weave model
 * absent here is absent on purpose — the reason is written next to it, and
 * `UNPAIRED` carries them to the page so it can say what it left out instead
 * of quietly showing a shorter list.
 *
 * Each value is a key in the GenSpend price table. The generator fails if one
 * does not resolve, so a catalog refresh that drops a model breaks the build
 * rather than silently dropping a row.
 */
const WEAVE_PAIRS = {
  // Images.
  "Flux 2 Pro": "kie:flux-2/pro-text-to-image",
  "Nano Banana 2": "kie:nano-banana-2",
  "Nano Banana Pro": "kie:nano-banana-pro",
  "GPT Image 1.5": "atlascloud:openai/gpt-image-1.5/text-to-image",
  // Weave lists "Seedream V5" unqualified, so pair it with the pro variant
  // rather than the cheaper lite one.
  "Seedream V5": "kie:seedream/5-pro-text-to-image",
  // Video.
  "Kling 3": "kie:kling-3.0/video",
  "Kling Motion Control": "kie:kling-3.0/motion-control",
  // Unqualified again: the full model, not veo3.1-fast or -lite.
  "Veo 3.1": "atlascloud:google/veo3.1/text-to-video",
  "Seedance 1.5": "kie:bytedance/seedance-1.5-pro",
  "Grok Imagine": "kie:grok-imagine-video-1-5-preview",
};

/** Weave models with no Kie or AtlasCloud equivalent, and why. */
const UNPAIRED = {
  "Flux Fast": "no Flux Fast tier on either provider",
  "Recraft V4": "neither provider serves Recraft",
  Mystic: "neither provider serves Freepik Mystic",
  "Qwen Multiangle": "both serve Qwen image models, none is the Multiangle variant",
  "Topaz Upscale": "neither provider serves Topaz",
  "Kling O1": "neither provider serves the O1 tier",
  "Runway Gen-4.5": "neither provider serves Runway models",
  "Wan 2.5": "both serve Wan 2.7, which is a different model",
  "Wan Animate": "neither provider serves Wan Animate",
  "Luma Ray 2": "neither provider serves Luma",
  "LTX 2": "neither provider serves LTX",
  "Hunyuan 3D V3": "3D, which the calculator does not cost",
  "Rodin V2": "3D, which the calculator does not cost",
};

/** Resolve every alias against the catalog, or fail saying which one broke. */
function buildPairs(prices) {
  const out = [];
  for (const [name, key] of Object.entries(WEAVE_PAIRS)) {
    const price = prices[key];
    if (!price || typeof price.unit_price !== "number") {
      throw new Error(
        `WEAVE_PAIRS["${name}"] points at "${key}", which the GenSpend catalog does not price. Re-check the alias.`
      );
    }
    const modality = CLASSES[price.unit_class];
    if (modality !== "image" && modality !== "video") {
      throw new Error(
        `WEAVE_PAIRS["${name}"] resolves to unit class "${price.unit_class}", which is neither an image nor a video price.`
      );
    }
    out.push({
      weaveName: name,
      modality,
      provider: key.slice(0, key.indexOf(":")),
      providerModelKey: key,
      unitPrice: price.unit_price,
      sourceUrl: price.source_url ?? null,
    });
  }
  return out;
}

const catalog = JSON.parse(await readFile(SOURCE, "utf8"));
const rows = collapse(catalog.prices);
const pairs = buildPairs(catalog.prices);
const byModality = {};
for (const modality of ["image", "video", "speech"]) {
  byModality[modality] = spread(
    rows.filter((r) => r.modality === modality),
    PER_MODALITY
  );
}

const counts = Object.fromEntries(
  Object.entries(byModality).map(([k, v]) => [k, v.length])
);
const total = rows.length;

const body = `// AUTO-GENERATED by marketing/scripts/generate-calculator-pricing.mjs — do not edit by hand.
// Regenerate: node marketing/scripts/generate-calculator-pricing.mjs
//
// Unit prices behind the BYOK calculator, read from the same generated
// GenSpend catalog NodeTool bills a run against
// (packages/model-pricing/src/generated/genspend-pricing.json). Picked to
// span each modality's price range, not to flatter it: the cheapest and the
// most expensive model in the catalog are both in the list.

/** What a model charges for. */
export type CalculatorModality = "image" | "video" | "speech";

export interface CalculatorModel {
  /** \`provider:model:modality\` — stable across regenerations. */
  id: string;
  /** Runtime provider id; look up display metadata in PROVIDER_DISPLAY. */
  provider: string;
  modality: CalculatorModality;
  name: string;
  /** USD per image, per video second, or per million characters. */
  unitPrice: number;
  /** The provider page the price was read from, when the catalog names one. */
  sourceUrl: string | null;
}

/** GenSpend's licence asks for this line wherever its prices are shown. */
export const PRICING_ATTRIBUTION = ${JSON.stringify(catalog.attribution ?? "Prices via genspend.io")};

/** When the upstream catalog was last refreshed (ISO 8601). */
export const PRICING_UPDATED_AT = ${JSON.stringify(catalog.updatedAt)};

/** Priced (provider, model) pairs the catalog holds across the three modalities. */
export const PRICED_MODEL_COUNT = ${total};

export const CALCULATOR_MODELS: Record<CalculatorModality, CalculatorModel[]> = ${JSON.stringify(
  byModality,
  null,
  2
)};

/**
 * A model Figma Weave sells for credits that Kie or AtlasCloud also serves,
 * so the same model can be priced both ways. The comparison uses only these.
 */
export interface CalculatorPair {
  /** Exactly as Weave's pricing page spells it. */
  weaveName: string;
  modality: "image" | "video";
  /** Runtime provider id — \`kie\` or \`atlascloud\`. */
  provider: string;
  /** The GenSpend price key this came from. */
  providerModelKey: string;
  /** USD per image or per video second, on your own key. */
  unitPrice: number;
  sourceUrl: string | null;
}

export const CALCULATOR_PAIRS: CalculatorPair[] = ${JSON.stringify(pairs, null, 2)};

/** Weave models with no Kie or AtlasCloud equivalent, and why. */
export const UNPAIRED_WEAVE_MODELS: Record<string, string> = ${JSON.stringify(
  UNPAIRED,
  null,
  2
)};
`;

await writeFile(OUT, body, "utf8");
console.log(
  `wrote ${path.relative(MARKETING_ROOT, OUT)} (${JSON.stringify(counts)} of ${total} priced pairs, ${pairs.length} matched to Weave models)`
);
