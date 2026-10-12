jest.mock("../../components/node_types/PlaceholderNode", () => () => null);
jest.mock("../../core/graph", () => ({
  ...jest.requireActual("../../core/graph"),
  autoLayout: jest.fn()
}));

import { Node } from "@xyflow/react";
import { createNodeStore } from "../NodeStore";
import { NodeData } from "../NodeData";
import { autoLayout } from "../../core/graph";
import { GROUP_NODE_TYPE } from "../../constants/nodeTypes";

const node = (
  id: string,
  x: number,
  y: number,
  parentId?: string,
  type = "test"
): Node<NodeData> => ({
  id,
  type,
  parentId,
  position: { x, y },
  measured: { width: 200, height: 100 },
  data: {
    properties: {},
    dynamic_properties: {},
    selectable: true,
    workflow_id: ""
  }
});

describe("NodeStore autoLayout", () => {
  test("offsets top-level nodes only and resizes groups on copies", async () => {
    const group = node("group", 1000, 1000, undefined, GROUP_NODE_TYPE);
    const store = createNodeStore(undefined, {
      nodes: [group, node("child", 20, 20, "group"), node("free", -500, 0)]
    });
    // ELK output: the child is relative to its group, the rest absolute.
    jest.mocked(autoLayout).mockResolvedValue([
      {
        ...group,
        position: { x: 50, y: 50 },
        width: 400,
        height: 300,
        measured: { width: 400, height: 300 }
      },
      node("child", 50, 50, "group"),
      node("free", 400, 50)
    ]);

    await store.getState().autoLayout();

    const byId = Object.fromEntries(
      store.getState().nodes.map((n) => [n.id, n])
    );
    // Top-level bounds start at (-500, 0) before and (50, 50) after.
    expect(byId.group.position).toEqual({ x: -500, y: 0 });
    expect(byId.free.position).toEqual({ x: -150, y: 0 });
    expect(byId.child.position).toEqual({ x: 50, y: 50 });
    expect(byId.group.width).toBe(400);
    expect(byId.group.height).toBe(300);

    store.temporal.getState().undo();
    const restored = store.getState().nodes.find((n) => n.id === "group");
    expect(restored?.width).toBeUndefined();
    expect(restored?.position).toEqual({ x: 1000, y: 1000 });
  });
});
