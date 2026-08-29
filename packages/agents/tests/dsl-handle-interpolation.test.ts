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

  /**
   * "Pass it as the property value itself" answers the one-handle case and
   * nothing else. A model that wants one prompt built from four upstream
   * values has nowhere to go, and in the transcript this came from it rewrote
   * the same template eight times before giving up. The refusal has to name
   * the node that does the job.
   */
  it("names the template node as the way to build a string from handles", async () => {
    const { error } = await evaluateGraphDsl(`
      const a = node("nodetool.input.StringInput", { name: "a" });
      const b = node("nodetool.input.StringInput", { name: "b" });
      node("nodetool.agents.Agent", { prompt: a.output() + " and " + b.output() });
      return graph();
    `);

    expect(error).toContain("nodetool.text.Template");
    expect(error).toContain("{{name}}");
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
      node("lib.svg.Document", {
        elements: [a.output(), b.output()],
        width: 2
      }, "grid");
      return graph();
    `);

    expect(error).toBeUndefined();
    const grid = graph!.nodes.find((n) => n.id === "grid");
    // The wired list is carried by the edges, not stored as a property.
    expect(grid!.properties).toEqual({ width: 2 });
    expect(
      graph!.edges.filter((e) => e.target === "grid" && e.targetHandle === "elements")
    ).toEqual([
      { source: "a", sourceHandle: "output", target: "grid", targetHandle: "elements" },
      { source: "b", sourceHandle: "output", target: "grid", targetHandle: "elements" }
    ]);
  });

  it("rejects an array mixing wired outputs and literal values", async () => {
    const { graph, error } = await evaluateGraphDsl(`
      const a = node("nodetool.constant.String", { value: "hello" }, "a");
      node("lib.svg.Document", {
        elements: [a.output(), "literal"],
        width: 2
      }, "grid");
      return graph();
    `);

    expect(graph).toBeUndefined();
    expect(error).toContain('"elements"');
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
