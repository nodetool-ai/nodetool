jest.mock("../../components/node_types/PlaceholderNode", () => () => null);
jest.mock("../NodeStore", () => ({
  DEFAULT_NODE_WIDTH: 200
}));

import type { Node } from "@xyflow/react";

import { graphNodeToReactFlowNode } from "../graphNodeToReactFlowNode";
import { reactFlowNodeToGraphNode } from "../reactFlowNodeToGraphNode";
import type { Workflow } from "../ApiTypes";
import type { NodeData } from "../NodeData";
import { stub } from "../../test-utils/doubles";

const workflow = stub<Workflow>({
  id: "wf-1",
  name: "Round trip",
  graph: { nodes: [], edges: [] }
});

const imageType = {
  type: "image",
  optional: false,
  values: null,
  type_args: [],
  type_name: null
};

const makeNode = (data: Partial<NodeData>): Node<NodeData> => ({
  id: "n1",
  type: "nodetool.text.Prompt",
  position: { x: 0, y: 0 },
  data: {
    properties: {},
    selectable: true,
    workflow_id: "wf-1",
    dynamic_properties: {},
    ...data
  }
});

describe("typed dynamic slot persistence round trip", () => {
  it("survives save → load unchanged", () => {
    const node = makeNode({
      dynamic_properties: { picture: null, note: "hi" },
      dynamic_inputs: {
        picture: { type: imageType, description: "a picture", required: true }
      }
    });

    const saved = reactFlowNodeToGraphNode(node);
    const loaded = graphNodeToReactFlowNode(workflow, saved);

    expect(loaded.data.dynamic_inputs).toEqual(node.data.dynamic_inputs);
    expect(loaded.data.dynamic_properties).toEqual(node.data.dynamic_properties);
  });

  it("leaves a legacy untyped node untouched in both directions", () => {
    const node = makeNode({ dynamic_properties: { anything: "" } });

    const saved = reactFlowNodeToGraphNode(node);
    expect(saved.dynamic_inputs).toBeUndefined();

    const loaded = graphNodeToReactFlowNode(workflow, saved);
    expect(loaded.data.dynamic_inputs).toBeUndefined();
    expect(loaded.data.dynamic_properties).toEqual({ anything: "" });
  });
});
