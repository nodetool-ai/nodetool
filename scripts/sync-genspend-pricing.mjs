#!/usr/bin/env node
/**
 * Refresh `packages/model-pricing/src/generated/genspend-pricing.json` from the
 * GenSpend catalog (https://genspend.io/api/v1/models) — the nightly source of
 * realtime generative-media prices behind `getModelUnitPrice`.
 *
 * Every provider NodeTool can run and GenSpend tracks is covered. The bridge
 * between the two vocabularies lives in `genspend/match.mjs`: a receipt URL
 * that carries the provider-native model id, or an exact normalized-name match
 * against the models the provider itself enumerates in NodeTool
 * (`genspend/inventory.mjs`). Nothing is inferred beyond that, and every entry
 * records which of the two produced it.
 *
 * Prices keep the provider's own unit and are never converted — GenSpend
 * prices are only comparable inside one `unitClass`.
 *
 *   node scripts/sync-genspend-pricing.mjs            # rewrite the catalog
 *   node scripts/sync-genspend-pricing.mjs --check    # exit 1 if out of date
 *   node scripts/sync-genspend-pricing.mjs --report r.json
 *   node scripts/sync-genspend-pricing.mjs --from-file catalog.json
 *
 * Needs `npm run build:packages` first — the inventory comes from the built
 * providers.
 *
 * Prices via genspend.io.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectProviderInventory } from "./genspend/inventory.mjs";
import {
  buildInventoryIndex,
  resolveOfferingPrices,
  MATCH_RANK,
  PROVIDER_IDS_BY_GENSPEND_SLUG
} from "./genspend/match.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = join(
  ROOT,
  "packages/model-pricing/src/generated/genspend-pricing.json"
);
const ALIASES_PATH = join(ROOT, "scripts/genspend/aliases.json");

export const GENSPEND_MODELS_URL = "https://genspend.io/api/v1/models";
export const SCHEMA_VERSION = 2;

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

/**
 * Normalize a GenSpend `/api/v1/models` response into the catalog NodeTool
 * ships: a flat `prices` index keyed `<provider_id>:<model_id>`.
 *
 * Dropped on purpose: offerings that aren't `available`, carry no price, belong
 * to a provider NodeTool cannot run, or name a model that resolves to no id.
 * When two offerings land on the same key, the cheaper one wins — the
 * estimator's job is the price a run would actually pay — except that a
 * receipt-matched price always outranks a name-matched one.
 */
export function buildPriceIndex({ models, index, aliases }) {
  const prices = {};
  const coverage = {};
  const unresolved = [];
  let offeringCount = 0;

  for (const model of Array.isArray(models) ? models : []) {
    if (!model || typeof model.slug !== "string") continue;
    for (const offering of Array.isArray(model.offerings) ? model.offerings : []) {
      offeringCount += 1;
      const providerSlug = offering?.provider?.slug;
      if (!PROVIDER_IDS_BY_GENSPEND_SLUG[providerSlug]) continue;
      if (offering.availability !== "available") continue;
      if (!isFiniteNumber(offering.priceUsd)) continue;

      const resolved = resolveOfferingPrices({ model, offering, index, aliases });
      const providerId = resolved.providerId;
      const stats = (coverage[providerId] ??= {
        offerings: 0,
        priced: 0,
        ids: 0,
        unresolved: 0
      });
      stats.offerings += 1;

      if (resolved.entries.length === 0) {
        stats.unresolved += 1;
        unresolved.push({
          provider: providerId,
          model: model.slug,
          name: model.name ?? model.slug,
          modality: model.modality ?? "",
          reason: resolved.reason ?? "unmatched"
        });
        continue;
      }

      stats.priced += 1;

      for (const entry of resolved.entries) {
        const key = `${providerId}:${entry.modelId}`;
        const existing = prices[key];
        if (existing) {
          // Equal trust, same model listed twice: the cheaper number is what a
          // run pays. Equal trust, *different* models on one id — a provider
          // that selects tier by parameter, so `kling-v3` is both Pro and
          // Standard — means one NodeTool node could run either, and a budget
          // gate must assume the dearer.
          const sameModel = existing.model_slug === model.slug;
          const tieBreak = sameModel
            ? entry.unitPrice < existing.unit_price
            : entry.unitPrice > existing.unit_price;
          const better =
            MATCH_RANK[entry.match] > MATCH_RANK[existing.match] ||
            (MATCH_RANK[entry.match] === MATCH_RANK[existing.match] && tieBreak);
          if (!better) continue;
        } else {
          stats.ids += 1;
        }

        prices[key] = {
          unit_price: entry.unitPrice,
          billing_unit: BILLING_UNITS[entry.unitClass] ?? "units",
          unit_class: entry.unitClass,
          model_slug: model.slug,
          match: entry.match,
          live: offering.live === true,
          source_url:
            typeof offering.sourceUrl === "string" ? offering.sourceUrl : "",
          ...(entry.tier ? { tier: entry.tier } : {}),
          ...(entry.resolution ? { resolution: entry.resolution } : {})
        };
      }
    }
  }

  const sorted = {};
  for (const key of Object.keys(prices).sort()) sorted[key] = prices[key];
  unresolved.sort((a, b) =>
    `${a.provider}${a.model}`.localeCompare(`${b.provider}${b.model}`)
  );
  return { prices: sorted, coverage, unresolved, offeringCount };
}

