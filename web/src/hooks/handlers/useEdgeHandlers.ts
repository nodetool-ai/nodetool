import { useCallback, MouseEvent as ReactMouseEvent } from "react";
import type { Edge } from "@xyflow/react";
import { useNodes, useNodeStoreRef } from "../../contexts/NodeContext";
import useContextMenuStore from "../../stores/ContextMenuStore";
import useConnectionStore from "../../stores/ConnectionStore";
import { shallow } from "zustand/shallow";

/**
 * Result object containing edge event handlers.
 */
type EdgeHandlersResult = {
  /** Handler for mouse entering an edge (hover start) */
  onEdgeMouseEnter: (event: React.MouseEvent, edge: Edge) => void;
  /** Handler for mouse leaving an edge (hover end) */
  onEdgeMouseLeave: (event: React.MouseEvent, edge: Edge) => void;
  /** Handler for right-clicking an edge */
  onEdgeContextMenu: (event: ReactMouseEvent, edge: Edge) => void;
  /** Handler called when edge dragging starts */
  onEdgeUpdateStart: () => void;
  /** Handler called when edge dragging ends */
  onEdgeUpdateEnd: (event: MouseEvent | TouchEvent, edge: Edge) => void;
  /** Handler for middle-click on an edge (deletes the edge) */
  onEdgeClick: (event: ReactMouseEvent, edge: Edge) => void;
};

export default function useEdgeHandlers(): EdgeHandlersResult {
  const {
    findEdge,
    updateEdge,
    deleteEdge,
    setEdgeUpdateSuccessful
  } = useNodes((state) => ({
    findEdge: state.findEdge,
    updateEdge: state.updateEdge,
    deleteEdge: state.deleteEdge,
    setEdgeUpdateSuccessful: state.setEdgeUpdateSuccessful
  }), shallow);

  const nodeStoreRef = useNodeStoreRef();

  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const setIsReconnecting = useConnectionStore(
    (state) => state.setIsReconnecting
  );

  const onEdgeMouseEnter = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      const hovered = findEdge(edge.id);
      if (!hovered) {
        return;
      }
      const className =
        hovered.className && !hovered.className.includes("hovered")
          ? `${hovered.className} hovered`
          : hovered.className;
      updateEdge({
        ...hovered,
        label: edge.className?.replace(" hovered", "").toUpperCase(),
        animated: hovered.selected ? true : hovered.animated,
        className
      });
    },
    [findEdge, updateEdge]
  );

  const onEdgeMouseLeave = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      const hovered = findEdge(edge.id);
      if (!hovered) {
        return;
      }
      updateEdge({
        ...hovered,
        label: "",
        animated: false,
        className: hovered.className?.replace(" hovered", "")
      });
    },
    [findEdge, updateEdge]
  );

  const onEdgeContextMenu = useCallback(
    (event: ReactMouseEvent, edge: Edge) => {
      event.preventDefault();
      openContextMenu(
        "edge-context-menu",
        edge.id, // Using nodeId field for edgeId
        event.clientX,
        event.clientY
      );
    },
    [openContextMenu]
  );

  const onEdgeUpdateStart = useCallback(() => {
    setEdgeUpdateSuccessful(false);
    setIsReconnecting(true);
  }, [setEdgeUpdateSuccessful, setIsReconnecting]);

  const onEdgeUpdateEnd = useCallback(
    (_event: MouseEvent | TouchEvent, edge: Edge) => {
      if (!nodeStoreRef.getState().edgeUpdateSuccessful) {
        deleteEdge(edge.id);
      }
      setEdgeUpdateSuccessful(true);
      setIsReconnecting(false);
    },
    [
      nodeStoreRef,
      setEdgeUpdateSuccessful,
      deleteEdge,
      setIsReconnecting
    ]
  );

  const onEdgeClick = useCallback(
    (event: ReactMouseEvent, edge: Edge) => {
      if (event.button !== 1) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      deleteEdge(edge.id);
    },
    [deleteEdge]
  );

  return {
    onEdgeMouseEnter,
    onEdgeMouseLeave,
    onEdgeContextMenu,
    onEdgeUpdateStart,
    onEdgeUpdateEnd,
    onEdgeClick
  };
}
