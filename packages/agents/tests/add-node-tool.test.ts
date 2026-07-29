import { describe, it, expect } from "vitest";
import { GraphBuilder, AGENT_NODE_TYPE } from "../src/graph-builder.js";
import { AddNodeTool } from "../src/tools/add-node-tool.js";
import { AddEdgeTool } from "../src/tools/add-edge-tool.js";
import { FinishGraphTool } from "../src/tools/finish-graph-tool.js";
import { RemoveNodeTool } from "../src/tools/remove-node-tool.js";
import { RemoveEdgeTool } from "../src/tools/remove-edge-tool.js";

// The Agent node is a normal registry node now, so every planner registry
// stub must know it.
function mockRegistry(extraTypes: string[] = []) {
  const knownTypes = [AGENT_NODE_TYPE, ...extraTypes];
  const metadataMap = new Map<string, { node_type: string; properties: Array<{ name: string }>; outputs: Array<{ name: string }> }>();
  for (const t of knownTypes) {
    metadataMap.set(t, {
      node_type: t,
      properties: [{ name: "input" }],
      outputs: [{ name: "output" }]
    });
  }

  return {
    has: (type: string) => knownTypes.includes(type),
    getMetadata: (type: string) => metadataMap.get(type) ?? null
  } as unknown as import("@nodetool-ai/node-sdk").NodeRegistry;
}

function mockContext() {
  return {} as import("@nodetool-ai/runtime").ProcessingContext;
}

describe("AddNodeTool", () => {
  it("adds a deterministic node from registry", async () => {
    const builder = new GraphBuilder();
    const registry = mockRegistry(["nodetool.text.Split"]);
    const tool = new AddNodeTool(builder, registry);

    const result = (await tool.process(mockContext(), {
      id: "split",
      type: "nodetool.text.Split",
      properties: { delimiter: "," }
    })) as Record<string, unknown>;

    expect(result.status).toBe("node_added");
    expect(builder.nodeCount).toBe(1);
    expect(builder.getNode("split")?.type).toBe("nodetool.text.Split");
  });

  it("adds an agent step node", async () => {
    const builder = new GraphBuilder();
    const registry = mockRegistry();
    const tool = new AddNodeTool(builder, registry);

    const result = (await tool.process(mockContext(), {
      id: "step1",
      type: AGENT_NODE_TYPE,
      properties: {
        prompt: "Summarize the input text"
      }
    })) as Record<string, unknown>;

    expect(result.status).toBe("node_added");
    expect(builder.nodeCount).toBe(1);
  });

  it("rejects unknown node types", async () => {
    const builder = new GraphBuilder();
    const registry = mockRegistry();
    const tool = new AddNodeTool(builder, registry);

    const result = (await tool.process(mockContext(), {
      id: "bad",
      type: "nodetool.nonexistent.Node"
    })) as Record<string, unknown>;

    expect(result.status).toBe("error");
    expect((result.errors as string[])[0]).toContain("Unknown node type");
  });

  // add_node runs before any edge exists, so the prompt requirement is
  // enforced at validate() time, not add time — a prompt commonly arrives
  // over an edge rather than as a literal.
  it("accepts an Agent node without a prompt property", async () => {
    const builder = new GraphBuilder();
    const tool = new AddNodeTool(builder, mockRegistry());

    const result = (await tool.process(mockContext(), {
      id: "step",
      type: AGENT_NODE_TYPE,
      properties: {}
    })) as Record<string, unknown>;

    expect(result.status).toBe("node_added");
  });

  it("rejects duplicate ids", async () => {
    const builder = new GraphBuilder();
    const registry = mockRegistry(["test.Node"]);
    const tool = new AddNodeTool(builder, registry);

    await tool.process(mockContext(), { id: "a", type: "test.Node" });
    const result = (await tool.process(mockContext(), {
      id: "a",
      type: "test.Node"
    })) as Record<string, unknown>;

    expect(result.status).toBe("error");
    expect((result.errors as string[])[0]).toContain("Duplicate");
  });
});

