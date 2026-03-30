import { useCallback, MouseEvent as ReactMouseEvent } from "react";
import type { Edge } from "@xyflow/react";
import { useNodes } from "../../contexts/NodeContext";
import useContextMenuStore from "../../stores/ContextMenuStore";
import useConnectionStore from "../../stores/ConnectionStore";

/**
 * Result object containing edge event handlers.
 */
export type EdgeHandlersResult = {
  /** Handler for mouse entering an edge (hover start) */
  onEdgeMouseEnter: (event: React.MouseEvent, edge: Edge) => void;
  /** Handler for mouse leaving an edge (hover end) */
  onEdgeMouseLeave: (event: React.MouseEvent, edge: Edge) => void;
  /** Handler for right-clicking an edge */
  onEdgeContextMenu: (event: ReactMouseEvent, edge: Edge) => void;
  /** Handler called when edge dragging starts */
  onEdgeUpdateStart: () => void;
  /** Handler called when edge dragging ends */
  onEdgeUpdateEnd: (event: MouseEvent, edge: Edge) => void;
  /** Handler for middle-click on an edge (deletes the edge) */
  onEdgeClick: (event: ReactMouseEvent, edge: Edge) => void;
};

/**
 * Hook for handling edge-related events in the workflow editor.
 *
 * Provides event handlers for edge interactions including:
 * - Hover effects (animation, label display)
 * - Context menu on right-click
 * - Edge reconnection handling
 * - Deletion on middle-click
 *
 * @returns Object containing all edge event handlers
 *
 * @example
 * ```typescript
 * const {
 *   onEdgeMouseEnter,
 *   onEdgeMouseLeave,
 *   onEdgeContextMenu,
 *   onEdgeClick,
 * } = useEdgeHandlers();
 *
 * return (
 *   <ReactFlow
 *     onEdgeMouseEnter={onEdgeMouseEnter}
 *     onEdgeMouseLeave={onEdgeMouseLeave}
 *     onEdgeContextMenu={onEdgeContextMenu}
 *     onEdgeClick={onEdgeClick}
 *   />
 * );
 * ```
 */
export default function useEdgeHandlers(): EdgeHandlersResult {
  const {
    findEdge,
    updateEdge,
    deleteEdge,
    edgeUpdateSuccessful,
    setEdgeUpdateSuccessful
  } = useNodes((state) => ({
    findEdge: state.findEdge,
    updateEdge: state.updateEdge,
    deleteEdge: state.deleteEdge,
    edgeUpdateSuccessful: state.edgeUpdateSuccessful,
    setEdgeUpdateSuccessful: state.setEdgeUpdateSuccessful
  }));

  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const setIsReconnecting = useConnectionStore(
    (state) => state.setIsReconnecting
  );

  /* EDGE HOVER */
  const onEdgeMouseEnter = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      const hovered_edge = findEdge(edge.id);
      if (hovered_edge) {
        hovered_edge.label = edge.className
          ?.replace(" hovered", "")
          .toUpperCase();
      }
      if (hovered_edge && hovered_edge.selected) {
        hovered_edge.animated = true;
      }
      if (hovered_edge?.className) {
        if (!hovered_edge.className.includes("hovered")) {
          hovered_edge.className = hovered_edge.className + " hovered";
        }
      }
      if (hovered_edge) {
        updateEdge(hovered_edge);
      }
    },
    [findEdge, updateEdge]
  );

  // edge hover out
  const onEdgeMouseLeave = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      const hovered_edge = findEdge(edge.id);
      if (hovered_edge) {
        hovered_edge.animated = false;
        hovered_edge.label = "";
      }
      if (hovered_edge?.className) {
        if (hovered_edge.className.includes(" hovered")) {
          hovered_edge.className = hovered_edge.className.replace(
            " hovered",
            ""
          );
        }
      }
      if (hovered_edge) {
        updateEdge(hovered_edge);
      }
    },
    [findEdge, updateEdge]
  );

  // open context menu on right click
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

  // change edge connection
  const onEdgeUpdateEnd = useCallback(
    (event: MouseEvent, edge: Edge) => {
      // delete edge when dropped
      if (!edgeUpdateSuccessful) {
        deleteEdge(edge.id);
      }
      setEdgeUpdateSuccessful(true);
      setIsReconnecting(false);
    },
    [
      edgeUpdateSuccessful,
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
