/**
 * `nodetool costs` reported nothing for a session whose spend was almost
 * entirely image and video generation: only LLM calls reached the ledger, so a
 * multi-hour render read as free.
 *
 * These tests pin the write. A run that generates an image or a video lands a
 * `predictions` row carrying the billing unit, the quantity and the unit price
 * behind the charge; a model no catalog covers still lands a row, with a null
 * cost, so the call is visible and countable as unpriced rather than summed as
 * free.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { Prediction, initTestDb } from "@nodetool-ai/models";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import {
  attachRunCostLedger,
  isUnitBilledCapability,
  priceGeneration,
  recordFromMessage,
  recordGenerationSpend,
  recordNodeProviderCost
} from "../src/cost-ledger.js";

/**
 * Models the shipped GenSpend catalog prices, one per billing class. The tests
 * assert relations (unit × quantity, one duration against another) rather than
 * the figures — the nightly pricing sync moves those. The durations used stay
 * inside the model's published `clip_seconds` envelope, outside which the
 * catalog declines to price rather than extrapolating.
 */
const PER_IMAGE = {
  provider: "replicate",
  model: "black-forest-labs/flux-schnell"
};
const PER_SECOND = { provider: "replicate", model: "bytedance/seedance-1-pro" };

const USER = "u1";

async function rows(): Promise<Prediction[]> {
  const [items] = await Prediction.paginate(USER, { limit: 100 });
  return items;
}

describe("priceGeneration", () => {
  it("prices a per-image model and multiplies by the images produced", () => {
    const one = priceGeneration({ userId: USER, ...PER_IMAGE, quantity: 1 });
    const four = priceGeneration({ userId: USER, ...PER_IMAGE, quantity: 4 });

    expect(one).not.toBeNull();
    expect(one!.billing_unit).toBe("images");
    expect(one!.currency).toBe("USD");
    expect(one!.unit_price).toBeGreaterThan(0);
    expect(one!.cost).toBeCloseTo(one!.unit_price);
    expect(four!.cost).toBeCloseTo(one!.unit_price * 4);
  });

  it("prices a per-second model off the duration the job stated", () => {
    const five = priceGeneration({
      userId: USER,
      ...PER_SECOND,
      params: { duration_seconds: 5, resolution: "720p" }
    });
    const ten = priceGeneration({
      userId: USER,
      ...PER_SECOND,
      params: { duration_seconds: 10, resolution: "720p" }
    });

    expect(five).not.toBeNull();
    expect(five!.billing_unit).toBe("seconds");
    expect(ten!.cost).toBeCloseTo(five!.cost * 2);
  });

  it("answers null for a model no catalog carries", () => {
    expect(
      priceGeneration({
        userId: USER,
        provider: "replicate",
        model: "totally-not-a-real-model-xyz"
      })
    ).toBeNull();
  });
});

describe("isUnitBilledCapability", () => {
  it("covers generation and excludes the token-billed capabilities", () => {
    expect(isUnitBilledCapability("text_to_image")).toBe(true);
    expect(isUnitBilledCapability("image_to_video")).toBe(true);
    expect(isUnitBilledCapability("text_to_speech")).toBe(true);
    // Chat and embeddings are accounted for in tokens by BaseProvider.
    expect(isUnitBilledCapability("generate_message")).toBe(false);
    expect(isUnitBilledCapability("generate_messages")).toBe(false);
    expect(isUnitBilledCapability("generate_embedding")).toBe(false);
    expect(isUnitBilledCapability(null)).toBe(false);
  });
});

describe("recordGenerationSpend", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("writes the units and the unit price alongside the cost", async () => {
    await recordGenerationSpend({
      userId: USER,
      ...PER_SECOND,
      capability: "image_to_video",
      params: { duration_seconds: 5, resolution: "720p" },
      nodeId: "n1",
      nodeType: "nodetool.video.ImageToVideo",
      workflowId: "wf-1",
      durationMs: 42_000
    });

    const [row] = await rows();
    expect(row.provider).toBe("replicate");
    expect(row.model).toBe(PER_SECOND.model);
    expect(row.node_id).toBe("n1");
    expect(row.workflow_id).toBe("wf-1");
    expect(row.billing_unit).toBe("seconds");
    expect(row.quantity).toBe(1);
    expect(row.currency).toBe("USD");
    expect(row.unit_price).toBeGreaterThan(0);
    expect(row.cost).toBeCloseTo(row.unit_price!);
    expect(row.duration).toBe(42);
    expect(row.metadata?.capability).toBe("image_to_video");
  });

  it("records an unpriced model with a null cost, not a zero", async () => {
    await recordGenerationSpend({
      userId: USER,
      provider: "replicate",
      model: "totally-not-a-real-model-xyz",
      capability: "text_to_image"
    });

    const [row] = await rows();
    expect(row.cost).toBeNull();
    expect(row.unit_price).toBeNull();
    expect(row.metadata?.unpriced_reason).toContain(
      "totally-not-a-real-model-xyz"
    );

    // A null cost is countable, which is what keeps the report honest: the
    // call is present and flagged rather than summed in as free.
    const summary = await Prediction.aggregateByUser(USER);
    expect(summary.call_count).toBe(1);
    expect(summary.unpriced_count).toBe(1);
    expect(summary.total_cost).toBe(0);
  });
});