describe("AddEdgeTool", () => {
  it("adds a valid edge", async () => {
    const builder = new GraphBuilder();
    const registry = mockRegistry(["test.Node"]);
    builder.addNode("a", "test.Node");
    builder.addNode("b", "test.Node");

    const tool = new AddEdgeTool(builder, registry);
    const result = (await tool.process(mockContext(), {
      source: "a",
      source_handle: "output",
      target: "b",
      target_handle: "input"
    })) as Record<string, unknown>;

    expect(result.status).toBe("edge_added");
    expect(builder.edgeCount).toBe(1);
  });

  it("validates handle names against registry", async () => {
    const builder = new GraphBuilder();
    const registry = mockRegistry(["test.Node"]);
    builder.addNode("a", "test.Node");
    builder.addNode("b", "test.Node");

    const tool = new AddEdgeTool(builder, registry);
    const result = (await tool.process(mockContext(), {
      source: "a",
      source_handle: "nonexistent_output",
      target: "b",
      target_handle: "input"
    })) as Record<string, unknown>;

    expect(result.status).toBe("error");
    expect((result.errors as string[])[0]).toContain("nonexistent_output");
  });

  // Agent nodes are ordinary registry nodes, so their handles are validated
  // like any other node's — they used to be exempt as a virtual type.
  it("validates handles on agent nodes", async () => {
    const builder = new GraphBuilder();
    const registry = mockRegistry();
    builder.addNode("step1", AGENT_NODE_TYPE, { prompt: "Do something" });
    builder.addNode("step2", AGENT_NODE_TYPE, { prompt: "Do something else" });

    const tool = new AddEdgeTool(builder, registry);
    const bad = (await tool.process(mockContext(), {
      source: "step1",
      source_handle: "made_up",
      target: "step2",
      target_handle: "input"
    })) as Record<string, unknown>;
    expect(bad.status).toBe("error");
    expect((bad.errors as string[])[0]).toContain("made_up");

    const ok = (await tool.process(mockContext(), {
      source: "step1",
      source_handle: "output",
      target: "step2",
      target_handle: "input"
    })) as Record<string, unknown>;
    expect(ok.status).toBe("edge_added");
  });
});

describe("RemoveNodeTool / RemoveEdgeTool", () => {
  it("removes a node and its edges", async () => {
    const builder = new GraphBuilder();
    builder.addNode("a", "test.Node");
    builder.addNode("b", "test.Node");
    builder.addEdge("a", "out", "b", "in");

    const tool = new RemoveNodeTool(builder);
    const result = (await tool.process(mockContext(), {
      id: "b"
    })) as Record<string, unknown>;

    expect(result.status).toBe("node_removed");
    expect(result.total_nodes).toBe(1);
    expect(result.total_edges).toBe(0);
  });

  it("errors on a missing node", async () => {
    const tool = new RemoveNodeTool(new GraphBuilder());
    const result = (await tool.process(mockContext(), {
      id: "nope"
    })) as Record<string, unknown>;
    expect(result.status).toBe("error");
    expect((result.errors as string[])[0]).toContain("does not exist");
  });

  it("removes an edge by its endpoint tuple", async () => {
    const builder = new GraphBuilder();
    builder.addNode("a", "test.Node");
    builder.addNode("b", "test.Node");
    builder.addEdge("a", "out", "b", "in");

    const tool = new RemoveEdgeTool(builder);
    const result = (await tool.process(mockContext(), {
      source: "a",
      source_handle: "out",
      target: "b",
      target_handle: "in"
    })) as Record<string, unknown>;

    expect(result.status).toBe("edge_removed");
    expect(builder.edgeCount).toBe(0);
  });

  it("errors on a missing edge and on missing params", async () => {
    const builder = new GraphBuilder();
    const tool = new RemoveEdgeTool(builder);
    const missingParams = (await tool.process(mockContext(), {
      source: "a"
    })) as Record<string, unknown>;
    expect(missingParams.status).toBe("error");

    builder.addNode("a", "test.Node");
    builder.addNode("b", "test.Node");
    const missingEdge = (await tool.process(mockContext(), {
      source: "a",
      source_handle: "out",
      target: "b",
      target_handle: "in"
    })) as Record<string, unknown>;
    expect(missingEdge.status).toBe("error");
    expect((missingEdge.errors as string[])[0]).toContain("does not exist");
  });
});

