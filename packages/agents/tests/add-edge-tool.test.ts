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

describe("AddEdgeTool typed dynamic slots", () => {
  function dynamicSetup() {
    const builder = new GraphBuilder();
    const registry = mockRegistry({
      "test.StringSource": {
        outputs: [{ name: "output", type: { type: "str" } }]
      },
      "test.ImageSource": {
        outputs: [{ name: "output", type: { type: "image" } }]
      },
      "test.UntypedSource": {
        supports_dynamic_outputs: true
      },
      "test.Template": {
        properties: [{ name: "template", type: { type: "str" } }],
        supports_dynamic_inputs: true
      }
    });
    builder.addNode("str", "test.StringSource");
    builder.addNode("img", "test.ImageSource");
    builder.addNode("loose", "test.UntypedSource");
    builder.addNode("tpl", "test.Template");
    return { builder, tool: new AddEdgeTool(builder, registry) };
  }

  it("declares the slot from the source output type", async () => {
    const { builder, tool } = dynamicSetup();
    const result = (await tool.process(ctx, {
      source: "img",
      source_handle: "output",
      target: "tpl",
      target_handle: "portrait"
    })) as { status: string; declared_dynamic_input?: string };

    expect(result.status).toBe("edge_added");
    expect(result.declared_dynamic_input).toBe("image");
    expect(builder.getNode("tpl")?.dynamic_inputs?.["portrait"]).toEqual({
      type: { type: "image" }
    });
  });

  it("rejects a mismatched edge into an already-declared slot", async () => {
    const { tool } = dynamicSetup();
    await tool.process(ctx, {
      source: "img",
      source_handle: "output",
      target: "tpl",
      target_handle: "portrait"
    });

    const result = (await tool.process(ctx, {
      source: "str",
      source_handle: "output",
      target: "tpl",
      target_handle: "portrait"
    })) as { status: string; errors?: string[] };

    expect(result.status).toBe("error");
    expect(result.errors?.[0]).toMatch(/Type mismatch/);
  });

  it("accepts a matching edge into an already-declared slot", async () => {
    const { builder, tool } = dynamicSetup();
    builder.addNode("img2", "test.ImageSource");
    await tool.process(ctx, {
      source: "img",
      source_handle: "output",
      target: "tpl",
      target_handle: "portrait"
    });

    const result = (await tool.process(ctx, {
      source: "img2",
      source_handle: "output",
      target: "tpl",
      target_handle: "portrait"
    })) as { status: string };
    expect(result.status).toBe("edge_added");
  });

  it("leaves the slot undeclared when the source type is unknown", async () => {
    const { builder, tool } = dynamicSetup();
    const result = (await tool.process(ctx, {
      source: "loose",
      source_handle: "anything",
      target: "tpl",
      target_handle: "field"
    })) as { status: string; declared_dynamic_input?: string };

    expect(result.status).toBe("edge_added");
    expect(result.declared_dynamic_input).toBeUndefined();
    expect(builder.getNode("tpl")?.dynamic_inputs).toBeUndefined();
  });

  it("never declares a slot for a static property", async () => {
    const { builder, tool } = dynamicSetup();
    await tool.process(ctx, {
      source: "str",
      source_handle: "output",
      target: "tpl",
      target_handle: "template"
    });
    expect(builder.getNode("tpl")?.dynamic_inputs).toBeUndefined();
  });
});

describe("AddEdgeTool dynamic outputs", () => {
  function outputSetup() {
    const builder = new GraphBuilder();
    const registry = mockRegistry({
      "test.Code": {
        properties: [{ name: "code", type: { type: "str" } }],
        outputs: [{ name: "output", type: { type: "any" } }],
        supports_dynamic_inputs: true,
        supports_dynamic_outputs: true
      },
      "test.Sink": { properties: [{ name: "value", type: { type: "any" } }] },
      "test.StringSource": {
        outputs: [{ name: "output", type: { type: "str" } }]
      }
    });
    builder.addNode("code", "test.Code");
    builder.addNode("sink", "test.Sink");
    builder.addNode("sink2", "test.Sink");
    builder.addNode("str", "test.StringSource");
    return { builder, tool: new AddEdgeTool(builder, registry) };
  }

  it("declares the handle the edge reads", async () => {
    const { builder, tool } = outputSetup();
    const result = (await tool.process(ctx, {
      source: "code",
      source_handle: "line",
      target: "sink",
      target_handle: "value"
    })) as { status: string; declared_dynamic_output?: boolean };

    expect(result.status).toBe("edge_added");
    expect(result.declared_dynamic_output).toBe(true);
    expect(builder.getNode("code")?.dynamic_outputs).toEqual({
      line: { type: "any" }
    });
  });

  it("declares one entry for two edges off the same handle", async () => {
    const { builder, tool } = outputSetup();
    await tool.process(ctx, {
      source: "code",
      source_handle: "line",
      target: "sink",
      target_handle: "value"
    });
    const second = (await tool.process(ctx, {
      source: "code",
      source_handle: "line",
      target: "sink2",
      target_handle: "value"
    })) as { status: string; declared_dynamic_output?: boolean };

    expect(second.status).toBe("edge_added");
    expect(second.declared_dynamic_output).toBeUndefined();
    expect(builder.getNode("code")?.dynamic_outputs).toEqual({
      line: { type: "any" }
    });
  });

  it("never declares a static handle on an ordinary node", async () => {
    const { builder, tool } = outputSetup();
    const result = (await tool.process(ctx, {
      source: "str",
      source_handle: "output",
      target: "sink",
      target_handle: "value"
    })) as { status: string; declared_dynamic_output?: boolean };

    expect(result.status).toBe("edge_added");
    expect(result.declared_dynamic_output).toBeUndefined();
    expect(builder.getNode("str")?.dynamic_outputs).toBeUndefined();
  });

  it("never declares a static handle on a dynamic-output node", async () => {
    const { builder, tool } = outputSetup();
    await tool.process(ctx, {
      source: "code",
      source_handle: "output",
      target: "sink",
      target_handle: "value"
    });
    expect(builder.getNode("code")?.dynamic_outputs).toBeUndefined();
  });
});
