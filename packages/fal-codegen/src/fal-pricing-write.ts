/**
 * Build and write the two FAL pricing JSON bundles consumed by `web/`:
 *
 *  - `fal-node-type-pricing.json` — keyed by NodeTool `node_type`, used at
 *     load time to attach `fal_unit_pricing` onto each `NodeMetadata`.
 *  - `fal-unit-pricing.json` — keyed by FAL `endpoint_id`, raw price catalog.
 *     Kept around so the frontend can show "snapshot recorded at" and so we
 *     can debug a pricing diff without re-deriving from the node-type map.
 *
 * Both bundles are committed alongside `fal-manifest.json` (despite living in
 * `src/generated/`) so users without a `FAL_API_KEY` configured at runtime
 * still see prices in the node menu on first paint.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { NodeSpec } from "./types.js";
import type { PricingEntry } from "./fal-pricing-fetch.js";

/** Stable on-disk schema version; bump when the JSON shape changes. */
export const FAL_PRICING_SCHEMA_VERSION = 1;

export interface FalUnitPricingEntry extends PricingEntry {
  endpoint_id: string;
}

export interface FalNodeTypePricingBundle {
  schemaVersion: number;
  writtenAt: string;
  byNodeType: Record<string, FalUnitPricingEntry>;
}

export interface FalUnitPricingCatalog {
  schemaVersion: number;
  writtenAt: string;
  prices: Record<string, PricingEntry>;
}

export type SpecWithModule = NodeSpec & { moduleName: string };

/** Runtime convention: `fal.<moduleName>.<ClassName>` — see `fal-factory.ts`. */
export function nodeTypeFor(spec: SpecWithModule): string {
  return `fal.${spec.moduleName}.${spec.className}`;
}

export function buildPricingBundles(
  specs: readonly SpecWithModule[],
  prices: Record<string, PricingEntry>,
  writtenAt: string
): { byNodeType: FalNodeTypePricingBundle; catalog: FalUnitPricingCatalog } {
  const byNodeType: Record<string, FalUnitPricingEntry> = {};
  const catalog: Record<string, PricingEntry> = {};

  for (const spec of specs) {
    const entry = prices[spec.endpointId];
    if (!entry) continue;
    byNodeType[nodeTypeFor(spec)] = { endpoint_id: spec.endpointId, ...entry };
    catalog[spec.endpointId] = entry;
  }

  return {
    byNodeType: {
      schemaVersion: FAL_PRICING_SCHEMA_VERSION,
      writtenAt,
      byNodeType
    },
    catalog: {
      schemaVersion: FAL_PRICING_SCHEMA_VERSION,
      writtenAt,
      prices: catalog
    }
  };
}

export interface PricingOutputPaths {
  byNodeTypePath: string;
  catalogPath: string;
}

export async function writePricingBundles(
  bundles: {
    byNodeType: FalNodeTypePricingBundle;
    catalog: FalUnitPricingCatalog;
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
 * Write empty (stub) bundles. Used when `--no-pricing` is passed or when
 * `FAL_API_KEY` is unavailable, so consumers always find a parseable JSON at
 * the alias targets and Vite/Jest don't fail to resolve.
 */
export async function writeEmptyPricingBundles(
  paths: PricingOutputPaths
): Promise<void> {
  const writtenAt = new Date(0).toISOString();
  await writePricingBundles(
    {
      byNodeType: {
        schemaVersion: FAL_PRICING_SCHEMA_VERSION,
        writtenAt,
        byNodeType: {}
      },
      catalog: {
        schemaVersion: FAL_PRICING_SCHEMA_VERSION,
        writtenAt,
        prices: {}
      }
    },
    paths
  );
}
