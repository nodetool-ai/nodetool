import React from "react";
import { act, renderHook } from "@testing-library/react";
import { useReactFlow } from "@xyflow/react";
import type { Node } from "@xyflow/react";

import { NodeProvider } from "../../../contexts/NodeContext";
import { createNodeStore } from "../../../stores/NodeStore";
import type { NodeStore } from "../../../stores/NodeStore";
import type { NodeData } from "../../../stores/NodeData";
import { asMock } from "../../../test-utils/doubles";
import useDragHandlers from "../useDragHandlers";

const makeNode = (id: string, x: number): Node<NodeData> => ({
  id,
  type: "test.Text",
  position: { x, y: 0 },
  data: {
    properties: {},
    selectable: true,
    dynamic_properties: {},
    workflow_id: "wf"
  }
});

describe("useDragHandlers selection drag history", () => {
  let store: NodeStore;

  beforeEach(() => {
    asMock(useReactFlow).mockReturnValue({
      getIntersectingNodes: () => [],
      screenToFlowPosition: (p: { x: number; y: number }) => p
    });
    store = createNodeStore(undefined, {
      nodes: [makeNode("a", 0), makeNode("b", 100)],
      edges: []
    });
    store.temporal.getState().clear();
  });

  // xyflow order per frame: move the nodes, then call onSelectionDrag.
  const moveBy = (dx: number) => {
    store
      .getState()
      .setNodes((nodes) =>
        nodes.map((n) => ({
          ...n,
          position: { x: n.position.x + dx, y: n.position.y }
        }))
      );
  };

  it("records one undo step that restores the pre-drag positions", () => {
    const { result } = renderHook(() => useDragHandlers(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <NodeProvider createStore={() => store}>{children}</NodeProvider>
      )
    });
    const event = {
      clientX: 0,
      clientY: 0,
      target: null
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.onSelectionDragStart(event, store.getState().nodes);
      for (let frame = 0; frame < 3; frame++) {
        moveBy(10);
        result.current.onSelectionDrag(event, store.getState().nodes);
      }
      result.current.onSelectionDragStop(event, store.getState().nodes);
    });

    expect(store.getState().nodes.map((n) => n.position.x)).toEqual([30, 130]);
    expect(store.temporal.getState().pastStates).toHaveLength(1);
    expect(store.temporal.getState().isTracking).toBe(true);

    act(() => {
      store.temporal.getState().undo();
    });
    expect(store.getState().nodes.map((n) => n.position.x)).toEqual([0, 100]);
  });
});
