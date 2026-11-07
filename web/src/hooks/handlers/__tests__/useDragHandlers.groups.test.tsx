import React from "react";
import { act, renderHook } from "@testing-library/react";
import { useReactFlow, type Node } from "@xyflow/react";
import { NodeProvider } from "../../../contexts/NodeContext";
import { GROUP_NODE_TYPE } from "../../../constants/nodeTypes";
import { createNodeStore } from "../../../stores/NodeStore";
import { useKeyPressedStore } from "../../../stores/KeyPressedStore";
import type { NodeData } from "../../../stores/NodeData";
import { asMock } from "../../../test-utils/doubles";
import useDragHandlers from "../useDragHandlers";

const makeNode = (id: string, parentId?: string): Node<NodeData> => ({
  id,
  type: id === "group" ? GROUP_NODE_TYPE : "test.Text",
  position: id === "group" ? { x: 100, y: 200 } : { x: 20, y: 30 },
  parentId,
  data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "wf" }
});

describe("group drag modifiers", () => {
  afterEach(() => {
    act(() => useKeyPressedStore.getState().setKeysPressed({ alt: false }));
  });

  it.each(["node", "selection"] as const)("Alt/Option detaches a %s drag and prevents reattachment while held", (kind) => {
    useKeyPressedStore.getState().setKeysPressed({ alt: true });
    const group = makeNode("group");
    const store = createNodeStore(undefined, {
      nodes: [group, makeNode("child", "group")], edges: []
    });
    asMock(useReactFlow).mockReturnValue({ getIntersectingNodes: () => [group] });
    const { result } = renderHook(() => useDragHandlers(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <NodeProvider createStore={() => store}>{children}</NodeProvider>
      )
    });
    const event = new MouseEvent("mousemove", { altKey: true, clientX: 120, clientY: 230 });
    // Selection callbacks receive the React wrapper around the same mouse event.
    const selectionEvent = event as unknown as React.MouseEvent;
    const child = (): Node<NodeData> => store.getState().nodes[1];
    act(() => {
      if (kind === "node") {
        result.current.onNodeDragStart(event, child());
        result.current.onNodeDrag(event, child());
      } else {
        result.current.onSelectionDragStart(selectionEvent, [child()]);
        result.current.onSelectionDrag(selectionEvent, [child()]);
      }
    });
    expect(child().parentId).toBeUndefined();
    expect(child().position).toEqual({ x: 120, y: 230 });
    act(() => {
      if (kind === "node") {
        result.current.onNodeDrag(event, child());
      } else {
        result.current.onSelectionDrag(selectionEvent, [child()]);
      }
    });
    act(() => {
      if (kind === "node") {
        result.current.onNodeDragStop(event, child());
      } else {
        result.current.onSelectionDragStop(selectionEvent, [child()]);
      }
    });
    expect(child().parentId).toBeUndefined();
    expect(child().position).toEqual({ x: 120, y: 230 });
    expect(store.temporal.getState().isTracking).toBe(true);
  });

  it.each([{ ctrlKey: true }, { metaKey: true }, {}])("keeps grouped nodes attached with selection modifiers %j", (modifiers) => {
    const group = makeNode("group");
    const store = createNodeStore(undefined, {
      nodes: [group, makeNode("child", "group")], edges: []
    });
    asMock(useReactFlow).mockReturnValue({ getIntersectingNodes: () => [] });
    const { result } = renderHook(() => useDragHandlers(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <NodeProvider createStore={() => store}>{children}</NodeProvider>
      )
    });
    const event = new MouseEvent("mousemove", modifiers);
    const child = store.getState().nodes[1];
    act(() => {
      result.current.onNodeDragStart(event, child);
      result.current.onNodeDrag(event, child);
      result.current.onNodeDragStop(event, child);
    });
    expect(store.getState().nodes[1].parentId).toBe("group");
  });
});
