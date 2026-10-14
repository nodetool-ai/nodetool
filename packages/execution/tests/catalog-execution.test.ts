import { describe, expect, it, vi } from "vitest";
import { BaseNode, NodeRegistry, getNodeMetadata, prop } from "@nodetool-ai/node-sdk";
import { MissingPackError } from "@nodetool-ai/node-catalog";
import { createExecutorResolver } from "../src/executor-resolver.js";
import { ExecutionSession } from "../src/session.js";

const jobCreate = vi.hoisted(() => vi.fn());
vi.mock("@nodetool-ai/models", async (importOriginal) => {
  const original = await importOriginal<typeof import("@nodetool-ai/models")>();
  return { ...original, Job: { create: jobCreate } };
});

class UnloadedFixture extends BaseNode {
  static readonly nodeType = "huggingface.test.CatalogFixture";
  static readonly title = "Catalog fixture";
  static readonly description = "";

  @prop({ type: "str", required: true, default: "" })
  declare prompt: string;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }
}

function registry(): NodeRegistry {
  const result = new NodeRegistry();
  result.loadCatalog([{
    node_type: UnloadedFixture.nodeType, pack: "huggingface", metadata: getNodeMetadata(UnloadedFixture), declared: UnloadedFixture.getDeclaredProperties()
  }]);
  return result;
}

const graph = { nodes: [{ id: "fixture", type: UnloadedFixture.nodeType, properties: {} }], edges: [] };

describe("catalog-only execution refusal", () => {
  it("refuses a catalog type before a Python namespace resolver can claim it", () => {
    const resolver = createExecutorResolver(registry(), null);
    expect(() => resolver({ id: "fixture", type: UnloadedFixture.nodeType, properties: {} })).toThrow(MissingPackError);
  });

  it("refuses catalog execution before connecting a bridge, even with preflight disabled", async () => {
    const bridgeFactory = vi.fn(async () => null);
    await expect(ExecutionSession.create({ graph, registry: registry(), bridgeFactory, preflight: false })).rejects.toThrow(MissingPackError);
    expect(bridgeFactory).not.toHaveBeenCalled();
  });

  it("reports property issues and the missing pack before ensurePythonBridge or job creation", async () => {
    const { runWorkflow } = await import("../src/service/workflow-run.js");
    const ensurePythonBridge = vi.fn(async () => undefined);
    const outcome = await runWorkflow({ graph, userId: "1", environment: { registry: registry(), ensurePythonBridge } });
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.status).toBe(400);
      expect(outcome.detail).toContain('Required property "prompt" is not set');
      expect(outcome.detail).toContain('pack "huggingface"');
    }
    expect(ensurePythonBridge).not.toHaveBeenCalled();
    expect(jobCreate).not.toHaveBeenCalled();
  });
});
