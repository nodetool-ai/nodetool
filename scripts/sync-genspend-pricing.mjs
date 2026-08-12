#!/usr/bin/env node
/**
 * Refresh `packages/model-pricing/src/generated/genspend-pricing.json` from the
 * GenSpend catalog (https://genspend.io/api/v1/export) — the nightly source of
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
 * Schema 3 ships the provider's published *grid* alongside the scalar price:
 * `variants[]` (resolution / duration / audio / video-input rungs),
 * `surcharges[]`, the clip-length envelope, and the open data flags. The
 * scalars keep their v2 meaning, so a consumer that reads only `unit_price`
 * behaves as it did before.
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

export const GENSPEND_MODELS_URL = "https://genspend.io/api/v1/export";
export const SCHEMA_VERSION = 3;

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

/** The typed facets a variant row can carry. A row with none of them prices nothing. */
const VARIANT_FACETS = [
  "resolution",
  "duration_seconds",
  "with_audio",
  "video_input",
  "tier"
];

/**
 * Surcharge kinds the calculator knows how to reason about. Anything else
 * GenSpend adds later is dropped rather than stored as a number nobody applies.
 */
const SURCHARGE_KINDS = new Set([
  "input_image",
  "input_video_second",
  "per_request"
]);

const nonEmptyString = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/**
 * The offering's published grid, reduced to the typed facets we compute on.
 *
 * GenSpend's `spec` string is its own truth surface — free prose we would have
 * to re-parse — so it is dropped, and with it every row that says nothing in
 * facets. That removes the common case where `variants[]` is a list of sibling
 * endpoint ids (already resolved into separate catalog keys by the matcher) and
 * keeps the shipped JSON to the rows a price actually varies over.
 */
export function typedVariants(offering) {
  const headlineClass = nonEmptyString(offering?.unitClass) ?? "";
  const rows = [];
  for (const variant of Array.isArray(offering?.variants) ? offering.variants : []) {
    if (!isFiniteNumber(variant?.priceUsd)) continue;
    const row = {
      price_usd: variant.priceUsd,
      unit_class: nonEmptyString(variant.unitClass) ?? headlineClass,
      ...(nonEmptyString(variant.resolution)
        ? { resolution: nonEmptyString(variant.resolution) }
        : {}),
      ...(isFiniteNumber(variant.durationSeconds)
        ? { duration_seconds: variant.durationSeconds }
        : {}),
      ...(typeof variant.withAudio === "boolean"
        ? { with_audio: variant.withAudio }
        : {}),
      ...(typeof variant.videoInput === "boolean"
        ? { video_input: variant.videoInput }
        : {}),
      ...(nonEmptyString(variant.tier) ? { tier: nonEmptyString(variant.tier) } : {}),
      is_base: variant.isBase === true
    };
    if (!VARIANT_FACETS.some((facet) => facet in row)) continue;
    rows.push(row);
  }
  return rows;
}

/**
 * Input-side charges, in GenSpend's own semantics: `input_image` is additive
 * past its free allowance, `input_video_second` *replaces* the generation cost
 * and is scoped by resolution, and `per_request` is opt-in and never added
 * silently. The prose note is left upstream; only the arithmetic is stored.
 */
export function typedSurcharges(offering) {
  const rows = [];
  for (const surcharge of Array.isArray(offering?.surcharges)
    ? offering.surcharges
    : []) {
    const kind = nonEmptyString(surcharge?.kind);
    if (!kind || !SURCHARGE_KINDS.has(kind)) continue;
    if (!isFiniteNumber(surcharge.unitPriceUsd)) continue;
    const spec = nonEmptyString(surcharge.spec);
    rows.push({
      kind,
      // One `spec` field upstream carries two meanings: the resolution a video
      // re-rate is scoped to, and the name of a per-request extra.
      ...(spec && kind === "input_video_second" ? { spec } : {}),
      unit_price_usd: surcharge.unitPriceUsd,
      free_allowance: isFiniteNumber(surcharge.freeAllowance)
        ? surcharge.freeAllowance
        : 0,
      ...(spec && kind === "per_request" ? { label: spec } : {})
    });
  }
  return rows;
}

/**
 * Open data flags, kind and severity only. `cosmetic` is display text and we
 * render our own, so it is dropped; `quote_wrong` and `spec_gap` change what a
 * consumer may claim, so they ship.
 */
export function typedDataFlags(offering) {
  const rows = [];
  for (const flag of Array.isArray(offering?.dataFlags) ? offering.dataFlags : []) {
    const severity = nonEmptyString(flag?.severity);
    const kind = nonEmptyString(flag?.kind);
    if (!severity || !kind || severity === "cosmetic") continue;
    rows.push({ kind, severity });
  }
  return rows;
}

