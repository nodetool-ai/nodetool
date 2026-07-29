#!/usr/bin/env node
/**
 * Refresh `packages/model-pricing/src/generated/genspend-pricing.json` from the
 * GenSpend catalog (https://genspend.io/api/v1/models) — the nightly source of
 * realtime generative-media prices behind `getModelUnitPrice`.
 *
 * GenSpend keys models by its own slug (`seedance-2`), so the slug alone can't
 * price a model chosen in NodeTool. What can is the offering's `sourceUrl`:
 * for the providers whose receipt links are model pages, the URL carries the
 * provider-native model id NodeTool already puts on a node's provider-model
 * property (`fal.ai/models/fal-ai/flux/schnell` → `fal-ai/flux/schnell`,
 * `replicate.com/black-forest-labs/flux-dev` → `black-forest-labs/flux-dev`).
 * Offerings whose receipt is a generic pricing page get no id and are dropped —
 * a guessed id would put a wrong number in front of a spend decision.
 *
 * Prices are only comparable inside one `unitClass`, so each entry keeps the
 * provider's own unit and never converts.
 *
 *   node scripts/sync-genspend-pricing.mjs            # rewrite the catalog
 *   node scripts/sync-genspend-pricing.mjs --check    # exit 1 if out of date
 *   node scripts/sync-genspend-pricing.mjs --from-file catalog.json
 *
 * Prices via genspend.io.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = join(
  ROOT,
  "packages/model-pricing/src/generated/genspend-pricing.json"
);

export const GENSPEND_MODELS_URL = "https://genspend.io/api/v1/models";
export const SCHEMA_VERSION = 1;

/**
 * GenSpend provider slug → the NodeTool provider id (`PROVIDER_IDS`) plus how
 * to read a provider-native model id out of an offering's `sourceUrl`.
 *
 * Only providers whose receipts are per-model pages are listed. kie links to
 * marketing slugs (`kie.ai/nano-banana`) that are not kie `model_id`s, and the
 * rest link to a pricing table — neither yields an id NodeTool can match, and
 * kie ships its own catalog anyway.
 */
const PROVIDER_SOURCES = [
  {
    genspendSlug: "fal",
    providerId: "fal_ai",
    // https://fal.ai/models/<endpoint_id> — the id FAL bills against.
    pattern: /^https?:\/\/(?:www\.)?fal\.ai\/models\/(.+)$/
  },
  {
    genspendSlug: "replicate",
    providerId: "replicate",
    // https://replicate.com/<owner>/<model>
    pattern: /^https?:\/\/(?:www\.)?replicate\.com\/([^/]+\/[^/]+)$/
  }
];

const PROVIDER_BY_SLUG = new Map(
  PROVIDER_SOURCES.map((source) => [source.genspendSlug, source])
);

/**
 * `unitClass` → the `billing_unit` label the cost estimator renders. Kept in
 * the same vocabulary as the FAL catalog ("images", "seconds", …) so a mixed
 * estimate reads consistently.
 */
const BILLING_UNITS = {
  "per-image": "images",
  "per-video-second": "seconds",
  "per-audio-second": "seconds",
  "per-generation": "generations",
  "per-minute": "minutes",
  "per-1m-chars": "1m_chars",
  "per-1m-tokens": "1m_tokens"
};

const isFiniteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

/** The provider-native model id an offering's receipt URL carries, if any. */
export function extractModelId(providerSlug, sourceUrl) {
  const source = PROVIDER_BY_SLUG.get(providerSlug);
  if (!source || typeof sourceUrl !== "string") return null;
  const cleaned = sourceUrl.trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
  const match = source.pattern.exec(cleaned);
  return match ? match[1] : null;
}

function variantRows(variants) {
  if (!Array.isArray(variants)) return undefined;
  const rows = variants
    .filter((v) => v && typeof v.spec === "string" && isFiniteNumber(v.priceUsd))
    .map((v) => ({
      spec: v.spec,
      unit_class: typeof v.unitClass === "string" ? v.unitClass : "",
      unit_price: v.priceUsd
    }));
  return rows.length > 0 ? rows : undefined;
}

/**
 * Normalize a GenSpend `/api/v1/models` response into the catalog NodeTool
 * ships: a flat `prices` index keyed `<provider_id>:<model_id>`.
 *
 * Dropped on purpose: offerings that aren't `available`, have no price, or
 * belong to a provider whose receipt URL yields no native model id. When two
 * offerings map to the same key (a model listed twice on one provider), the
 * cheaper one wins — the estimator's job is the price a run would actually pay.
 */
