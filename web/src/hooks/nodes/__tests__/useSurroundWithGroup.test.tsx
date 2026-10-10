import React from "react";
import { act, renderHook } from "@testing-library/react";
import type { Node } from "@xyflow/react";

import { NodeProvider } from "../../../contexts/NodeContext";
import { createNodeStore } from "../../../stores/NodeStore";
import type { NodeStore } from "../../../stores/NodeStore";
import type { NodeData } from "../../../stores/NodeData";
import { GROUP_NODE_TYPE } from "../../../constants/nodeTypes";
import { useSurroundWithGroup } from "../useSurroundWithGroup";

jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useTheme: () => ({ vars: { palette: { c_bg_group: "#123456" } } })
}));

const makeNode = (
  id: string,
  x: number,
  y: number,
  extra: Partial<Node<NodeData>> = {}
): Node<NodeData> => ({
  id,
  type: "test.Text",
  position: { x, y },
  measured: { width: 200, height: 50 },
  data: {
    properties: {},
    selectable: true,
    dynamic_properties: {},
    workflow_id: "wf"
  },
  ...extra
});

describe("useSurroundWithGroup", () => {
  let store: NodeStore;

  const renderSurround = () =>
    renderHook(() => useSurroundWithGroup(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <NodeProvider createStore={() => store}>{children}</NodeProvider>
      )
    });

  const setup = (nodes: Node<NodeData>[]) => {
    store = createNodeStore(undefined, { nodes, edges: [] });
    store.temporal.getState().clear();
  };

  const newGroup = () =>
    store
      .getState()
      .nodes.find((n) => n.type === GROUP_NODE_TYPE && n.id !== "outer");

  it("does nothing when nothing is selected", () => {
    setup([makeNode("a", 0, 0)]);
    const { result } = renderSurround();
    act(() => {
      result.current({ selectedNodes: [] });
    });
    expect(store.getState().nodes).toHaveLength(1);
  });

  it("groups the nodes and records one undo step", () => {
    setup([makeNode("a", 100, 100), makeNode("b", 400, 100)]);
    const { result } = renderSurround();
    act(() => {
      result.current({ selectedNodes: store.getState().nodes });
    });

    const group = newGroup();
    expect(group).toBeDefined();
    const children = store.getState().nodes.filter((n) => n.parentId);
    expect(children.map((n) => n.id)).toEqual(["a", "b"]);
    expect(children[0].position).toEqual({ x: 20, y: 50 });
    expect(group?.position).toEqual({ x: 80, y: 50 });
    expect(store.temporal.getState().pastStates).toHaveLength(1);

    act(() => {
      store.temporal.getState().undo();
    });
    expect(store.getState().nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(store.getState().nodes.every((n) => !n.parentId)).toBe(true);
  });

  it("uses canvas positions for a node already inside a group", () => {
    setup([
      makeNode("outer", 1000, 500, { type: GROUP_NODE_TYPE }),
      makeNode("child", 30, 40, { parentId: "outer" })
    ]);
    const { result } = renderSurround();
    act(() => {
      result.current({ selectedNodes: [store.getState().nodes[1]] });
    });

    const group = newGroup();
    expect(group?.position).toEqual({ x: 1010, y: 490 });
    const child = store.getState().findNode("child");
    expect(child?.parentId).toBe(group?.id);
    // Canvas position is unchanged: group (1010, 490) + child (20, 50).
    expect(child?.position).toEqual({ x: 20, y: 50 });
  });

  it("leaves group nodes out of the new group", () => {
    setup([
      makeNode("outer", 0, 0, { type: GROUP_NODE_TYPE }),
      makeNode("a", 300, 300)
    ]);
    const { result } = renderSurround();
    act(() => {
      result.current({ selectedNodes: store.getState().nodes });
    });

    const group = newGroup();
    expect(store.getState().findNode("outer")?.parentId).toBeUndefined();
    expect(store.getState().findNode("a")?.parentId).toBe(group?.id);
  });

  it("does nothing when only groups are selected", () => {
    setup([makeNode("outer", 0, 0, { type: GROUP_NODE_TYPE })]);
    const { result } = renderSurround();
    act(() => {
      result.current({ selectedNodes: store.getState().nodes });
    });
    expect(store.getState().nodes).toHaveLength(1);
  });
});