/**
 * The full catalog file. `updatedAt` is carried over from `previous` when the
 * prices are byte-identical, so an unchanged nightly run produces no diff and
 * the timestamp keeps meaning "when the numbers last moved".
 */
export function buildCatalog({
  models,
  index,
  aliases,
  previous,
  nowIso,
  etag = null,
  generatedAt = null
}) {
  const { prices, coverage, unresolved, offeringCount } = buildPriceIndex({
    models,
    index,
    aliases
  });
  const unchanged =
    previous && JSON.stringify(previous.prices ?? {}) === JSON.stringify(prices);
  const catalog = {
    schemaVersion: SCHEMA_VERSION,
    source: GENSPEND_MODELS_URL,
    attribution: "Prices via genspend.io",
    updatedAt: unchanged ? previous.updatedAt : nowIso,
    // The snapshot these prices came from. Frozen with them: GenSpend's ETag
    // covers the envelope's `generatedAt`, which turns over with the 60s edge
    // cache, so letting either field float would rewrite the file — and open a
    // nightly PR — on runs where no price moved.
    catalogGeneratedAt: unchanged
      ? previous.catalogGeneratedAt ?? null
      : generatedAt ?? previous?.catalogGeneratedAt ?? null,
    etag: unchanged ? previous.etag ?? null : etag ?? previous?.etag ?? null,
    catalogModels: Array.isArray(models) ? models.length : 0,
    catalogOfferings: offeringCount,
    providers: Object.keys(coverage).sort(),
    pricedModels: Object.keys(prices).length,
    prices
  };
  return { catalog, coverage, unresolved };
}

/**
 * GenSpend issues strong ETags, but a compressing intermediary (Brotli, on
 * Node's default `Accept-Encoding`) marks the validator weak in transit, and
 * the origin then compares `If-None-Match` strongly and misses. Sending the
 * strong form back is what the origin actually issued; if that ever stops
 * matching, the cost is a full fetch producing an identical file.
 */
const strongEtag = (etag) =>
  typeof etag === "string" ? etag.replace(/^W\//, "") : null;

/**
 * Fetch the catalog, asking for the envelope (`generatedAt` + `count`, so the
 * payload dates itself) and offering the previous run's ETag. A 304 means the
 * upstream catalog has not moved since the shipped file was written, and the
 * whole run is a no-op — reported as `{ notModified: true }`.
 */
async function fetchModels(url, { etag, attempts = 3 } = {}) {
  const endpoint = `${url}?envelope=1`;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(endpoint, {
        headers: {
          "User-Agent": "nodetool-cost/1.0 (+https://nodetool.ai)",
          Accept: "application/json",
          ...(etag ? { "If-None-Match": etag } : {})
        },
        signal: AbortSignal.timeout(30_000)
      });
      if (res.status === 304) return { notModified: true };
      if (!res.ok) throw new Error(`GET ${endpoint} → HTTP ${res.status}`);
      const body = await res.json();
      const models = Array.isArray(body) ? body : body?.models;
      if (!Array.isArray(models)) {
        throw new Error(`GET ${endpoint} → expected an array of models`);
      }
      return {
        models,
        etag: strongEtag(res.headers.get("etag")),
        generatedAt: typeof body?.generatedAt === "string" ? body.generatedAt : null
      };
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      }
    }
  }
  throw lastError;
}

