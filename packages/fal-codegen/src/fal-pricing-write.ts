/**
 * FAL-specific shim around `@nodetool-ai/node-sdk`'s pricing-bundle helpers.
 *
 * The bundle shape, schema version, and write logic are shared so that the
 * upcoming `replicate-codegen` and `kie-codegen` packages can emit identical
 * JSON structures. The only FAL-specific bit lives here:
 *
 *   - `nodeTypeFor(spec)` derives the runtime node type via the
 *     `fal-factory.ts` convention `fal.<moduleName>.<ClassName>`.
 *   - `buildFalPricingBundles` maps `NodeSpec & { moduleName }` arrays onto
 *     the generic `PricingBundleSpec` shape before delegating.
 */

import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  buildPricingBundles as buildPricingBundlesGeneric,
  writePricingBundles as writePricingBundlesGeneric,
  writeEmptyPricingBundles as writeEmptyPricingBundlesGeneric,
  NODE_TYPE_PRICING_SCHEMA_VERSION,
  type NodeTypePricingBundle,
  type PricingBundleSpec,
  type PricingOutputPaths,
  type UnitPricing,
  type UnitPricingCatalog,
  type UnitPricingEntry
} from "@nodetool-ai/node-sdk";
import type { NodeSpec } from "./types.js";
import type { PricingEntry } from "./fal-pricing-fetch.js";

export {
  NODE_TYPE_PRICING_SCHEMA_VERSION as FAL_PRICING_SCHEMA_VERSION,
  type NodeTypePricingBundle as FalNodeTypePricingBundle,
  type UnitPricingCatalog as FalUnitPricingCatalog,
  type UnitPricingEntry as FalUnitPricingEntry,
  type PricingOutputPaths
};

export type SpecWithModule = NodeSpec & { moduleName: string };

/** Runtime convention: `fal.<moduleName>.<ClassName>` — see `fal-factory.ts`. */
export function nodeTypeFor(spec: SpecWithModule): string {
  return `fal.${spec.moduleName}.${spec.className}`;
}

function toPricingBundleSpec(spec: SpecWithModule): PricingBundleSpec {
  return { endpointId: spec.endpointId, nodeType: nodeTypeFor(spec) };
}

function toUnitPricing(prices: Record<string, PricingEntry>): Record<string, UnitPricing> {
  // `PricingEntry` and `UnitPricing` are structurally identical today; the
  // explicit conversion keeps the seam visible for the day a provider grows
  // extra fields.
  return prices;
}

export function buildPricingBundles(
  specs: readonly SpecWithModule[],
  prices: Record<string, PricingEntry>,
  writtenAt: string
): { byNodeType: NodeTypePricingBundle; catalog: UnitPricingCatalog } {
  return buildPricingBundlesGeneric(
    specs.map(toPricingBundleSpec),
    toUnitPricing(prices),
    writtenAt
  );
}

export const writePricingBundles = writePricingBundlesGeneric;
export const writeEmptyPricingBundles = writeEmptyPricingBundlesGeneric;

/** True when both pricing bundle files already exist on disk. */
export async function pricingBundleFilesExist(
  paths: PricingOutputPaths
): Promise<boolean> {
  const [byNodeExists, catalogExists] = await Promise.all([
    pricingFileExists(paths.byNodeTypePath),
    pricingFileExists(paths.catalogPath)
  ]);
  return byNodeExists && catalogExists;
}

async function pricingFileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeEmptyByNodeTypeBundle(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    JSON.stringify(
      {
        schemaVersion: NODE_TYPE_PRICING_SCHEMA_VERSION,
        writtenAt: new Date(0).toISOString(),
        byNodeType: {}
      },
      null,
      2
    ) + "\n"
  );
}

async function writeEmptyCatalogBundle(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    JSON.stringify(
      {
        schemaVersion: NODE_TYPE_PRICING_SCHEMA_VERSION,
        writtenAt: new Date(0).toISOString(),
        prices: {}
      },
      null,
      2
    ) + "\n"
  );
}

/**
 * When codegen runs without a provider API key, keep committed bundles intact
 * and only emit empty stubs for files missing on a fresh checkout.
 */
export async function preserveOrWriteEmptyPricingBundles(
  paths: PricingOutputPaths
): Promise<"preserved" | "stubbed" | "partial"> {
  const byNodeExists = await pricingFileExists(paths.byNodeTypePath);
  const catalogExists = await pricingFileExists(paths.catalogPath);

  if (byNodeExists && catalogExists) {
    return "preserved";
  }
  if (!byNodeExists && !catalogExists) {
    await writeEmptyPricingBundles(paths);
    return "stubbed";
  }

  if (!byNodeExists) {
    await writeEmptyByNodeTypeBundle(paths.byNodeTypePath);
  }
  if (!catalogExists) {
    await writeEmptyCatalogBundle(paths.catalogPath);
  }
  return "partial";
}