export function buildPriceIndex(models) {
  const prices = {};
  let offeringCount = 0;

  for (const model of Array.isArray(models) ? models : []) {
    if (!model || typeof model.slug !== "string") continue;
    for (const offering of Array.isArray(model.offerings) ? model.offerings : []) {
      offeringCount += 1;
      if (!offering || offering.availability !== "available") continue;
      if (!isFiniteNumber(offering.priceUsd)) continue;

      const providerSlug = offering.provider?.slug;
      const source = PROVIDER_BY_SLUG.get(providerSlug);
      if (!source) continue;
      const modelId = extractModelId(providerSlug, offering.sourceUrl);
      if (!modelId) continue;

      const unitClass =
        typeof offering.unitClass === "string" ? offering.unitClass : "";
      const key = `${source.providerId}:${modelId}`;
      const existing = prices[key];
      if (existing && existing.unit_price <= offering.priceUsd) continue;

      prices[key] = {
        unit_price: offering.priceUsd,
        billing_unit: BILLING_UNITS[unitClass] ?? "units",
        currency: "USD",
        unit: typeof offering.unit === "string" ? offering.unit : "",
        unit_class: unitClass,
        model_slug: model.slug,
        model_name: typeof model.name === "string" ? model.name : model.slug,
        provider_name: offering.provider?.name ?? providerSlug,
        live: offering.live === true,
        source_url:
          typeof offering.sourceUrl === "string" ? offering.sourceUrl : "",
        variants: variantRows(offering.variants)
      };
    }
  }

  const sorted = {};
  for (const key of Object.keys(prices).sort()) sorted[key] = prices[key];
  return { prices: sorted, offeringCount };
}

/**
 * The full catalog file. `updatedAt` is carried over from `previous` when the
 * prices are byte-identical, so an unchanged nightly run produces no diff and
 * the timestamp keeps meaning "when the numbers last moved".
 */
export function buildCatalog(models, previous, nowIso) {
  const { prices, offeringCount } = buildPriceIndex(models);
  const unchanged =
    previous &&
    JSON.stringify(previous.prices ?? {}) === JSON.stringify(prices);
  return {
    schemaVersion: SCHEMA_VERSION,
    source: GENSPEND_MODELS_URL,
    attribution: "Prices via genspend.io",
    updatedAt: unchanged ? previous.updatedAt : nowIso,
    catalogModels: Array.isArray(models) ? models.length : 0,
    catalogOfferings: offeringCount,
    pricedModels: Object.keys(prices).length,
    prices
  };
}

async function fetchModels(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "nodetool-cost/1.0 (+https://nodetool.ai)",
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(30_000)
      });
      if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
      const body = await res.json();
      if (!Array.isArray(body)) {
        throw new Error(`GET ${url} → expected an array of models`);
      }
      return body;
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }
  throw lastError;
}

function readPrevious(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const args = { check: false, out: DEFAULT_OUT, fromFile: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--check") args.check = true;
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--from-file") args.fromFile = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const models = args.fromFile
    ? JSON.parse(readFileSync(args.fromFile, "utf8"))
    : await fetchModels(GENSPEND_MODELS_URL);

  const previous = readPrevious(args.out);
  const catalog = buildCatalog(models, previous, new Date().toISOString());
  const serialized = `${JSON.stringify(catalog, null, 2)}\n`;

  if (catalog.pricedModels === 0) {
    throw new Error(
      "GenSpend returned no priceable offerings — refusing to write an empty catalog"
    );
  }

  const current = (() => {
    try {
      return readFileSync(args.out, "utf8");
    } catch {
      return null;
    }
  })();

  if (args.check) {
    if (current !== serialized) {
      console.error(
        `${args.out} is out of date — run \`npm run sync:genspend\`.`
      );
      process.exit(1);
    }
    console.log(`${args.out} is up to date (${catalog.pricedModels} prices).`);
    return;
  }

  if (current === serialized) {
    console.log(
      `No price changes (${catalog.pricedModels} prices from ${catalog.catalogOfferings} offerings).`
    );
    return;
  }

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, serialized);
  console.log(
    `Wrote ${args.out}: ${catalog.pricedModels} prices from ${catalog.catalogOfferings} offerings across ${catalog.catalogModels} models.`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
