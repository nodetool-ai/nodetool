import { describe, expect, it } from "vitest";
import type { Graph } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import type { NodeMetadata } from "../src/metadata.js";
import { applyWorkflowDocumentTool } from "../src/workflow-document-tools.js";

function metadata(
  nodeType: string,
  inputs: Record<string, string>,
  outputs: Record<string, string>
): NodeMetadata {
  return {
    title: nodeType,
    description: "",
    namespace: "test",
    node_type: nodeType,
    properties: Object.entries(inputs).map(([name, type]) => ({
      name,
      required: true,
      type: { type, type_args: [] }
    })),
    outputs: Object.entries(outputs).map(([name, type]) => ({
      name,
      type: { type, type_args: [] }
    }))
  };
}

const metadataByType: Record<string, NodeMetadata> = {
  "test.Source": metadata("test.Source", {}, { output: "str" }),
  "test.Sink": metadata("test.Sink", { value: "str" }, {}),
  "test.NumberSink": metadata("test.NumberSink", { value: "float" }, {}),
  "nodetool.code.Code": {
    ...metadata("nodetool.code.Code", { code: "str" }, {}),
    properties: [
      { name: "code", required: false, type: { type: "str", type_args: [] } }
    ]
  }
};

const options = {
  workflowId: "workflow-1",
  resolveMetadata: (type: string) => metadataByType[type],
  createEdgeId: () => "edge-1"
};

const emptyGraph = (): Graph => ({ nodes: [], edges: [] });