describe("FinishGraphTool", () => {
  it("finalizes a valid graph", async () => {
    const builder = new GraphBuilder();
    builder.addNode("a", "test.Node");
    builder.addNode("b", "test.Node");
    builder.addEdge("a", "out", "b", "in");

    const tool = new FinishGraphTool(builder);
    const result = (await tool.process(
      mockContext(),
      {}
    )) as Record<string, unknown>;

    expect(result.status).toBe("graph_finalized");
    expect(result.nodes).toBe(2);
    expect(result.edges).toBe(1);
    expect(tool.graph).not.toBeNull();
    expect(tool.graph!.nodes).toHaveLength(2);
  });

  it("rejects a cycle-forming edge at add time", async () => {
    const builder = new GraphBuilder();
    builder.addNode("a", "test.Node");
    builder.addNode("b", "test.Node");
    expect(builder.addEdge("a", "out", "b", "in")).toHaveLength(0);

    // The closing edge b→a is rejected here, so the cycle never enters the
    // graph and finish_graph finalizes the acyclic remainder.
    const cycleErrors = builder.addEdge("b", "out", "a", "in");
    expect(cycleErrors.some((e) => e.includes("cycle"))).toBe(true);

    const tool = new FinishGraphTool(builder);
    const result = (await tool.process(
      mockContext(),
      {}
    )) as Record<string, unknown>;

    expect(result.status).toBe("graph_finalized");
    expect(result.edges).toBe(1);
  });

  it("runs deep validation when the registry supports it", async () => {
    // Registry that knows test.Image and reports its required `model` property
    // as missing — finish_graph must fail with that message instead of letting
    // the broken graph through to runtime.
    const registry = {
      has: (t: string) => t === "test.Image",
      getMetadata: (t: string) =>
        t === "test.Image"
          ? {
              node_type: t,
              title: "Image",
              description: "",
              properties: [{ name: "model", type: { type: "str" } }],
              outputs: [{ name: "output", type: { type: "image" } }]
            }
          : undefined,
      validateNode: (d: { type: string; properties?: Record<string, unknown> }) =>
        d.type === "test.Image" && !(d.properties ?? {})["model"]
          ? [{ message: 'Required property "model" is not set' }]
          : []
    };

    const builder = new GraphBuilder();
    builder.addNode("img", "test.Image", {});
    const tool = new FinishGraphTool(builder, registry);

    const failed = (await tool.process(mockContext(), {})) as Record<
      string,
      unknown
    >;
    expect(failed.status).toBe("validation_failed");
    expect((failed.errors as string[]).join()).toContain('"model"');
    expect(tool.graph).toBeNull();

    // Fix the graph in place (remove + re-add with the property) and finish.
    builder.removeNode("img");
    builder.addNode("img", "test.Image", { model: "m1" });
    const ok = (await tool.process(mockContext(), {})) as Record<
      string,
      unknown
    >;
    expect(ok.status).toBe("graph_finalized");
    expect(tool.graph).not.toBeNull();
  });

  it("treats metadata-only (Python) node types as known during deep validation", async () => {
    const registry = {
      has: () => false,
      getMetadata: () => ({ properties: [], outputs: [] }) as any,
      validateNode: () => []
    };
    const builder = new GraphBuilder();
    builder.addNode("py", "nodetool.python.SomeNode", {});

    const tool = new FinishGraphTool(builder, registry);
    const result = (await tool.process(mockContext(), {})) as Record<
      string,
      unknown
    >;
    expect(result.status).toBe("graph_finalized");
  });

  it("skips deep validation for registries without validateNode", async () => {
    // Stub registries (has/getMetadata only) must not break finish_graph.
    const builder = new GraphBuilder();
    builder.addNode("a", "unknown.Type");
    const tool = new FinishGraphTool(builder, mockRegistry());
    const result = (await tool.process(mockContext(), {})) as Record<
      string,
      unknown
    >;
    expect(result.status).toBe("graph_finalized");
  });
});
