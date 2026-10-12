jest.mock("../../components/node_types/PlaceholderNode", () => () => null);

import { Node } from "@xyflow/react";
import { NodeData } from "../NodeData";
import { getCollapseTogglePatches } from "../collapseNodeLayout";
import { reactFlowNodeToGraphNode } from "../reactFlowNodeToGraphNode";
import type { NodeUIProperties } from "../nodeUiDefaults";

describe("collapsed node width persistence", () => {
  test("saves the expanded width, not the strip width, while collapsed", () => {
    // `createNode` sets only `style.width`.
    const created: Node<NodeData> = {
      id: "n1",
      type: "nodetool.text.Prompt",
      position: { x: 0, y: 0 },
      style: { width: 280 },
      measured: { width: 280, height: 180 },
      data: {
        properties: {},
        dynamic_properties: {},
        selectable: true,
        workflow_id: "w"
      }
    };

    const patches = getCollapseTogglePatches(created, true);
    const collapsed: Node<NodeData> = {
      ...created,
      ...patches.node,
      // React Flow remeasures the narrower strip.
      measured: { width: 160, height: 32 },
      data: { ...created.data, ...patches.data }
    };

    const ui = reactFlowNodeToGraphNode(collapsed)
      .ui_properties as NodeUIProperties;
    expect(ui.width).toBe(280);
  });
});
