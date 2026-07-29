import { describe, it, expect } from "vitest";
import { validateNodeProperties } from "@nodetool-ai/node-sdk";
import { metadataAwareRegistry } from "../src/tools/finish-graph-tool.js";
import { SubmitGraphTool } from "../src/tools/submit-graph-tool.js";

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

describe("planner graph validation — models", () => {
  it("the underlying validator does flag an unset model", () => {
    const issues = validateNodeProperties(
      DECLARED,
      { prompt: "hi" },
      { nodeId: "agent", nodeType: "nodetool.agents.Agent" }
    );

    expect(issues.map((i) => i.code)).toContain("unset_model");
  });

  it("the planner's registry suppresses unset-model issues", () => {
    const issues = metadataAwareRegistry(realRegistry).validateNode(
      { id: "agent", type: "nodetool.agents.Agent", properties: { prompt: "hi" } },
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

  // The behaviour that matters: the planner is told to omit `model`, so a
  // graph that does so must be accepted rather than pushed into pinning one.
  it("accepts a submitted graph whose Agent node has no model", async () => {
    const tool = new SubmitGraphTool(realRegistry);
    const result = (await tool.process({} as any, {
      code: `node("nodetool.agents.Agent", { prompt: "Write a poem" }, "agent");
return graph();`
    })) as Record<string, unknown>;

    expect(result.status).toBe("graph_accepted");
    expect(tool.graph!.nodes[0].properties).not.toHaveProperty("model");
  });
});
