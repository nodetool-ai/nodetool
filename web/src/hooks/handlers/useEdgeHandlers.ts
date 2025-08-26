import { useCallback, MouseEvent as ReactMouseEvent } from "react";
import { Edge } from "@xyflow/react";
import { useNodes } from "../../contexts/NodeContext";
import useContextMenuStore from "../../stores/ContextMenuStore";

export default function useEdgeHandlers() {
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

  /* EDGE HOVER */
  const onEdgeMouseEnter = useCallback(
    (event: React.MouseEvent, edge: any) => {
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
    (event: React.MouseEvent, edge: any) => {
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
  }, [setEdgeUpdateSuccessful]);

  // change edge connection
  const onEdgeUpdateEnd = useCallback(
    (event: any, edge: Edge) => {
      // delete edge when dropped
      if (!edgeUpdateSuccessful) {
        deleteEdge(edge.id);
      }
      setEdgeUpdateSuccessful(true);
    },
    [edgeUpdateSuccessful, setEdgeUpdateSuccessful, deleteEdge]
  );

  return {
    onEdgeMouseEnter,
    onEdgeMouseLeave,
    onEdgeContextMenu,
    onEdgeUpdateStart,
    onEdgeUpdateEnd
  };
}
