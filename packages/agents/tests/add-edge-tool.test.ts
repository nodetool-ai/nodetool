import { describe, it, expect } from "vitest";
import { GraphBuilder } from "../src/graph-builder.js";
import { AddEdgeTool } from "../src/tools/add-edge-tool.js";

type Handle = { name: string; type?: { type: string; type_args?: unknown[] } };

/** Registry stub whose nodes carry typed input/output handles. */
function mockRegistry(
  defs: Record<string, { properties?: Handle[]; outputs?: Handle[] }>
) {
  return {
    has: (t: string) => t in defs,
    getMetadata: (t: string) =>
      t in defs
        ? {
            node_type: t,
            properties: defs[t].properties ?? [],
            outputs: defs[t].outputs ?? []
          }
        : null
  } as never;
}

const ctx = {} as never;

describe("AddEdgeTool type validation", () => {
  function setup() {
    const builder = new GraphBuilder();
    const registry = mockRegistry({
      "test.StringSource": { outputs: [{ name: "output", type: { type: "str" } }] },
      "test.IfNode": {
        properties: [{ name: "condition", type: { type: "bool" } }],
        outputs: [{ name: "if_true", type: { type: "any" } }]
      }
    });
    builder.addNode("src", "test.StringSource");
    builder.addNode("if1", "test.IfNode");
    return new AddEdgeTool(builder, registry);
  }

  it("rejects a string output wired into a boolean input", async () => {
    const tool = setup();
    const result = (await tool.process(ctx, {
      source: "src",
      source_handle: "output",
      target: "if1",
      target_handle: "condition"
    })) as { status: string; errors?: string[] };
    expect(result.status).toBe("error");
    expect(result.errors?.[0]).toMatch(/Type mismatch/);
  });

  it("accepts an any-typed target (no false positive)", async () => {
    const builder = new GraphBuilder();
    const registry = mockRegistry({
      "test.StringSource": { outputs: [{ name: "output", type: { type: "str" } }] },
      "test.Sink": { properties: [{ name: "value", type: { type: "any" } }] }
    });
    builder.addNode("src", "test.StringSource");
    builder.addNode("sink", "test.Sink");
    const tool = new AddEdgeTool(builder, registry);
    const result = (await tool.process(ctx, {
      source: "src",
      source_handle: "output",
      target: "sink",
      target_handle: "value"
    })) as { status: string };
    expect(result.status).toBe("edge_added");
  });
});
