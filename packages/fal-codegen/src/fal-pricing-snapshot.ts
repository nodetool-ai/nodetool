/**
 * Optional JSON snapshot for FAL unit pricing (GET /v1/models/pricing).
 * Use `--pricing-only` to build/update the file; `--pricing-snapshot <path>` during codegen to read it (no pricing API).
 */

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import {
  fetchFalUnitPricingMap,
  type FetchFalUnitPricingMapOptions,
} from "./fetch-fal-unit-pricing.js";
import type { FalUnitPricing } from "./types.js";

export const FAL_UNIT_PRICING_JSON = "fal-unit-pricing.json";

export interface FalUnitPricingSnapshotFile {
  schemaVersion: 1;
  /** ISO-8601 when the snapshot was written */
  writtenAt: string;
  prices: Record<string, FalUnitPricing>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function parsePricingRow(raw: unknown, endpointId: string): FalUnitPricing | null {
  if (!isRecord(raw)) {
    return null;
  }
  const unitPrice = raw.unitPrice;
  const billingUnit = raw.billingUnit;
  const currency = raw.currency;
  if (
    typeof unitPrice !== "number" ||
    typeof billingUnit !== "string" ||
    typeof currency !== "string"
  ) {
    return null;
  }
  const id =
    typeof raw.endpointId === "string" ? raw.endpointId : endpointId;
  return {
    endpointId: id,
    unitPrice,
    billingUnit,
    currency,
  };
}

/**
 * Load pricing from a snapshot file. Throws if format is invalid.
 */
export async function readFalUnitPricingSnapshot(
  absPath: string,
): Promise<Map<string, FalUnitPricing>> {
  const text = await readFile(absPath, "utf8");
  const parsed = JSON.parse(text) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Invalid pricing snapshot (not an object): ${absPath}`);
  }
  if (parsed.schemaVersion !== 1) {
    throw new Error(
      `Invalid pricing snapshot schemaVersion (expected 1): ${absPath}`,
    );
  }
  const pricesRaw = parsed.prices;
  if (!isRecord(pricesRaw)) {
    throw new Error(`Invalid pricing snapshot (missing prices): ${absPath}`);
  }
  const map = new Map<string, FalUnitPricing>();
  for (const [endpointId, row] of Object.entries(pricesRaw)) {
    const p = parsePricingRow(row, endpointId);
    if (p) {
      map.set(endpointId, p);
    }
  }
  return map;
}

/** Write snapshot sorted by endpoint id (stable diff). */
export async function writeFalUnitPricingSnapshot(
  absPath: string,
  map: Map<string, FalUnitPricing>,
): Promise<void> {
  const sortedKeys = [...map.keys()].sort((a, b) => a.localeCompare(b));
  const prices: Record<string, FalUnitPricing> = {};
  for (const k of sortedKeys) {
    const v = map.get(k);
    if (v) {
      prices[k] = v;
    }
  }
  const body: FalUnitPricingSnapshotFile = {
    schemaVersion: 1,
    writtenAt: new Date().toISOString(),
    prices,
  };
  await writeFile(absPath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

export interface ResolveFalUnitPricingOptions {
  endpointIds: string[];
  apiKey: string | undefined;
  skip: boolean;
  /** If set and the file exists, load snapshot (no network). If set and missing, warn and fetch live. */
  snapshotFile: string | undefined;
  /** Forwarded to {@link fetchFalUnitPricingMap} when fetching live (mode, postCatalogCooldownMs, etc.). */
  fetchOptions?: FetchFalUnitPricingMapOptions;
}

/**
 * Empty map if `skip`; else snapshot when file exists; else live GET /v1/models/pricing.
 */
export async function resolveFalUnitPricingMap(
  opts: ResolveFalUnitPricingOptions,
): Promise<Map<string, FalUnitPricing>> {
  if (opts.skip) {
    return new Map();
  }
  const file = opts.snapshotFile?.trim();
  if (file) {
    if (existsSync(file)) {
      console.log(`Unit pricing: using snapshot ${file}`);
      return readFalUnitPricingSnapshot(file);
    }
    console.warn(
      `Unit pricing: snapshot not found (${file}) — fetching live from FAL…`,
    );
  }
  return fetchFalUnitPricingMap(opts.endpointIds, opts.apiKey, opts.fetchOptions);
}
