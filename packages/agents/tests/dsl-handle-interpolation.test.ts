import { describe, it, expect } from "vitest";
import { evaluateGraphDsl } from "../src/graph-dsl.js";

describe("graph DSL — handles are not text", () => {
  // The planner's instinct is to compose a prompt around the input. That
  // silently produced "[object Object]" and no edge; it must now fail loudly.
  it("rejects a handle interpolated into a string", async () => {
    const { graph, error } = await evaluateGraphDsl(`
      const input = node("nodetool.input.StringInput", { name: "text" });
      node("nodetool.agents.Agent", {
        prompt: "Summarize this:\\n\\n" + input.output()
      });
      return graph();
    `);

    expect(graph).toBeUndefined();
    expect(error).toMatch(/Cannot use .*\.output\(\) inside a string/);
  });

  it("rejects string concatenation with a handle", async () => {
    const { graph, error } = await evaluateGraphDsl(`
      const input = node("nodetool.input.StringInput", { name: "text" });
      node("nodetool.agents.Agent", { prompt: "Summarize: " + input.output() });
      return graph();
    `);

    expect(graph).toBeUndefined();
    expect(error).toMatch(/Cannot use .*\.output\(\) inside a string/);
  });

  it("still accepts a handle passed as the property value", async () => {
    const { graph, error } = await evaluateGraphDsl(`
      const input = node("nodetool.input.StringInput", { name: "text" });
      node("nodetool.agents.Agent", {
        system: "Summarize the user's text.",
        prompt: input.output()
      }, "agent");
      return graph();
    `);

    expect(error).toBeUndefined();
    expect(graph!.edges).toEqual([
      {
        source: "string_input",
        sourceHandle: "output",
        target: "agent",
        targetHandle: "prompt"
      }
    ]);
  });
});
