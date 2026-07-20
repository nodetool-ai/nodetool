/**
 * Unit tests for the graph DSL evaluator (`src/graph-dsl.ts`): the sandboxed
 * node()/graph() prelude, handle→edge wiring, auto ids, and error surfaces.
 */
import { describe, it, expect } from "vitest";
import { evaluateGraphDsl } from "../src/graph-dsl.js";

describe("evaluateGraphDsl", () => {
  it("builds nodes and derives edges from output handles", async () => {
    const { graph, error } = await evaluateGraphDsl(`
      const input = node("nodetool.input.StringInput", { name: "prompt" });
      const step = node("nodetool.agents.AgentStep", {
        instructions: "Summarize",
        input: input.output()
      });
      node("nodetool.output.StringOutput", { name: "result", value: step.output() });
      return graph();
    `);

    expect(error).toBeUndefined();
    expect(graph).toBeDefined();
    expect(graph!.nodes).toHaveLength(3);
    expect(graph!.edges).toEqual([
      {
        source: "string_input",
        sourceHandle: "output",
        target: "agent_step",
        targetHandle: "input"
      },
      {
        source: "agent_step",
        sourceHandle: "output",
        target: "string_output",
        targetHandle: "value"
      }
    ]);
    // Handle values are stripped from properties; plain values stay.
    const step = graph!.nodes.find((n) => n.id === "agent_step")!;
    expect(step.properties).toEqual({ instructions: "Summarize" });
  });

  it("derives unique snake_case ids and honors explicit ids", async () => {
    const { graph } = await evaluateGraphDsl(`
      node("nodetool.image.TextToImage", { prompt: "a" });
      node("nodetool.image.TextToImage", { prompt: "b" });
      node("nodetool.image.TextToImage", { prompt: "c" }, "hero_image");
      return graph();
    `);

    expect(graph!.nodes.map((n) => n.id)).toEqual([
      "text_to_image",
      "text_to_image_2",
      "hero_image"
    ]);
  });

  it("supports named output slots", async () => {
    const { graph } = await evaluateGraphDsl(`
      const cond = node("nodetool.control.If", { condition: true });
      node("nodetool.output.StringOutput", { name: "yes", value: cond.output("if_true") });
      node("nodetool.output.StringOutput", { name: "no", value: cond.output("if_false") });
      return graph();
    `);

    expect(graph!.edges.map((e) => e.sourceHandle).sort()).toEqual([
      "if_false",
      "if_true"
    ]);
  });

  it("supports plain JS for repetition", async () => {
    const { graph } = await evaluateGraphDsl(`
      const prompts = ["fox", "owl", "bear"];
      for (const p of prompts) {
        node("nodetool.image.TextToImage", { prompt: "a " + p });
      }
      return graph();
    `);
    expect(graph!.nodes).toHaveLength(3);
  });

  it("reports syntax errors as error text", async () => {
    const { graph, error } = await evaluateGraphDsl(`const x = ;`);
    expect(graph).toBeUndefined();
    expect(error).toMatch(/SyntaxError|unexpected/i);
  });

  it("reports runtime errors from the program", async () => {
    const { graph, error } = await evaluateGraphDsl(`
      node(42, {});
      return graph();
    `);
    expect(graph).toBeUndefined();
    expect(error).toContain("type must be a non-empty string");
  });

  it("rejects a program that does not return graph()", async () => {
    const { graph, error } = await evaluateGraphDsl(`
      node("nodetool.agents.AgentStep", { instructions: "x" });
      return "done";
    `);
    expect(graph).toBeUndefined();
    expect(error).toContain("return graph();");
  });

  it("rejects an empty program", async () => {
    const { error } = await evaluateGraphDsl("   ");
    expect(error).toBe("Program is empty.");
  });
});
