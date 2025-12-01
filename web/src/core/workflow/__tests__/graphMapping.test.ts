import { Edge, Node } from "@xyflow/react";

import { NodeMetadata } from "../../../stores/ApiTypes";
import { NodeData } from "../../../stores/NodeData";
import { isValidEdge, sanitizeGraph } from "../graphMapping";

const baseMetadata: NodeMetadata = {
  name: "Test Node",
  description: "Test node",
  category: "test",
  display_name: "Test",
  icon: "",
  properties: [
    {
      name: "input",
      type: "string",
      description: "input",
      required: false
    }
  ],
  outputs: [
    {
      name: "output",
      type: "string",
      description: "output"
    }
  ],
  is_dynamic: false
} as NodeMetadata;

const makeNode = (id: string, type = "test"): Node<NodeData> => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: {
    workflow_id: "wf",
    properties: {},
    dynamic_properties: {},
    selectable: true
  }
});

const makeEdge = (
  id: string,
  source: string,
  target: string,
  sourceHandle = "output",
  targetHandle = "input"
): Edge => ({
  id,
  source,
  target,
  sourceHandle,
  targetHandle
});

describe("graphMapping helpers", () => {
  it("rejects edges that point to missing nodes", () => {
    const node = makeNode("a");
    const edge = makeEdge("e1", "a", "missing");

    const valid = isValidEdge(edge, new Map([["a", node]]), {
      test: baseMetadata
    });

    expect(valid).toBe(false);
  });

  it("strips edges with invalid handles during sanitation", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const edges = [makeEdge("e1", "a", "b", "invalid", "input")];

    const { edges: sanitized } = sanitizeGraph(nodes, edges, {
      test: baseMetadata
    });

    expect(sanitized).toHaveLength(0);
  });

  it("keeps valid edges intact during sanitation", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const edges = [makeEdge("e1", "a", "b")];

    const { edges: sanitized } = sanitizeGraph(nodes, edges, {
      test: baseMetadata
    });

    expect(sanitized).toHaveLength(1);
    expect(sanitized[0].id).toBe("e1");
  });
});