describe("applyWorkflowDocumentTool", () => {
  it("stores nodes in the persisted workflow shape", () => {
    const applied = applyWorkflowDocumentTool(
      emptyGraph(),
      "ui_add_node",
      {
        id: "source",
        type: "test.Source",
        position: { x: 10, y: 20 },
        properties: { prompt: "hello" }
      },
      options
    );

    expect(applied.changed).toBe(true);
    expect(applied.graph.nodes[0]).toMatchObject({
      id: "source",
      type: "test.Source",
      data: { prompt: "hello" },
      ui_properties: { position: { x: 10, y: 20 } }
    });
    expect(applied.graph.nodes[0].data).not.toHaveProperty("properties");
  });

  it("projects persisted nodes into the frontend tool shape", () => {
    const graph: Graph = {
      nodes: [
        {
          id: "source",
          type: "test.Source",
          data: { prompt: "hello" },
          ui_properties: { position: { x: 10, y: 20 }, title: "Source" }
        }
      ],
      edges: []
    };

    const applied = applyWorkflowDocumentTool(
      graph,
      "ui_get_graph",
      {},
      options
    );

    expect(applied.result).toMatchObject({
      workflow_id: "workflow-1",
      nodes: [
        {
          position: { x: 10, y: 20 },
          data: { properties: { prompt: "hello" }, title: "Source" }
        }
      ]
    });
    expect(applied.changed).toBe(false);
  });

  it("merges property updates without erasing existing values", () => {
    const graph: Graph = {
      nodes: [
        {
          id: "source",
          type: "test.Source",
          data: { first: 1, second: 2 }
        }
      ],
      edges: []
    };

    const applied = applyWorkflowDocumentTool(
      graph,
      "ui_update_node_data",
      { node_id: "source", data: { properties: { second: 3 } } },
      options
    );

    expect(applied.graph.nodes[0].data).toEqual({ first: 1, second: 3 });
    expect(graph.nodes[0].data).toEqual({ first: 1, second: 2 });
  });

  it("connects compatible handles and treats duplicates as idempotent", () => {
    const graph: Graph = {
      nodes: [
        { id: "source", type: "test.Source", data: {} },
        { id: "sink", type: "test.Sink", data: {} }
      ],
      edges: []
    };
    const args = {
      source_node_id: "source",
      source_handle: "output",
      target_node_id: "sink",
      target_handle: "value"
    };

    const first = applyWorkflowDocumentTool(
      graph,
      "ui_connect_nodes",
      args,
      options
    );
    const second = applyWorkflowDocumentTool(
      first.graph,
      "ui_connect_nodes",
      args,
      options
    );

    expect(first.graph.edges).toHaveLength(1);
    expect(second.graph.edges).toHaveLength(1);
    expect(second.changed).toBe(false);
    expect(second.result).toMatchObject({ note: "edge already exists" });
  });

  it("rejects incompatible handles and cycles", () => {
    const mismatch: Graph = {
      nodes: [
        { id: "source", type: "test.Source", data: {} },
        { id: "sink", type: "test.NumberSink", data: {} }
      ],
      edges: []
    };
    expect(() =>
      applyWorkflowDocumentTool(
        mismatch,
        "ui_connect_nodes",
        {
          source_node_id: "source",
          source_handle: "output",
          target_node_id: "sink",
          target_handle: "value"
        },
        options
      )
    ).toThrow("Type mismatch");

    const cyclic: Graph = {
      nodes: [
        { id: "a", type: "test.Sink", data: {} },
        { id: "b", type: "test.Sink", data: {} }
      ],
      edges: [
        {
          id: "existing",
          source: "a",
          sourceHandle: "output",
          target: "b",
          targetHandle: "value"
        }
      ]
    };
    metadataByType["test.Sink"].outputs = [
      { name: "output", type: { type: "str", type_args: [] } }
    ];
    expect(() =>
      applyWorkflowDocumentTool(
        cyclic,
        "ui_connect_nodes",
        {
          source_node_id: "b",
          source_handle: "output",
          target_node_id: "a",
          target_handle: "value"
        },
        options
      )
    ).toThrow("would create a cycle");
  });

  it("deletes incident edges with a node", () => {
    const graph: Graph = {
      nodes: [
        { id: "source", type: "test.Source", data: {} },
        { id: "sink", type: "test.Sink", data: {} }
      ],
      edges: [
        {
          id: "edge-1",
          source: "source",
          sourceHandle: "output",
          target: "sink",
          targetHandle: "value"
        }
      ]
    };

    const applied = applyWorkflowDocumentTool(
      graph,
      "ui_delete_node",
      { node_id: "source" },
      options
    );

    expect(applied.graph.nodes.map((node) => node.id)).toEqual(["sink"]);
    expect(applied.graph.edges).toEqual([]);
  });

  it("deletes only the requested edge", () => {
    const source: Graph = {
      nodes: [],
      edges: [
        {
          id: "edge-1",
          source: "a",
          sourceHandle: "output",
          target: "b",
          targetHandle: "value"
        },
        {
          id: "edge-2",
          source: "c",
          sourceHandle: "output",
          target: "d",
          targetHandle: "value"
        }
      ]
    };

    const applied = applyWorkflowDocumentTool(
      source,
      "ui_delete_edge",
      { edge_id: "edge-1" },
      options
    );

    expect(applied.graph.edges.map((edge) => edge.id)).toEqual(["edge-2"]);
  });

  it("reparents children without moving them on screen", () => {
    const source: Graph = {
      nodes: [
        {
          id: "group",
          type: "test.Source",
          data: {},
          ui_properties: { position: { x: 100, y: 200 } }
        },
        {
          id: "child",
          type: "test.Sink",
          parent_id: "group",
          data: {},
          ui_properties: { position: { x: 20, y: 30 } }
        }
      ],
      edges: []
    };

    const applied = applyWorkflowDocumentTool(
      source,
      "ui_delete_node",
      { node_id: "group" },
      options
    );

    expect(applied.graph.nodes).toEqual([
      expect.objectContaining({
        id: "child",
        parent_id: null,
        ui_properties: expect.objectContaining({
          position: { x: 120, y: 230 }
        })
      })
    ]);
  });

  it("stamps inferred Code handles when adding a node", () => {
    const applied = applyWorkflowDocumentTool(
      emptyGraph(),
      "ui_add_node",
      {
        id: "code",
        type: "nodetool.code.Code",
        position: { x: 0, y: 0 },
        properties: { code: "return { sum: inputs.a + inputs.b };" }
      },
      options
    );

    expect(applied.graph.nodes[0].dynamic_properties).toEqual({
      a: "",
      b: ""
    });
    expect(applied.graph.nodes[0].dynamic_outputs).toEqual({
      sum: { type: "any" }
    });
  });

  it("connects to a Code handle the body names even when it is not stored yet", () => {
    const graph: Graph = {
      nodes: [
        { id: "source", type: "test.Source", data: {} },
        {
          id: "code",
          type: "nodetool.code.Code",
          data: { code: "return { out: inputs.text };" },
          dynamic_properties: {},
          dynamic_outputs: {}
        }
      ],
      edges: []
    };

    const applied = applyWorkflowDocumentTool(
      graph,
      "ui_connect_nodes",
      {
        source_node_id: "source",
        source_handle: "output",
        target_node_id: "code",
        target_handle: "text"
      },
      options
    );

    expect(applied.changed).toBe(true);
    expect(applied.graph.edges).toHaveLength(1);
    expect(applied.graph.edges[0].targetHandle).toBe("text");
  });
});