describe("recordNodeProviderCost", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("keeps the provider's own number and its units", async () => {
    await recordNodeProviderCost({
      userId: USER,
      cost: {
        provider: "fal",
        amount: 0.045,
        unit: "USD",
        model: "fal-ai/flux/schnell",
        billing_unit: "megapixels",
        quantity: 1.5,
        unit_price: 0.03,
        currency: "USD"
      },
      nodeId: "n2",
      nodeType: "fal.text_to_image.FluxSchnell",
      workflowId: "wf-2"
    });

    const [row] = await rows();
    expect(row.cost).toBe(0.045);
    expect(row.billing_unit).toBe("megapixels");
    expect(row.quantity).toBe(1.5);
    expect(row.unit_price).toBe(0.03);
  });

  it("records provider, model and tokens for a text model's charge", async () => {
    // An LLM node's `generateLoop` delta arrives here. Without provider and
    // model on the row, `nodetool costs` cannot say which model spent the money.
    await recordNodeProviderCost({
      userId: USER,
      cost: {
        provider: "openai",
        amount: 0.0042,
        unit: "USD",
        model: "gpt-4o-mini",
        currency: "USD",
        billing_unit: "tokens",
        quantity: 300,
        input_tokens: 200,
        output_tokens: 100,
        cached_tokens: null
      },
      nodeId: "agent-1",
      nodeType: "nodetool.agents.Agent",
      workflowId: "wf-4"
    });

    const [row] = await rows();
    expect(row.provider).toBe("openai");
    expect(row.model).toBe("gpt-4o-mini");
    expect(row.cost).toBe(0.0042);
    expect(row.input_tokens).toBe(200);
    expect(row.output_tokens).toBe(100);
    expect(row.node_id).toBe("agent-1");
  });

  it("records nothing for a non-finite amount", async () => {
    await recordNodeProviderCost({
      userId: USER,
      cost: { provider: "fal", amount: Number.NaN, unit: "USD" },
      nodeId: "n2",
      nodeType: "fal.text_to_image.FluxSchnell",
      workflowId: null
    });

    expect(await rows()).toHaveLength(0);
  });
});

describe("recordFromMessage", () => {
  beforeEach(() => {
    initTestDb();
  });

  const options = {
    userId: USER,
    workflowId: "wf-3",
    nodeType: (id: string) => (id === "n1" ? "nodetool.image.TextToImage" : "")
  };

  it("ledgers a completed generation prediction", async () => {
    await recordFromMessage(
      {
        type: "prediction",
        id: "p1",
        user_id: USER,
        node_id: "n1",
        provider: PER_IMAGE.provider,
        model: PER_IMAGE.model,
        capability: "text_to_image",
        status: "completed",
        params: {},
        duration: 1_500
      },
      options
    );

    const [row] = await rows();
    expect(row.model).toBe(PER_IMAGE.model);
    expect(row.node_type).toBe("nodetool.image.TextToImage");
    expect(row.cost).toBeGreaterThan(0);
  });

  it("opens a running generation as an unpriced open row and ignores a chat completion", async () => {
    const base = {
      type: "prediction" as const,
      id: "p2",
      user_id: USER,
      node_id: "n1",
      provider: PER_IMAGE.provider,
      model: PER_IMAGE.model
    };
    await recordFromMessage(
      { ...base, capability: "text_to_image", status: "running" },
      options
    );
    await recordFromMessage(
      { ...base, id: "p3", capability: "generate_message", status: "completed" },
      options
    );

    const open = await rows();
    expect(open).toHaveLength(1);
    expect(open[0].id).toBe("p2");
    expect(open[0].status).toBe("running");
    expect(open[0].cost).toBeNull();
    // An open row is not spend and not unpriced: the aggregate leaves it out.
    const agg = await Prediction.aggregateByUser(USER);
    expect(agg.call_count).toBe(0);
    expect(agg.running_count).toBe(1);
  });

  it("ledgers a node's self-reported charge off node_update", async () => {
    await recordFromMessage(
      {
        type: "node_update",
        node_id: "n2",
        node_name: "Flux",
        node_type: "fal.text_to_image.FluxSchnell",
        status: "completed",
        provider_cost: {
          provider: "fal",
          amount: 0.02,
          unit: "USD",
          model: "fal-ai/flux/schnell"
        }
      },
      options
    );

    const [row] = await rows();
    expect(row.provider).toBe("fal");
    expect(row.cost).toBe(0.02);
    expect(row.workflow_id).toBe("wf-3");
  });
});

describe("attachRunCostLedger", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("records every generation emitted on the run's context, then detaches", async () => {
    const listeners = new Set<(msg: ProcessingMessage) => void>();
    const context = {
      addMessageListener(listener: (msg: ProcessingMessage) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
    const emit = (msg: ProcessingMessage): void => {
      for (const listener of listeners) listener(msg);
    };
    const generation = (id: string): ProcessingMessage => ({
      type: "prediction",
      id,
      user_id: USER,
      node_id: "n1",
      provider: PER_IMAGE.provider,
      model: PER_IMAGE.model,
      capability: "text_to_image",
      status: "completed",
      params: {}
    });

    const detach = attachRunCostLedger(context, {
      userId: USER,
      workflowId: "wf-4"
    });
    emit(generation("p1"));
    emit(generation("p2"));
    // The listener writes without blocking the run; let those writes settle.
    await new Promise((resolve) => setImmediate(resolve));
    expect(await rows()).toHaveLength(2);

    detach();
    emit(generation("p3"));
    await new Promise((resolve) => setImmediate(resolve));
    expect(await rows()).toHaveLength(2);
  });
});
