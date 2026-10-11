import { act } from "@testing-library/react";
import type { Node } from "@xyflow/react";

import { createNodeStore } from "../../stores/NodeStore";
import type { NodeData } from "../../stores/NodeData";
import { nodeStoreRenderers } from "../../test-utils/nodeStore";
import { useUndoGroup } from "../useUndoGroup";

const node: Node<NodeData> = {
  id: "n1",
  type: "nodetool.constant.Float",
  position: { x: 0, y: 0 },
  data: {
    workflow_id: "wf1",
    properties: { value: 0 },
    selectable: true,
    dynamic_properties: {}
  }
};

const valueOf = (store: ReturnType<typeof createNodeStore>): unknown =>
  store.getState().findNode("n1")?.data.properties.value;

describe("useUndoGroup", () => {
  it("records a slider drag as exactly one undo step", () => {
    const store = createNodeStore(undefined, { nodes: [node], edges: [] });
    store.getState().updateNodeProperties("n1", { value: 1 });
    const { renderHook } = nodeStoreRenderers(store);
    const { result } = renderHook(() => useUndoGroup());

    act(() => result.current.begin());
    for (const value of [2, 3, 4, 5]) {
      store.getState().updateNodeProperties("n1", { value });
    }
    act(() => result.current.end());

    expect(store.temporal.getState().pastStates).toHaveLength(2);
    store.temporal.getState().undo();
    // Only the drag is undone, not the edit before it.
    expect(valueOf(store)).toBe(1);
  });

  it("ends an open edit when the component unmounts", () => {
    const store = createNodeStore(undefined, { nodes: [node], edges: [] });
    const { renderHook } = nodeStoreRenderers(store);
    const { result, unmount } = renderHook(() => useUndoGroup());

    act(() => result.current.begin());
    store.getState().updateNodeProperties("n1", { value: 7 });
    expect(store.temporal.getState().isTracking).toBe(false);
    unmount();

    expect(store.temporal.getState().isTracking).toBe(true);
    store.getState().updateNodeProperties("n1", { value: 8 });
    expect(store.temporal.getState().pastStates).toHaveLength(2);
  });
});
