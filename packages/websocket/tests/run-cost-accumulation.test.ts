/**
 * What a run is settled at.
 *
 * `provider_cost` on a completed node_update is only how FAL and kie report a
 * charge. Replicate, Gemini, OpenAI, MiniMax and ElevenLabs generation reports
 * itself as a `prediction` message the cost ledger prices against the model
 * catalogs, and that spend used to reach neither `job.cost` nor an app
 * invocation's settlement — those runs settled as "nothing measured" and
 * stayed booked at their estimate forever.
 */
import { describe, expect, it } from "vitest";
import { getModelUnitPrice } from "@nodetool-ai/model-pricing";

import { WebSocketClientSession } from "../src/websocket-client-session.js";

/** A per-image Replicate model the shipped catalog carries. */
const PRICED = {
  provider: "replicate",
  model: "black-forest-labs/flux-dev"
} as const;

const unitPrice = (): number => {
  const price = getModelUnitPrice({
    id: PRICED.model,
    provider: PRICED.provider
  });
  if (!price || typeof price.unit_price !== "number") {
    throw new Error("catalog no longer prices the model this test pins");
  }
  return price.unit_price;
};

type CostAccess = {
  _handleNodeProviderCost(
    active: Record<string, unknown>,
    outbound: Record<string, unknown>
  ): void;
  runMeasuredCost(active: Record<string, unknown>): number | null;
};

const access = (): CostAccess =>
  new WebSocketClientSession({
    resolveExecutor: () => undefined as never
  }) as unknown as CostAccess;

/** What a run's messages settle to, fed through the runner's own accounting. */
function settle(messages: Array<Record<string, unknown>>): number | null {
  const runner = access();
  const active: Record<string, unknown> = {};
  for (const message of messages) {
    runner._handleNodeProviderCost(active, message);
  }
  return runner.runMeasuredCost(active);
}

const prediction = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  type: "prediction",
  status: "completed",
  capability: "text_to_image",
  provider: PRICED.provider,
  model: PRICED.model,
  node_id: "n1",
  params: {},
  ...overrides
});

const nodeCost = (
  nodeId: string,
  amount: unknown
): Record<string, unknown> => ({
  type: "node_update",
  status: "completed",
  node_id: nodeId,
  provider_cost: { provider: "fal", amount }
});

describe("run cost accumulation", () => {
  it("counts a node's self-reported provider charge", () => {
    expect(settle([nodeCost("n1", 0.42)])).toBeCloseTo(0.42);
  });

  it("counts ledger-priced generation the node reports no charge for", () => {
    expect(settle([prediction()])).toBeCloseTo(unitPrice());
  });

  it("adds the two when different nodes spent them", () => {
    expect(
      settle([nodeCost("fal-1", 0.42), prediction({ node_id: "rep-1" })])
    ).toBeCloseTo(0.42 + unitPrice());
  });

  it("does not double-count a node that reports its own charge", () => {
    // Both messages name n1: the provider's own number is authoritative and
    // the catalog estimate for the same generation must not be added to it.
    const both = settle([prediction({ node_id: "n1" }), nodeCost("n1", 0.42)]);
    expect(both).toBeCloseTo(0.42);
    // …in either arrival order.
    expect(
      settle([nodeCost("n1", 0.42), prediction({ node_id: "n1" })])
    ).toBeCloseTo(0.42);
  });

  it("leaves a run nothing measured as null, not zero", () => {
    // Null keeps an app invocation standing at its estimate; a zero would hand
    // spend back that may well have happened.
    expect(settle([])).toBeNull();
    expect(settle([{ type: "node_update", status: "running", node_id: "n1" }]))
      .toBeNull();
  });

  it("ignores a prediction that is not billable spend", () => {
    expect(settle([prediction({ status: "running" })])).toBeNull();
    // Chat and embeddings are token-billed and accounted for elsewhere.
    expect(settle([prediction({ capability: "chat" })])).toBeNull();
    expect(
      settle([prediction({ model: "no-such-model-in-any-catalog" })])
    ).toBeNull();
  });

  it("prices a per-second model at the duration the prediction states", () => {
    const seconds = 6;
    const model = "bytedance/seedance-1-pro";
    const perSecond = getModelUnitPrice(
      { id: model, provider: "replicate" },
      { seconds }
    );
    expect(perSecond?.billing_unit).toBe("seconds");
    const total = settle([
      prediction({
        capability: "text_to_video",
        model,
        params: { duration: seconds }
      })
    ]);
    expect(total).toBeCloseTo(perSecond?.unit_price ?? 0);
    // …and the duration is what makes it that: one second prices lower.
    expect(total).toBeGreaterThan(
      settle([
        prediction({ capability: "text_to_video", model, params: {} })
      ]) ?? 0
    );
  });
});
