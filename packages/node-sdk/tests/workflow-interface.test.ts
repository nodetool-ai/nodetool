import { describe, expect, it, vi } from "vitest";
import {
  BaseNode,
  NodeRegistry,
  deriveWorkflowInterfaceV1,
  type NodeMetadata,
  type WorkflowInterfaceRegistry
} from "../src/index.js";

class TypeScriptImageSource extends BaseNode {
  static readonly nodeType = "test.native.ImageSource";
  static readonly title = "Native Image Source";
  static readonly description = "";
  static readonly outputTypes = { output: "image" };

  async process() {
    return { output: null };
  }
}

function metadata(nodeType: string, outputType: string): NodeMetadata {
  return {
    title: nodeType,
    description: "",
    namespace: "test",
    node_type: nodeType,
    properties: [],
    outputs: [{
      name: "output",
      stream: false,
      type: { type: outputType, optional: false, type_args: [] }
    }]
  };
}

function registry(entries: NodeMetadata[]): WorkflowInterfaceRegistry {
  const byType = new Map(entries.map((entry) => [entry.node_type, entry]));
  return { resolveMetadata: (nodeType) => byType.get(nodeType) };
}

describe("deriveWorkflowInterfaceV1", () => {
  it("uses one hybrid registry for TypeScript-native and Python-bridge metadata", () => {
    const hybridRegistry = new NodeRegistry();
    hybridRegistry.register(TypeScriptImageSource);
    hybridRegistry.loadMetadata("test.python.AudioSource", {
      title: "Python Audio Source",
      description: "",
      namespace: "test.python",
      node_type: "test.python.AudioSource",
      properties: [],
      outputs: [
        {
          name: "output",
          stream: false,
          type: { type: "audio", optional: false, type_args: [] }
        }
      ]
    });

    const result = deriveWorkflowInterfaceV1({
      workflowId: "wf-hybrid",
      registry: hybridRegistry,
      graph: {
        nodes: [
          { id: "native", type: TypeScriptImageSource.nodeType },
          { id: "python", type: "test.python.AudioSource" },
          {
            id: "image-out",
            type: "nodetool.output.Output",
            properties: { name: "image" }
          },
          {
            id: "audio-out",
            type: "nodetool.output.Output",
            properties: { name: "audio" }
          }
        ],
        edges: [
          {
            source: "native",
            sourceHandle: "output",
            target: "image-out",
            targetHandle: "value"
          },
          {
            source: "python",
            sourceHandle: "output",
            target: "audio-out",
            targetHandle: "value"
          }
        ]
      }
    });

    expect(result.outputs).toEqual([
      expect.objectContaining({
        name: "image",
        type: expect.objectContaining({ type: "image" })
      }),
      expect.objectContaining({
        name: "audio",
        type: expect.objectContaining({ type: "audio" })
      })
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it("reports an unavailable node pack instead of guessing its output type", () => {
    const result = deriveWorkflowInterfaceV1({
      workflowId: "wf-unavailable-pack",
      registry: new NodeRegistry(),
      graph: {
        nodes: [
          { id: "missing", type: "disabled.pack.Source" },
          {
            id: "out",
            type: "nodetool.output.Output",
            properties: { name: "result" }
          }
        ],
        edges: [
          {
            source: "missing",
            sourceHandle: "output",
            target: "out",
            targetHandle: "value"
          }
        ]
      }
    });

    expect(result.outputs).toEqual([
      expect.objectContaining({
        name: "result",
        type: expect.objectContaining({ type: "any" })
      })
    ]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "missing_node_metadata",
        node_id: "missing",
        severity: "error"
      })
    );
  });

  it("derives typed inputs and generic Output types from graph edges", () => {
    const inputType = "nodetool.input.ImageInput";
    const result = deriveWorkflowInterfaceV1({
      workflowId: "wf-1",
      etag: "etag-1",
      registry: registry([metadata(inputType, "image")]),
      graph: {
        nodes: [
          { id: "in", type: inputType, data: { name: "source", description: "Image source", value: null } },
          { id: "out", type: "nodetool.output.Output", data: { name: "image", description: "Result" } }
        ],
        edges: [{ source: "in", sourceHandle: "output", target: "out", targetHandle: "value" }]
      }
    });

    expect(result).toMatchObject({ version: 1, workflow_id: "wf-1", etag: "etag-1", source: "server" });
    expect(result.inputs).toEqual([expect.objectContaining({ name: "source", type: expect.objectContaining({ type: "image" }) })]);
    expect(result.outputs).toEqual([expect.objectContaining({ name: "image", type: expect.objectContaining({ type: "image" }) })]);
    expect(result.diagnostics).toEqual([]);
  });

  it("prefers properties over data and preserves Select enum identity", () => {
    const nodeType = "nodetool.input.SelectInput";
    const result = deriveWorkflowInterfaceV1({
      workflowId: "wf-select",
      registry: registry([metadata(nodeType, "str")]),
      graph: {
        nodes: [{
          id: "select",
          type: nodeType,
          data: { name: "old" },
          properties: { name: "quality", value: "high", options: ["low", "high"], enum_type_name: "Quality" }
        }],
        edges: []
      }
    });

    expect(result.inputs[0]).toMatchObject({
      name: "quality",
      default: "high",
      type: { type: "str", values: ["low", "high"], type_name: "Quality" }
    });
  });

  it("derives dedicated media output nodes without graph edges", () => {
    const result = deriveWorkflowInterfaceV1({
      workflowId: "wf-media",
      registry: registry([]),
      graph: {
        nodes: [
          { id: "image", type: "nodetool.output.ImageOutput", properties: { name: "poster" } },
          { id: "audio", type: "nodetool.output.AudioOutput", properties: { name: "soundtrack" } },
          { id: "video", type: "nodetool.output.VideoOutput", properties: { name: "clip" } }
        ],
        edges: []
      }
    });

    expect(result.outputs).toEqual([
      expect.objectContaining({ name: "poster", type: expect.objectContaining({ type: "image" }) }),
      expect.objectContaining({ name: "soundtrack", type: expect.objectContaining({ type: "audio" }) }),
      expect.objectContaining({ name: "clip", type: expect.objectContaining({ type: "video" }) })
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it("uses dynamic input properties and dynamic output type metadata", () => {
    const result = deriveWorkflowInterfaceV1({
      workflowId: "wf-dynamic",
      registry: registry([]),
      graph: {
        nodes: [
          {
            id: "dynamic-input",
            type: "nodetool.input.CustomInput",
            data: { name: "old-name", value: "old-value" },
            dynamic_properties: { name: "query", value: "hello" },
            dynamic_outputs: {
              output: {
                type: "str",
                optional: false,
                type_args: [],
                type_name: null
              }
            }
          }
        ],
        edges: []
      }
    });

    expect(result.inputs).toEqual([
      expect.objectContaining({
        name: "query",
        default: "hello",
        type: expect.objectContaining({ type: "str" })
      })
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it("omits image-heavy defaults from the compact interface", () => {
    const nodeType = "nodetool.input.ImageInput";
    const result = deriveWorkflowInterfaceV1({
      workflowId: "wf-large",
      registry: registry([metadata(nodeType, "image")]),
      graph: {
        nodes: [{ id: "image", type: nodeType, data: { name: "image", value: { type: "image", data: "x".repeat(20_000) } } }],
        edges: []
      }
    });

    expect(result.inputs[0]?.default).toBeNull();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "default_too_large", severity: "warning" }));
    expect(JSON.stringify(result)).not.toContain("x".repeat(100));
  });

  it("rejects oversized defaults before invoking custom JSON serialization", () => {
    const nodeType = "nodetool.input.ImageInput";
    const toJSON = vi.fn(() => {
      throw new Error("large defaults must be rejected before serialization");
    });
    const result = deriveWorkflowInterfaceV1({
      workflowId: "wf-large-preflight",
      registry: registry([metadata(nodeType, "image")]),
      graph: {
        nodes: [{
          id: "image",
          type: nodeType,
          data: {
            name: "image",
            value: { type: "image", data: "x".repeat(2_000_000), toJSON }
          }
        }],
        edges: []
      }
    });

    expect(toJSON).not.toHaveBeenCalled();
    expect(result.inputs[0]?.default).toBeNull();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "default_too_large" })
    );
  });

  it("reports duplicate pin names and unresolved output sources", () => {
    const nodeType = "nodetool.input.StringInput";
    const result = deriveWorkflowInterfaceV1({
      workflowId: "wf-invalid",
      registry: registry([metadata(nodeType, "str")]),
      graph: {
        nodes: [
          { id: "a", type: nodeType, data: { name: "same" } },
          { id: "b", type: nodeType, data: { name: "same" } },
          { id: "out", type: "nodetool.output.Output", data: { name: "result" } }
        ],
        edges: []
      }
    });

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "duplicate_input_name", severity: "error" }),
      expect.objectContaining({ code: "unresolved_output_type", severity: "error" })
    ]));
  });

  it("reports a pin node that carries neither an id nor a name", () => {
    const result = deriveWorkflowInterfaceV1({
      workflowId: "wf-identity",
      registry: registry([]),
      graph: {
        nodes: [
          { type: "nodetool.input.StringInput" },
          { type: "nodetool.output.Output" }
        ],
        edges: []
      }
    });

    expect(result.inputs).toEqual([]);
    expect(result.outputs).toEqual([]);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "invalid_input_identity",
        severity: "error"
      }),
      expect.objectContaining({
        code: "invalid_output_identity",
        severity: "error"
      })
    ]));
  });

  it("reports an output edge whose source node is absent from the graph", () => {
    const result = deriveWorkflowInterfaceV1({
      workflowId: "wf-missing-source",
      registry: registry([]),
      graph: {
        nodes: [
          { id: "out", type: "nodetool.output.Output", data: { name: "result" } }
        ],
        edges: [
          {
            source: "gone",
            sourceHandle: "output",
            target: "out",
            targetHandle: "value"
          }
        ]
      }
    });

    expect(result.outputs).toEqual([
      expect.objectContaining({
        name: "result",
        type: expect.objectContaining({ type: "any" }),
        stream: false
      })
    ]);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "missing_source_node",
        node_id: "out",
        pin_name: "result",
        severity: "error"
      }),
      expect.objectContaining({
        code: "unresolved_output_type",
        severity: "error"
      })
    ]));
  });

  it("reports an output edge that names no source handle", () => {
    const sourceType = "test.Source";
    const result = deriveWorkflowInterfaceV1({
      workflowId: "wf-missing-handle",
      registry: registry([metadata(sourceType, "str")]),
      graph: {
        nodes: [
          { id: "src", type: sourceType },
          { id: "out", type: "nodetool.output.Output", data: { name: "result" } }
        ],
        edges: [{ source: "src", target: "out", targetHandle: "value" }]
      }
    });

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "missing_source_handle",
        node_id: "out",
        pin_name: "result",
        severity: "error"
      }),
      expect.objectContaining({
        code: "unresolved_output_type",
        severity: "error"
      })
    ]));
  });

  it("reports an undeclared source handle on a node whose metadata is loaded", () => {
    const sourceType = "test.Source";
    const result = deriveWorkflowInterfaceV1({
      workflowId: "wf-unknown-handle",
      registry: registry([metadata(sourceType, "str")]),
      graph: {
        nodes: [
          { id: "src", type: sourceType },
          { id: "out", type: "nodetool.output.Output", data: { name: "result" } }
        ],
        edges: [
          {
            source: "src",
            sourceHandle: "nope",
            target: "out",
            targetHandle: "value"
          }
        ]
      }
    });

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "missing_output_handle",
        node_id: "src",
        pin_name: "nope",
        severity: "error"
      })
    ]));
  });

  it("reports two edges into one output as an ambiguous source", () => {
    const sourceType = "test.Source";
    const result = deriveWorkflowInterfaceV1({
      workflowId: "wf-ambiguous",
      registry: registry([metadata(sourceType, "str")]),
      graph: {
        nodes: [
          { id: "a", type: sourceType },
          { id: "b", type: sourceType },
          { id: "out", type: "nodetool.output.Output", data: { name: "result" } }
        ],
        edges: [
          {
            source: "a",
            sourceHandle: "output",
            target: "out",
            targetHandle: "value"
          },
          {
            source: "b",
            sourceHandle: "output",
            target: "out",
            targetHandle: "value"
          }
        ]
      }
    });

    expect(result.outputs).toEqual([
      expect.objectContaining({
        name: "result",
        type: expect.objectContaining({ type: "any" })
      })
    ]);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "ambiguous_output_source",
        node_id: "out",
        pin_name: "result",
        severity: "error"
      })
    ]));
  });

  it("ignores edges into a dedicated media output and never reports its source", () => {
    const result = deriveWorkflowInterfaceV1({
      workflowId: "wf-dedicated-edge",
      registry: registry([]),
      graph: {
        nodes: [
          {
            id: "out",
            type: "nodetool.output.ImageOutput",
            data: { name: "picture" }
          }
        ],
        edges: [
          {
            source: "gone",
            sourceHandle: "output",
            target: "out",
            targetHandle: "value"
          }
        ]
      }
    });

    expect(result.outputs).toEqual([
      expect.objectContaining({
        name: "picture",
        type: expect.objectContaining({ type: "image" })
      })
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it("resolves an output source through snake_case edge handles", () => {
    const sourceType = "test.Source";
    const result = deriveWorkflowInterfaceV1({
      workflowId: "wf-snake",
      registry: registry([metadata(sourceType, "str")]),
      graph: {
        nodes: [
          { id: "src", type: sourceType },
          { id: "out", type: "nodetool.output.Output", data: { name: "result" } }
        ],
        edges: [
          {
            source: "src",
            source_handle: "output",
            target: "out",
            target_handle: "value"
          }
        ]
      }
    });

    expect(result.outputs).toEqual([
      expect.objectContaining({
        name: "result",
        type: expect.objectContaining({ type: "str" })
      })
    ]);
    expect(result.diagnostics).toEqual([]);
  });
});
