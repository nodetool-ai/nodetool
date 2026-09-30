import { describe, it, expect } from "vitest";
import { workflowDocumentRevision } from "../src/workflow-document-revision.js";

describe("workflowDocumentRevision", () => {
  it("normalizes control edge hydration and rejects an edge execution change", () => {
    const edge = { id: "e", source: "a", target: "b", sourceHandle: "", targetHandle: "" };
    const saved = { ...edge, edge_type: "control" };
    const live = { ...edge, sourceHandle: null, targetHandle: null, type: "control", data: { edge_type: "control" }, selected: true };
    expect(workflowDocumentRevision("wf", [], [saved]))
      .toBe(workflowDocumentRevision("wf", [], [live]));
    expect(workflowDocumentRevision("wf", [], [saved]))
      .not.toBe(workflowDocumentRevision("wf", [], [edge]));
  });

  it.each([
    ["bypassed", true],
    ["collapsed", true],
    ["color", "blue"],
    ["model_id", "model-b"],
    ["endpoint_id", "endpoint-b"],
    ["selected_generation", "take-b"],
    ["selected_generations", ["take-b"]],
    ["setupStepId", "step-b"]
  ])("detects changes to persistent %s", (field, value) => {
    const node = { id: "n", type: "Value", data: { properties: {} } };
    expect(
      workflowDocumentRevision(
        "wf",
        [{ ...node, data: { ...node.data, [field]: value } }],
        []
      )
    ).not.toBe(workflowDocumentRevision("wf", [node], []));
  });

  it("normalizes editor defaults and legacy dynamic input declarations", () => {
    const saved = {
      id: "n",
      type: "Value",
      data: {
        dynamic_inputs: {
          picture: {
            type: "image",
            description: "Input",
            default: null,
            required: true
          },
          choice: {
            type: "list",
            type_args: [{ type: "str" }],
            enum: ["one", "two"]
          }
        }
      }
    };
    const live = {
      ...saved,
      position: { x: 0, y: 0 },
      parentId: "",
      data: {
        properties: {},
        collapsed: false,
        bypassed: false,
        dynamic_inputs: {
          picture: {
            type: {
              type: "image",
              optional: false,
              values: null,
              type_args: [],
              type_name: null
            },
            description: "Input",
            default: null,
            required: true
          },
          choice: {
            type: {
              type: "list",
              optional: false,
              values: ["one", "two"],
              type_args: [
                {
                  type: "str",
                  optional: false,
                  values: null,
                  type_args: [],
                  type_name: null
                }
              ],
              type_name: null
            }
          }
        }
      }
    };
    expect(workflowDocumentRevision("wf", [live], [])).toBe(
      workflowDocumentRevision("wf", [saved], [])
    );
    expect(
      workflowDocumentRevision("wf", [{ ...live, parentId: "group" }], [])
    ).not.toBe(workflowDocumentRevision("wf", [live], []));
  });

  it("gives the same revision for reordered object keys and ignores transient editor state", () => {
    const saved = [
      {
        id: "n",
        type: "Value",
        position: { x: 1, y: 2 },
        data: { properties: { a: 1, b: 2 } }
      }
    ];
    const live = [
      {
        selected: true,
        id: "n",
        type: "Value",
        position: { y: 2, x: 1 },
        data: { properties: { b: 2, a: 1 }, running: true }
      }
    ];
    expect(workflowDocumentRevision("wf", live, [])).toBe(
      workflowDocumentRevision("wf", saved, [])
    );
    expect(workflowDocumentRevision("other", live, [])).not.toBe(
      workflowDocumentRevision("wf", live, [])
    );
    expect(
      workflowDocumentRevision(
        "wf",
        [{ ...saved[0], data: { properties: { a: 3, b: 2 } } }],
        []
      )
    ).not.toBe(workflowDocumentRevision("wf", saved, []));
  });

  it("handles a large graph and detects a change at its end", () => {
    const nodes = Array.from({ length: 10000 }, (_, i) => ({
      id: `n${i}`,
      type: "Value",
      position: { x: i, y: 0 },
      data: { properties: { value: i } }
    }));
    const before = workflowDocumentRevision("wf", nodes, []);
    nodes[9999].data.properties.value = -1;
    expect(workflowDocumentRevision("wf", nodes, [])).not.toBe(before);
  }, 20_000);
});