/**
 * The model's clip-length envelope, stored exactly as published. `null` is a
 * refusal to price any duration, not an absence of limits, so it is kept as
 * `null`; a model that publishes no envelope at all carries no field.
 */
export function clipSecondsOf(model) {
  const capabilities = model?.capabilities;
  if (!capabilities || !("clipSeconds" in capabilities)) return undefined;
  const clip = capabilities.clipSeconds;
  if (clip === null) return null;
  if (!clip || typeof clip !== "object") return undefined;
  const set = Array.isArray(clip.set) ? clip.set.filter(isFiniteNumber) : null;
  const envelope = {
    ...(set && set.length > 0 ? { set } : {}),
    ...(isFiniteNumber(clip.min) ? { min: clip.min } : {}),
    ...(isFiniteNumber(clip.max) ? { max: clip.max } : {})
  };
  return Object.keys(envelope).length > 0 ? envelope : undefined;
}

/**
 * The row an entry's scalars should quote.
 *
 * An entry matched through a `variants[]` row already names its own rung, so
 * that row is its base. Otherwise the offering's `isBase` row is the honest
 * default deliverable — the provider's own answer to "what does this cost with
 * nothing specified", which beats v2's arbitrary collapse. Its `unitClass`
 * comes with it: MiniMax bills Hailuo per generation ($0.28 for a 768p 6s
 * clip) while the headline quotes a per-second rate, and taking one without
 * the other would publish $0.28 *per second*.
 */
export function baseSpecRow(offering, variantSpec) {
  const rows = Array.isArray(offering?.variants) ? offering.variants : [];
  const row = variantSpec
    ? rows.find((v) => v?.spec === variantSpec)
    : rows.find((v) => v?.isBase === true);
  return isFiniteNumber(row?.priceUsd) ? row : null;
}

/**
 * Normalize a GenSpend `/api/v1/export` response into the catalog NodeTool
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

      const variants = typedVariants(offering);
      const surcharges = typedSurcharges(offering);
      const dataFlags = typedDataFlags(offering);
      const clipSeconds = clipSecondsOf(model);

      for (const entry of resolved.entries) {
        const key = `${providerId}:${entry.modelId}`;
        const base = baseSpecRow(offering, entry.variantSpec);
        const unitPrice = base ? base.priceUsd : entry.unitPrice;
        const unitClass =
          (base ? nonEmptyString(base.unitClass) : null) ?? entry.unitClass;
        const existing = prices[key];
        if (existing) {
          // Equal trust, same model listed twice: the cheaper number is what a
          // run pays. Equal trust, *different* models on one id — a provider
          // that selects tier by parameter, so `kling-v3` is both Pro and
          // Standard — means one NodeTool node could run either, and a budget
          // gate must assume the dearer.
          const sameModel = existing.model_slug === model.slug;
          const tieBreak = sameModel
            ? unitPrice < existing.unit_price
            : unitPrice > existing.unit_price;
          const better =
            MATCH_RANK[entry.match] > MATCH_RANK[existing.match] ||
            (MATCH_RANK[entry.match] === MATCH_RANK[existing.match] && tieBreak);
          if (!better) continue;
        } else {
          stats.ids += 1;
        }

        prices[key] = {
          unit_price: unitPrice,
          billing_unit: BILLING_UNITS[unitClass] ?? "units",
          unit_class: unitClass,
          model_slug: model.slug,
          match: entry.match,
          live: offering.live === true,
          source_url:
            typeof offering.sourceUrl === "string" ? offering.sourceUrl : "",
          ...(entry.tier ? { tier: entry.tier } : {}),
          ...(entry.resolution ? { resolution: entry.resolution } : {}),
          ...(variants.length > 0 ? { variants } : {}),
          ...(surcharges.length > 0 ? { surcharges } : {}),
          ...(clipSeconds !== undefined ? { clip_seconds: clipSeconds } : {}),
          ...(dataFlags.length > 0 ? { data_flags: dataFlags } : {})
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
    // Providers that actually carry a price, read off the keys rather than from
    // `coverage` — a provider whose every offering went unresolved (xAI, whose
    // model listing needs a live API call) is covered by the sync but priced by
    // nothing, and listing it here would overstate what the catalog answers.
    providers: [
      ...new Set(Object.keys(prices).map((key) => key.slice(0, key.indexOf(":"))))
    ].sort(),
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
 * Fetch the catalog and offer the previous run's ETag. `/export` is the same
 * projection `/models` serves plus surcharges, open data flags and the `usage`
 * block, assembled server-side so the two cannot drift, and it always answers
 * with an envelope (`{schemaVersion, generatedAt, counts, usage, models}`) that
 * dates the payload. A 304 means the upstream catalog has not moved since the
 * shipped file was written, and the whole run is a no-op — reported as
 * `{ notModified: true }`.
 */
async function fetchModels(url, { etag, attempts = 3 } = {}) {
  const endpoint = url;
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
