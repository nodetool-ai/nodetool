/**
 * Shared types and helpers for writing per-provider pricing bundles during
 * codegen.
 *
 * Each provider (FAL, Replicate, Kie, …) builds the same two JSON files
 * alongside its node manifest:
 *
 *   1. `<provider>-node-type-pricing.json` — `byNodeType` map keyed by the
 *      runtime NodeTool `node_type`, used by the frontend to attach a
 *      `<provider>_unit_pricing` field onto each `NodeMetadata`.
 *   2. `<provider>-unit-pricing.json` — raw price catalog keyed by the
 *      provider's own endpoint/model identifier. Mostly useful for diffing
 *      and showing "snapshot recorded at" in the UI.
 *
 * Per-provider codegen packages are expected to:
 *   - implement a small `<provider>-pricing-fetch.ts` that turns a list of
 *     endpoint IDs into `Record<endpointId, UnitPricing>` (provider APIs
 *     differ too much to share).
 *   - map their `NodeSpec` array to `PricingBundleSpec[]` (just `endpointId`
 *     + `nodeType`) and hand it to {@link buildPricingBundles}.
 *   - call {@link writePricingBundles} / {@link writeEmptyPricingBundles}
 *     with the two output paths.
 *
 * The `endpoint_id` field name is kept across providers even though it is
 * FAL-flavored — the frontend already treats it as the canonical
 * "provider-identifier" key, and renaming would ripple through every
 * `attach*UnitPricing.ts` and `format*UnitPricing.ts` util.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Stable on-disk schema version; bump when the JSON shape changes. */
export const NODE_TYPE_PRICING_SCHEMA_VERSION = 1;

/** Per-call price — provider-agnostic. */
export interface UnitPricing {
  unit_price: number;
  billing_unit: string;
  currency: string;
}

/** A price entry tagged with its provider identifier. */
export interface UnitPricingEntry extends UnitPricing {
  endpoint_id: string;
}

export interface NodeTypePricingBundle {
  schemaVersion: number;
  writtenAt: string;
  byNodeType: Record<string, UnitPricingEntry>;
}

export interface UnitPricingCatalog {
  schemaVersion: number;
  writtenAt: string;
  prices: Record<string, UnitPricing>;
}

/** Minimal info each provider supplies per node when building bundles. */
export interface PricingBundleSpec {
  /** Provider identifier — `endpoint_id` for FAL, `owner/name:version` for Replicate, etc. */
  endpointId: string;
  /** Runtime NodeTool node type, e.g. `fal.image_to_image.FluxKontextPro`. */
  nodeType: string;
}

export interface PricingOutputPaths {
  byNodeTypePath: string;
  catalogPath: string;
}

export function buildPricingBundles(
  specs: readonly PricingBundleSpec[],
  prices: Record<string, UnitPricing>,
  writtenAt: string
): { byNodeType: NodeTypePricingBundle; catalog: UnitPricingCatalog } {
  const byNodeType: Record<string, UnitPricingEntry> = {};
  const catalog: Record<string, UnitPricing> = {};

  for (const spec of specs) {
    const entry = prices[spec.endpointId];
    if (!entry) continue;
    byNodeType[spec.nodeType] = { endpoint_id: spec.endpointId, ...entry };
    catalog[spec.endpointId] = entry;
  }

  return {
    byNodeType: {
      schemaVersion: NODE_TYPE_PRICING_SCHEMA_VERSION,
      writtenAt,
      byNodeType
    },
    catalog: {
      schemaVersion: NODE_TYPE_PRICING_SCHEMA_VERSION,
      writtenAt,
      prices: catalog
    }
  };
}

export async function writePricingBundles(
  bundles: {
    byNodeType: NodeTypePricingBundle;
    catalog: UnitPricingCatalog;
  },
  paths: PricingOutputPaths
): Promise<void> {
  await mkdir(dirname(paths.byNodeTypePath), { recursive: true });
  await Promise.all([
    writeFile(
      paths.byNodeTypePath,
      JSON.stringify(bundles.byNodeType, null, 2) + "\n"
    ),
    writeFile(
      paths.catalogPath,
      JSON.stringify(bundles.catalog, null, 2) + "\n"
    )
  ]);
}

/**
 * Write empty (stub) bundles. Used when codegen runs without a provider API
 * key, so consumers always find parseable JSON at the alias targets.
 */
export async function writeEmptyPricingBundles(
  paths: PricingOutputPaths
): Promise<void> {
  const writtenAt = new Date(0).toISOString();
  await writePricingBundles(
    {
      byNodeType: {
        schemaVersion: NODE_TYPE_PRICING_SCHEMA_VERSION,
        writtenAt,
        byNodeType: {}
      },
      catalog: {
        schemaVersion: NODE_TYPE_PRICING_SCHEMA_VERSION,
        writtenAt,
        prices: {}
      }
    },
    paths
  );
}