function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function parseArgs(argv) {
  const args = {
    check: false,
    out: DEFAULT_OUT,
    fromFile: null,
    inventoryFile: null,
    report: null
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--check") args.check = true;
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--from-file") args.fromFile = argv[++i];
    else if (arg === "--inventory") args.inventoryFile = argv[++i];
    else if (arg === "--report") args.report = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printCoverage(coverage, unresolved, uncovered) {
  const providers = Object.keys(coverage).sort();
  console.log("Coverage by provider (available offerings → priced model ids):");
  for (const provider of providers) {
    const c = coverage[provider];
    console.log(
      `  ${provider.padEnd(12)} ${String(c.priced).padStart(3)}/${String(
        c.offerings
      ).padEnd(3)} offerings → ${String(c.ids).padStart(3)} ids` +
        (c.unresolved ? `   (${c.unresolved} unresolved)` : "")
    );
  }
  for (const entry of uncovered) {
    console.log(`  ${entry.providerId.padEnd(12)} no inventory — ${entry.reason}`);
  }
  if (unresolved.length > 0) {
    console.log(
      `\n${unresolved.length} offering(s) resolved to no NodeTool model id. Pin them in scripts/genspend/aliases.json if they should be priced:`
    );
    for (const entry of unresolved) {
      console.log(
        `  ${entry.provider.padEnd(12)} ${entry.model.padEnd(28)} ${entry.reason}  (${entry.name})`
      );
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const previous = readJson(args.out);

  let models;
  let etag = null;
  let generatedAt = null;
  if (args.fromFile) {
    const body = JSON.parse(readFileSync(args.fromFile, "utf8"));
    models = Array.isArray(body) ? body : body?.models;
    generatedAt = typeof body?.generatedAt === "string" ? body.generatedAt : null;
  } else {
    const fetched = await fetchModels(GENSPEND_MODELS_URL, {
      // Only offer the stored ETag when the local rules are unchanged too — a
      // 304 asserts the upstream catalog moved, not that this script agrees
      // with what it produced last time.
      etag:
        previous?.schemaVersion === SCHEMA_VERSION ? previous?.etag ?? null : null
    });
    if (fetched.notModified) {
      console.log(
        `GenSpend catalog unchanged since ${
          previous?.catalogGeneratedAt ?? "the last sync"
        } (HTTP 304) — nothing to do.`
      );
      return;
    }
    ({ models, etag, generatedAt } = fetched);
  }

  const { inventory, uncovered } = args.inventoryFile
    ? { inventory: readJson(args.inventoryFile, {}), uncovered: [] }
    : await collectProviderInventory();
  if (Object.keys(inventory).length === 0) {
    throw new Error(
      "No provider inventory — run `npm run build:packages` before syncing"
    );
  }

  const index = buildInventoryIndex(inventory);
  const aliases = readJson(ALIASES_PATH, {});
  const { catalog, coverage, unresolved } = buildCatalog({
    models,
    index,
    aliases,
    previous,
    nowIso: new Date().toISOString(),
    etag,
    generatedAt
  });

  if (catalog.pricedModels === 0) {
    throw new Error(
      "GenSpend returned no priceable offerings — refusing to write an empty catalog"
    );
  }

  const serialized = `${JSON.stringify(catalog, null, 2)}\n`;
  const current = (() => {
    try {
      return readFileSync(args.out, "utf8");
    } catch {
      return null;
    }
  })();

  if (args.report) {
    mkdirSync(dirname(args.report), { recursive: true });
    writeFileSync(
      args.report,
      `${JSON.stringify({ coverage, unresolved, uncovered }, null, 2)}\n`
    );
  }

  printCoverage(coverage, unresolved, uncovered);

  if (args.check) {
    if (current !== serialized) {
      console.error(
        `\n${args.out} is out of date — run \`npm run sync:genspend\`.`
      );
      process.exit(1);
    }
    console.log(`\n${args.out} is up to date (${catalog.pricedModels} prices).`);
    return;
  }

  if (current === serialized) {
    console.log(
      `\nNo price changes (${catalog.pricedModels} prices across ${catalog.providers.length} providers).`
    );
    return;
  }

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, serialized);
  console.log(
    `\nWrote ${args.out}: ${catalog.pricedModels} prices across ${catalog.providers.length} providers, from ${catalog.catalogOfferings} offerings.`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
