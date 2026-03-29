/**
 * Build `fal-node-type-pricing.json` for the web app to merge into `/api/nodes/metadata`
 * (Python NodeMetadata has no `fal_unit_pricing`; bundle supplies FAL list prices by node_type).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { FalUnitPricing, NodeSpec } from "./types.js";

export const FAL_NODE_TYPE_PRICING_JSON = "fal-node-type-pricing.json";

export interface FalUnitPricingWire {
  endpoint_id: string;
  unit_price: number;
  billing_unit: string;
  currency: string;
}

export interface FalNodeTypePricingFile {
  schemaVersion: 1;
  writtenAt: string;
  byNodeType: Record<string, FalUnitPricingWire>;
}

function moduleId(moduleName: string): string {
  return moduleName.replace(/-/g, "_");
}

function toWire(p: FalUnitPricing): FalUnitPricingWire {
  return {
    endpoint_id: p.endpointId,
    unit_price: p.unitPrice,
    billing_unit: p.billingUnit,
    currency: p.currency,
  };
}

/** Keys: `fal.<module_id>.<ClassName>` — matches `static nodeType` in generated modules. */
export function collectPricingByNodeType(
  moduleName: string,
  specs: NodeSpec[],
): Record<string, FalUnitPricingWire> {
  const mid = moduleId(moduleName);
  const out: Record<string, FalUnitPricingWire> = {};
  for (const spec of specs) {
    const pricing = spec.falUnitPricing;
    if (pricing == null) {
      continue;
    }
    out[`fal.${mid}.${spec.className}`] = toWire(pricing);
  }
  return out;
}

export async function writeFalNodeTypePricingFull(
  outputDir: string,
  byNodeType: Record<string, FalUnitPricingWire>,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    return;
  }
  await mkdir(outputDir, { recursive: true });
  const path = join(outputDir, FAL_NODE_TYPE_PRICING_JSON);
  const payload: FalNodeTypePricingFile = {
    schemaVersion: 1,
    writtenAt: new Date().toISOString(),
    byNodeType,
  };
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`);
}

export async function mergeFalNodeTypePricingFile(
  outputDir: string,
  chunk: Record<string, FalUnitPricingWire>,
  dryRun: boolean,
): Promise<void> {
  if (dryRun || Object.keys(chunk).length === 0) {
    return;
  }
  await mkdir(outputDir, { recursive: true });
  const path = join(outputDir, FAL_NODE_TYPE_PRICING_JSON);
  let existing: Record<string, FalUnitPricingWire> = {};
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<FalNodeTypePricingFile>;
    if (parsed.byNodeType && typeof parsed.byNodeType === "object") {
      existing = parsed.byNodeType;
    }
  } catch {
    // Missing or invalid — start from chunk only
  }
  const byNodeType = { ...existing, ...chunk };
  const payload: FalNodeTypePricingFile = {
    schemaVersion: 1,
    writtenAt: new Date().toISOString(),
    byNodeType,
  };
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`);
}
