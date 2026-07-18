/**
 * Pure pre-run cost estimation for a workflow graph.
 *
 * Walks the nodes, resolves per-node unit pricing attached to node metadata
 * (`fal_unit_pricing` first, then `kie_unit_pricing`), multiplies by an expected
 * run count, and returns a {@link WorkflowCostEstimate}. Nodes without a known
 * price are still reported (cost 0, confidence "unknown") and counted, never
 * hidden — the plan-before-spend view must surface uncertainty.
 *
 * No I/O: callers supply a `getMetadata` lookup so this stays hermetic and
 * usable from web, agents, and the CLI alike.
 */

import type {
  NodeCostEstimate,
  WorkflowCostEstimate,
  Budget,
  CostConfidence
} from "@nodetool-ai/protocol";
import type { UnitPricing } from "./pricing-bundle.js";

/** FAL list price as attached to `NodeMetadata.fal_unit_pricing`. */
export interface FalUnitPricingLike extends UnitPricing {
  endpoint_id?: string;
  /** "live" means fetched from the provider this session — treated as exact. */
  source?: "live" | "bundle";
}

/** kie.ai list price as attached to `NodeMetadata.kie_unit_pricing`. */
export interface KieUnitPricingLike extends UnitPricing {
  model_id?: string;
  /** USD conversion of the credit price, when known. Preferred over credits. */
  usd_price?: number;
  source?: "live" | "bundle";
}

/** Minimal slice of `NodeMetadata` this estimator reads. */
export interface NodeMetadataLike {
  fal_unit_pricing?: FalUnitPricingLike | null;
  kie_unit_pricing?: KieUnitPricingLike | null;
}

export interface CostEstimateInput {
  nodes: Array<{ id: string; type: string; data?: Record<string, unknown> }>;
  /** Look up metadata (which may carry fal_unit_pricing / kie_unit_pricing) for a node type. */
  getMetadata: (nodeType: string) => NodeMetadataLike | undefined;
  /** Optional per-node expected run count (fan-out). Defaults to 1. */
  quantities?: Record<string, number>;
  currency?: string;
}

const DEFAULT_CURRENCY = "USD";

function positiveQuantity(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 1;
}

function confidenceFromSource(source: "live" | "bundle" | undefined): CostConfidence {
  return source === "live" ? "exact" : "estimate";
}

interface ResolvedPrice {
  provider: string;
  model: string | null;
  unitPrice: number;
  billingUnit: string;
  confidence: CostConfidence;
}

/** Resolve a node's unit price from metadata: FAL first, then kie, else none. */
function resolvePrice(metadata: NodeMetadataLike | undefined): ResolvedPrice | null {
  const fal = metadata?.fal_unit_pricing;
  if (fal && Number.isFinite(fal.unit_price)) {
    return {
      provider: "fal",
      model: fal.endpoint_id ?? null,
      unitPrice: fal.unit_price,
      billingUnit: fal.billing_unit,
      confidence: confidenceFromSource(fal.source)
    };
  }

  const kie = metadata?.kie_unit_pricing;
  if (kie) {
    // Only the USD conversion enters the total. A raw credit price has no
    // fixed USD value, so folding it in would corrupt the sum — without
    // usd_price the node is reported but stays "unknown" (cost 0).
    const usd = kie.usd_price;
    if (typeof usd === "number" && Number.isFinite(usd)) {
      return {
        provider: "kie",
        model: kie.model_id ?? null,
        unitPrice: usd,
        billingUnit: kie.billing_unit,
        confidence: confidenceFromSource(kie.source)
      };
    }
  }

  return null;
}

export function estimateWorkflowCost(input: CostEstimateInput): WorkflowCostEstimate {
  const currency = input.currency ?? DEFAULT_CURRENCY;
  const quantities = input.quantities ?? {};

  const items: NodeCostEstimate[] = [];
  let total = 0;
  let unknownCount = 0;

  for (const node of input.nodes) {
    const quantity = positiveQuantity(quantities[node.id]);
    const price = resolvePrice(input.getMetadata(node.type));

    if (!price) {
      items.push({
        node_id: node.id,
        node_type: node.type,
        provider: null,
        model: null,
        quantity,
        estimated_cost: 0,
        confidence: "unknown"
      });
      unknownCount += 1;
      continue;
    }

    const estimatedCost = price.unitPrice * quantity;
    total += estimatedCost;
    items.push({
      node_id: node.id,
      node_type: node.type,
      provider: price.provider,
      model: price.model,
      unit_price: price.unitPrice,
      billing_unit: price.billingUnit,
      quantity,
      estimated_cost: estimatedCost,
      confidence: price.confidence
    });
  }

  return { currency, total, items, unknown_count: unknownCount };
}

/** True when adding this estimate to already-spent budget stays within the cap. */
export function withinBudget(
  estimate: WorkflowCostEstimate,
  budget: Budget
): boolean {
  return estimate.total + budget.spent <= budget.cap;
}
