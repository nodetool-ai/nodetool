import { describe, it, expect, vi } from "vitest";
import { GraphBuilder, AGENT_STEP_NODE_TYPE } from "../src/graph-builder.js";
import { AddNodeTool } from "../src/tools/add-node-tool.js";
import { AddEdgeTool } from "../src/tools/add-edge-tool.js";
import { FinishGraphTool } from "../src/tools/finish-graph-tool.js";

function mockRegistry(knownTypes: string[] = []) {
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
  } as any;
}

function mockContext() {
  return {} as any;
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
      type: AGENT_STEP_NODE_TYPE,
      properties: {
        instructions: "Summarize the input text"
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

  it("rejects agent step without instructions", async () => {
    const builder = new GraphBuilder();
    const registry = mockRegistry();
    const tool = new AddNodeTool(builder, registry);

    const result = (await tool.process(mockContext(), {
      id: "step",
      type: AGENT_STEP_NODE_TYPE,
      properties: {}
    })) as Record<string, unknown>;

    expect(result.status).toBe("error");
    expect((result.errors as string[])[0]).toContain("instructions");
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

  it("allows any handle name for agent step nodes", async () => {
    const builder = new GraphBuilder();
    const registry = mockRegistry();
    builder.addNode("step1", AGENT_STEP_NODE_TYPE, {
      instructions: "Do something"
    });
    builder.addNode("step2", AGENT_STEP_NODE_TYPE, {
      instructions: "Do something else"
    });

    const tool = new AddEdgeTool(builder, registry);
    const result = (await tool.process(mockContext(), {
      source: "step1",
      source_handle: "result",
      target: "step2",
      target_handle: "context"
    })) as Record<string, unknown>;

    expect(result.status).toBe("edge_added");
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

  it("returns validation errors for cycles", async () => {
    const builder = new GraphBuilder();
    builder.addNode("a", "test.Node");
    builder.addNode("b", "test.Node");
    builder.addEdge("a", "out", "b", "in");
    builder.addEdge("b", "out", "a", "in");

    const tool = new FinishGraphTool(builder);
    const result = (await tool.process(
      mockContext(),
      {}
    )) as Record<string, unknown>;

    expect(result.status).toBe("validation_failed");
    expect((result.errors as string[]).some((e) => e.includes("cycle"))).toBe(
      true
    );
    expect(tool.graph).toBeNull();
  });
});
