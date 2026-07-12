import { describe, it, expect } from "vitest";
import { GraphBuilder } from "../src/graph-builder.js";
import { AddEdgeTool } from "../src/tools/add-edge-tool.js";

type Handle = { name: string; type?: { type: string; type_args?: unknown[] } };

/** Registry stub whose nodes carry typed input/output handles. */
function mockRegistry(
  defs: Record<
    string,
    {
      properties?: Handle[];
      outputs?: Handle[];
      supports_dynamic_inputs?: boolean;
      supports_dynamic_outputs?: boolean;
    }
  >
) {
  return {
    has: (t: string) => t in defs,
    getMetadata: (t: string) =>
      t in defs
        ? {
            node_type: t,
            properties: defs[t].properties ?? [],
            outputs: defs[t].outputs ?? [],
            supports_dynamic_inputs: defs[t].supports_dynamic_inputs ?? false,
            supports_dynamic_outputs: defs[t].supports_dynamic_outputs ?? false
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

  it("accepts an edge into a dynamic-input handle absent from static metadata (#15)", async () => {
    const builder = new GraphBuilder();
    const registry = mockRegistry({
      "test.StringSource": {
        outputs: [{ name: "output", type: { type: "str" } }]
      },
      // A dynamic-input node that also declares a static property.
      "test.Template": {
        properties: [{ name: "template", type: { type: "str" } }],
        supports_dynamic_inputs: true
      }
    });
    builder.addNode("src", "test.StringSource");
    builder.addNode("tpl", "test.Template");
    const tool = new AddEdgeTool(builder, registry);
    const result = (await tool.process(ctx, {
      source: "src",
      source_handle: "output",
      target: "tpl",
      target_handle: "user_name" // not a static property, but dynamic-allowed
    })) as { status: string; errors?: string[] };
    expect(result.status).toBe("edge_added");
  });
});
