import { useCallback, MouseEvent as ReactMouseEvent } from "react";
import { useNodeStore, useTemporalStore } from "../../stores/NodeStore";
import { HistoryManager } from "../../HistoryManager";
import { Edge } from "reactflow";

export default function useEdgeHandlers(resumeHistoryAndSave: () => void) {
  const findEdge = useNodeStore((state) => state.findEdge);
  const updateEdge = useNodeStore((state) => state.updateEdge);
  const deleteEdge = useNodeStore((state) => state.deleteEdge);
  const setEdgeUpdateSuccessful = useNodeStore(
    (state) => state.setEdgeUpdateSuccessful
  );
  const edgeUpdateSuccessful = useNodeStore(
    (state) => state.edgeUpdateSuccessful
  );
  const history: HistoryManager = useTemporalStore((state) => state);

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

  // delete edge on right click
  const onEdgeContextMenu = (event: ReactMouseEvent, edge: Edge) => {
    event.preventDefault();
    deleteEdge(edge.id);
  };

  const onEdgeUpdateStart = useCallback(() => {
    setEdgeUpdateSuccessful(false);
    history.pause();
  }, [setEdgeUpdateSuccessful, history]);

  // change edge connection
  const onEdgeUpdateEnd = useCallback(
    (event: any, edge: Edge) => {
      // delete edge when dropped
      if (!edgeUpdateSuccessful) {
        deleteEdge(edge.id);
      }
      resumeHistoryAndSave();
      setEdgeUpdateSuccessful(true);
    },
    [
      edgeUpdateSuccessful,
      setEdgeUpdateSuccessful,
      resumeHistoryAndSave,
      deleteEdge
    ]
  );

  return {
    onEdgeMouseEnter,
    onEdgeMouseLeave,
    onEdgeContextMenu,
    onEdgeUpdateStart,
    onEdgeUpdateEnd
  };
}
