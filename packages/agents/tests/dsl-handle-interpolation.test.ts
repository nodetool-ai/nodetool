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

  it("wires an array of handles into one edge per element", async () => {
    const { graph, error } = await evaluateGraphDsl(`
      const a = node("nodetool.constant.String", { value: "hello" }, "a");
      const b = node("nodetool.constant.String", { value: "world" }, "b");
      node("lib.grid.CombineImageGrid", {
        tiles: [a.output(), b.output()],
        columns: 2
      }, "grid");
      return graph();
    `);

    expect(error).toBeUndefined();
    const grid = graph!.nodes.find((n) => n.id === "grid");
    // The wired list is carried by the edges, not stored as a property.
    expect(grid!.properties).toEqual({ columns: 2 });
    expect(
      graph!.edges.filter((e) => e.target === "grid" && e.targetHandle === "tiles")
    ).toEqual([
      { source: "a", sourceHandle: "output", target: "grid", targetHandle: "tiles" },
      { source: "b", sourceHandle: "output", target: "grid", targetHandle: "tiles" }
    ]);
  });

  it("rejects an array mixing wired outputs and literal values", async () => {
    const { graph, error } = await evaluateGraphDsl(`
      const a = node("nodetool.constant.String", { value: "hello" }, "a");
      node("lib.grid.CombineImageGrid", {
        tiles: [a.output(), "literal"],
        columns: 2
      }, "grid");
      return graph();
    `);

    expect(graph).toBeUndefined();
    expect(error).toContain('"tiles"');
    expect(error).toContain("mixes wired outputs and literal values");
  });

  it("rejects a handle buried inside an object value", async () => {
    const { graph, error } = await evaluateGraphDsl(`
      const a = node("nodetool.constant.String", { value: "hello" }, "a");
      node("nodetool.agents.Agent", {
        options: { source: a.output() }
      }, "agent");
      return graph();
    `);

    expect(graph).toBeUndefined();
    expect(error).toContain('"options.source"');
    expect(error).toContain("not wired");
  });
});
