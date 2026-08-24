/**
 * The ledger has to be wired into the session, not just exist. Only the
 * websocket runner used to write generation spend, so a `nodetool run`,
 * `workflows run` or `debug` of the very same graph recorded nothing.
 *
 * `ExecutionSession` is the one place every surface constructs a run, so these
 * tests drive a run through it and read the `predictions` table back.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { BaseNode, NodeRegistry, prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Prediction, initTestDb } from "@nodetool-ai/models";
import { ExecutionSession } from "../src/index.js";

const NO_BRIDGE = async () => null;

/** Emits the `prediction` message every generative capability call emits. */
class GenerateImage extends BaseNode {
  static readonly nodeType = "test.execution.GenerateImage";
  static readonly title = "Generate Image";
  static readonly description = "Emits a completed image generation";

  @prop({ type: "str", default: "" })
  declare prompt: string;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    context?.emit({
      type: "prediction",
      id: "pred-1",
      user_id: "1",
      node_id: "gen",
      provider: "replicate",
      model: "black-forest-labs/flux-schnell",
      capability: "text_to_image",
      status: "completed",
      params: {}
    });
    return { output: "image-bytes" };
  }
}

/** Reports its own charge the way the FAL and kie nodes do. */
class BilledNode extends BaseNode {
  static readonly nodeType = "test.execution.Billed";
  static readonly title = "Billed";
  static readonly description = "Reports a provider charge for itself";

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    context?.setProviderCost("fal", 0.045, "USD", {
      model: "fal-ai/flux/schnell",
      billing_unit: "megapixels",
      quantity: 1.5,
      unit_price: 0.03,
      currency: "USD"
    });
    return { output: "done" };
  }
}

function registryWith(...nodes: Array<typeof BaseNode>): NodeRegistry {
  const registry = new NodeRegistry();
  for (const node of nodes) registry.register(node);
  return registry;
}

/** The ledger writes without blocking the run; let those writes settle. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

async function ledgerRows(): Promise<Prediction[]> {
  const [rows] = await Prediction.paginate("1", { limit: 100 });
  return rows;
}

describe("ExecutionSession cost ledger", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("records a generation the run paid for", async () => {
    const session = await ExecutionSession.create({
      graph: {
        nodes: [{ id: "gen", type: "test.execution.GenerateImage" }],
        edges: []
      },
      registry: registryWith(GenerateImage),
      bridgeFactory: NO_BRIDGE,
      workflowId: "wf-1"
    });

    expect((await session.result).status).toBe("completed");
    await settle();

    const [row] = await ledgerRows();
    expect(row).toBeDefined();
    expect(row.provider).toBe("replicate");
    expect(row.model).toBe("black-forest-labs/flux-schnell");
    expect(row.node_type).toBe("test.execution.GenerateImage");
    expect(row.workflow_id).toBe("wf-1");
    expect(row.billing_unit).toBe("images");
    expect(row.cost).toBeGreaterThan(0);
  });

  it("records a node's self-reported charge exactly once", async () => {
    const session = await ExecutionSession.create({
      graph: {
        nodes: [{ id: "billed", type: "test.execution.Billed" }],
        edges: []
      },
      registry: registryWith(BilledNode),
      bridgeFactory: NO_BRIDGE,
      workflowId: "wf-2"
    });

    expect((await session.result).status).toBe("completed");
    await settle();

    const rows = await ledgerRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].provider).toBe("fal");
    expect(rows[0].cost).toBe(0.045);
    expect(rows[0].billing_unit).toBe("megapixels");
  });

  it("writes nothing when the host records the spend itself", async () => {
    const session = await ExecutionSession.create({
      graph: {
        nodes: [{ id: "gen", type: "test.execution.GenerateImage" }],
        edges: []
      },
      registry: registryWith(GenerateImage),
      bridgeFactory: NO_BRIDGE,
      recordCosts: false
    });

    expect((await session.result).status).toBe("completed");
    await settle();

    expect(await ledgerRows()).toHaveLength(0);
  });
});
