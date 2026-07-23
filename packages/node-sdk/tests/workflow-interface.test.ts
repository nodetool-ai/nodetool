import { describe, expect, it } from "vitest";
import {
  deriveWorkflowInterfaceV1,
  type NodeMetadata,
  type WorkflowInterfaceRegistry
} from "../src/index.js";

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
});
