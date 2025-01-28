import { useCallback, MouseEvent as ReactMouseEvent } from "react";
import { useNodeStore, useTemporalStore } from "../../stores/NodeStore";
import { Edge } from "@xyflow/react";

export default function useEdgeHandlers() {
  const history = useTemporalStore((state) => state);
  // RESUME HISTORY
  const resumeHistoryAndSave = useCallback(() => {
    useNodeStore.getState().setExplicitSave(true);
    history.resume();
    useNodeStore.getState().setExplicitSave(false);
  }, [history]);

  /* EDGE HOVER */
  const onEdgeMouseEnter = useCallback((event: React.MouseEvent, edge: any) => {
    const hovered_edge = useNodeStore.getState().findEdge(edge.id);
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
      useNodeStore.getState().updateEdge(hovered_edge);
    }
  }, []);

  // edge hover out
  const onEdgeMouseLeave = useCallback((event: React.MouseEvent, edge: any) => {
    const hovered_edge = useNodeStore.getState().findEdge(edge.id);
    if (hovered_edge) {
      hovered_edge.animated = false;
      hovered_edge.label = "";
    }
    if (hovered_edge?.className) {
      if (hovered_edge.className.includes(" hovered")) {
        hovered_edge.className = hovered_edge.className.replace(" hovered", "");
      }
    }
    if (hovered_edge) {
      useNodeStore.getState().updateEdge(hovered_edge);
    }
  }, []);

  // delete edge on right click
  const onEdgeContextMenu = (event: ReactMouseEvent, edge: Edge) => {
    event.preventDefault();
    useNodeStore.getState().deleteEdge(edge.id);
  };

  const onEdgeUpdateStart = useCallback(() => {
    useNodeStore.getState().setEdgeUpdateSuccessful(false);
    history.pause();
  }, [history]);

  // change edge connection
  const onEdgeUpdateEnd = useCallback(
    (event: any, edge: Edge) => {
      // delete edge when dropped
      if (!useNodeStore.getState().edgeUpdateSuccessful) {
        useNodeStore.getState().deleteEdge(edge.id);
      }
      resumeHistoryAndSave();
      useNodeStore.getState().setEdgeUpdateSuccessful(true);
    },
    [useNodeStore.getState().edgeUpdateSuccessful, resumeHistoryAndSave]
  );

  return {
    onEdgeMouseEnter,
    onEdgeMouseLeave,
    onEdgeContextMenu,
    onEdgeUpdateStart,
    onEdgeUpdateEnd
  };
}
