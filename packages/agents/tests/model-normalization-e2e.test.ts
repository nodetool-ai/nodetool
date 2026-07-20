import { describe, it, expect } from "vitest";
import { GraphBuilder } from "../src/graph-builder.js";
import { SubmitGraphTool } from "../src/tools/submit-graph-tool.js";

// Mirrors the planner's real output: `find_model` gives {provider, model_id},
// the prompt asks for a `{provider, id}` object, so a bare pair reaches the
// graph. What lands in the saved workflow must still be a complete model.
const registry = {
  has: () => true,
  getMetadata: () =>
    ({
      properties: [
        { name: "model", type: { type: "language_model" } },
        { name: "prompt", type: { type: "str" } },
        { name: "system", type: { type: "str" } }
      ],
      outputs: [{ name: "text", type: { type: "str" } }]
    }) as any
} as any;

describe("planner model normalization (end to end)", () => {
  it("completes bare models in a submitted graph program", async () => {
    const tool = new SubmitGraphTool(registry);
    const result = (await tool.process({} as any, {
      code: `node("nodetool.agents.Agent", {
        model: { provider: "openai", id: "gpt-5-mini" },
        prompt: "Write a poem"
      }, "agent");
return graph();`
    })) as Record<string, unknown>;

    expect(result.status).toBe("graph_accepted");

    const model = (tool.graph!.nodes[0].properties as any).model;
    expect(model).toEqual({
      type: "language_model",
      provider: "openai",
      id: "gpt-5-mini",
      name: "gpt-5-mini",
      path: null,
      supported_tasks: []
    });
  });
});
