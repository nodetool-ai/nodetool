jest.mock("../../components/node_types/PlaceholderNode", () => () => null);

import { Node } from "@xyflow/react";
import { createNodeStore } from "../NodeStore";
import { NodeData } from "../NodeData";
import {
  COMMENT_NODE_TYPE,
  GROUP_NODE_TYPE
} from "../../constants/nodeTypes";

const selectedNode = (id: string, type: string): Node<NodeData> => ({
  id,
  type,
  selected: true,
  position: { x: 0, y: 0 },
  data: {
    properties: {},
    dynamic_properties: {},
    selectable: true,
    workflow_id: ""
  }
});

describe("toggleBypassSelected", () => {
  test("bypasses runnable nodes and leaves groups and comments alone", () => {
    const store = createNodeStore(undefined, {
      nodes: [
        selectedNode("group", GROUP_NODE_TYPE),
        selectedNode("comment", COMMENT_NODE_TYPE),
        selectedNode("text", "nodetool.text.Concat")
      ]
    });

    store.getState().toggleBypassSelected();

    const bypassed = Object.fromEntries(
      store.getState().nodes.map((n) => [n.id, Boolean(n.data.bypassed)])
    );
    expect(bypassed).toEqual({ group: false, comment: false, text: true });
  });

  test("does nothing when only a group is selected", () => {
    const store = createNodeStore(undefined, {
      nodes: [selectedNode("group", GROUP_NODE_TYPE)]
    });

    store.getState().toggleBypassSelected();

    expect(store.getState().nodes[0].data.bypassed).toBeUndefined();
    expect(store.getState().workflowIsDirty).toBe(false);
  });
});
