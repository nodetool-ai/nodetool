/**
 * KIE pricing bundle writer — writes extended catalog metadata for the web UI.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { NODE_TYPE_PRICING_SCHEMA_VERSION } from "@nodetool-ai/node-sdk";
import type { PricingOutputPaths } from "@nodetool-ai/node-sdk";
import {
  resolveKiePricing,
  type KieModelPricingSummary,
} from "@nodetool-ai/kie-nodes/kie-pricing-api";

export interface KieManifestPricingEntry {
  className: string;
  moduleName: string;
  modelId: string;
}

export interface KieUnitPricingEntry {
  model_id: string;
  unit_price: number;
  billing_unit: string;
  currency: "credits";
  usd_price?: number;
  tier_count?: number;
  pricing_url?: string;
}

export interface KieUnitPricingCatalog {
  schemaVersion: number;
  writtenAt: string;
  prices: Record<string, KieModelPricingSummary>;
}

export interface KieNodeTypePricingBundle {
  schemaVersion: number;
  writtenAt: string;
  byNodeType: Record<string, KieUnitPricingEntry>;
}

export function nodeTypeFor(entry: KieManifestPricingEntry): string {
  return `kie.${entry.moduleName}.${entry.className}`;
}

export function buildKiePricingBundles(
  manifest: readonly KieManifestPricingEntry[],
  catalog: Record<string, KieModelPricingSummary>,
  writtenAt: string,
): { byNodeType: KieNodeTypePricingBundle; catalog: KieUnitPricingCatalog } {
  const byNodeType: Record<string, KieUnitPricingEntry> = {};

  for (const entry of manifest) {
    const summary = resolveKiePricing(catalog, entry.modelId);
    if (!summary) {
      continue;
    }
    byNodeType[nodeTypeFor(entry)] = {
      model_id: summary.model_id,
      unit_price: summary.unit_price,
      billing_unit: summary.billing_unit,
      currency: "credits",
      usd_price: summary.usd_price,
      tier_count: summary.tier_count,
      pricing_url: summary.pricing_url,
    };
  }

  return {
    byNodeType: {
      schemaVersion: NODE_TYPE_PRICING_SCHEMA_VERSION,
      writtenAt,
      byNodeType,
    },
    catalog: {
      schemaVersion: NODE_TYPE_PRICING_SCHEMA_VERSION,
      writtenAt,
      prices: catalog,
    },
  };
}

export function pricingPaths(manifestPath: string): PricingOutputPaths {
  const generatedDir = join(dirname(manifestPath), "generated");
  return {
    byNodeTypePath: join(generatedDir, "kie-node-type-pricing.json"),
    catalogPath: join(generatedDir, "kie-unit-pricing.json"),
  };
}

export async function writeKiePricingBundles(
  bundles: {
    byNodeType: KieNodeTypePricingBundle;
    catalog: KieUnitPricingCatalog;
  },
  paths: PricingOutputPaths,
): Promise<void> {
  await mkdir(dirname(paths.byNodeTypePath), { recursive: true });
  await Promise.all([
    writeFile(
      paths.byNodeTypePath,
      JSON.stringify(bundles.byNodeType, null, 2) + "\n",
    ),
    writeFile(
      paths.catalogPath,
      JSON.stringify(bundles.catalog, null, 2) + "\n",
    ),
  ]);
}

export async function writeEmptyKiePricingBundles(
  paths: PricingOutputPaths,
): Promise<void> {
  const writtenAt = new Date(0).toISOString();
  await writeKiePricingBundles(
    {
      byNodeType: {
        schemaVersion: NODE_TYPE_PRICING_SCHEMA_VERSION,
        writtenAt,
        byNodeType: {},
      },
      catalog: {
        schemaVersion: NODE_TYPE_PRICING_SCHEMA_VERSION,
        writtenAt,
        prices: {},
      },
    },
    paths,
  );
}
