import { describe, it, expect } from "vitest";
import { validateGraph, validateNodeProperties } from "@nodetool-ai/node-sdk";
import { GraphBuilder } from "../src/graph-builder.js";
import { metadataAwareRegistry } from "../src/tools/graph-validation-registry.js";
import { normalizeModelProperties } from "../src/normalize-model-properties.js";

// `validateNodeProperties` consumes @prop declarations; `getMetadata`
// returns the flattened NodeMetadata shape. They differ, so both are here.
const DECLARED = [
  { name: "model", options: { type: "language_model" } },
  { name: "prompt", options: { type: "str", required: true } }
] as any;

const AGENT_META = {
  properties: [
    { name: "model", type: { type: "language_model" } },
    { name: "prompt", type: { type: "str" } }
  ],
  outputs: [{ name: "text", type: { type: "str" } }]
} as any;

/** A registry that runs the real property validator. */
const realRegistry = {
  has: () => true,
  getMetadata: () => AGENT_META,
  validateNode: (descriptor: any, connected?: ReadonlySet<string>) =>
    validateNodeProperties(DECLARED, descriptor.properties ?? {}, {
      nodeId: descriptor.id,
      nodeType: descriptor.type,
      connectedHandles: connected
    })
} as any;

/** One Agent node, validated the way an authored graph is. */
function validateAgent(
  properties: Record<string, unknown>,
  registry: typeof realRegistry = realRegistry
): string[] {
  const builder = new GraphBuilder();
  builder.addNode(
    "agent",
    "nodetool.agents.Agent",
    normalizeModelProperties("nodetool.agents.Agent", properties, registry)
  );
  const report = validateGraph(
    builder.snapshot(),
    metadataAwareRegistry(registry)
  );
  return report.issues
    .filter((i) => i.severity === "error")
    .map((i) => i.message);
}

describe("authored graph validation — models", () => {
  it("the underlying validator does flag an unset model", () => {
    const issues = validateNodeProperties(
      DECLARED,
      { prompt: "hi" },
      { nodeId: "agent", nodeType: "nodetool.agents.Agent" }
    );

    expect(issues.map((i) => i.code)).toContain("unset_model");
  });

  it("the authoring registry suppresses unset-model issues", () => {
    const issues = metadataAwareRegistry(realRegistry).validateNode(
      {
        id: "agent",
        type: "nodetool.agents.Agent",
        properties: { prompt: "hi" }
      },
      new Set()
    );

    expect(issues.map((i) => i.code)).not.toContain("unset_model");
  });

  it("still surfaces other property issues", () => {
    const issues = metadataAwareRegistry(realRegistry).validateNode(
      { id: "agent", type: "nodetool.agents.Agent", properties: {} },
      new Set()
    );

    expect(issues.map((i) => i.code)).toContain("required");
  });

  // The behaviour that matters: the agent is told to omit `model`, so a graph
  // that does so must be accepted rather than pushed into pinning one.
  it("accepts an Agent node with no model", () => {
    expect(validateAgent({ prompt: "Write a poem" })).toEqual([]);
  });

  // Omitting a model is the intended output; pinning a wrong one is not.
  // `NodeRegistry` carries no provider catalog, so before these two hooks were
  // forwarded a hallucinated provider/model reached the finished graph.
  describe("a model the graph does pin", () => {
    const catalogRegistry = {
      ...realRegistry,
      listProviderIds: () => ["kie"],
      listModelIds: (provider: string, modelType: string) =>
        provider === "kie" && modelType === "language_model"
          ? ["kimi/k2"]
          : undefined
    } as any;

    const errorsFor = (model: string, provider = "kie") =>
      validateAgent(
        {
          prompt: "hi",
          model: { type: "language_model", provider, id: model }
        },
        catalogRegistry
      );

    it("rejects a provider the runtime cannot construct", () => {
      expect(errorsFor("kimi/k2", "nonesuch").join("\n")).toContain("nonesuch");
    });

    it("rejects a model id the provider does not offer", () => {
      expect(errorsFor("kimi/k3").join("\n")).toContain("kimi/k2");
    });

    it("accepts a pair the catalogs know", () => {
      expect(errorsFor("kimi/k2")).toEqual([]);
    });
  });
});
