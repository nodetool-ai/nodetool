import { useCallback, useRef, MouseEvent as ReactMouseEvent } from "react";
import { useReactFlow } from "@xyflow/react";
import useContextMenu from "../../stores/ContextMenuStore";
import { useNodes } from "../../contexts/NodeContext";
import {
  getSelectionRect,
  getNodesWithinSelection
} from "../../utils/selectionBounds";

interface UseSelectionEventsProps {
  reactFlowInstance: ReturnType<typeof useReactFlow>;
  onSelectionStartBase: (event: any) => void;
  onSelectionEndBase: (event: any) => void;
  onSelectionDragStartBase: (event: any, nodes: any[]) => void;
  onSelectionDragStopBase: (event: any, nodes: any[]) => void;
}

const GROUP_NODE_TYPE = "nodetool.workflows.base_node.Group";

export function useSelectionEvents({
  reactFlowInstance,
  onSelectionStartBase,
  onSelectionEndBase,
  onSelectionDragStartBase,
  onSelectionDragStopBase
}: UseSelectionEventsProps) {
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectionEndRef = useRef<{ x: number; y: number } | null>(null);

  const { openContextMenu } = useContextMenu();
  const updateNode = useNodes((state) => state.updateNode);

  const projectMouseEventToFlow = useCallback(
    (event?: { clientX?: number; clientY?: number } | null) => {
      const fallback = { x: 0, y: 0 };
      const x = typeof event?.clientX === "number" ? event.clientX : fallback.x;
      const y = typeof event?.clientY === "number" ? event.clientY : fallback.y;
      return reactFlowInstance.screenToFlowPosition({ x, y });
    },
    [reactFlowInstance]
  );

  const handleSelectionContextMenu = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      openContextMenu(
        "selection-context-menu",
        "",
        event.clientX,
        event.clientY,
        "react-flow__nodesselection"
      );
    },
    [openContextMenu]
  );

  const handleSelectionStart = useCallback(
    (event: ReactMouseEvent) => {
      const flowPoint = projectMouseEventToFlow(event);
      selectionStartRef.current = flowPoint;
      selectionEndRef.current = flowPoint;
      onSelectionStartBase(event);
    },
    [onSelectionStartBase, projectMouseEventToFlow]
  );

  const handleSelectionEnd = useCallback(
    (event: ReactMouseEvent) => {
      onSelectionEndBase(event);
      selectionEndRef.current = projectMouseEventToFlow(event);
      selectGroupsWithinSelection();
    },
    [onSelectionEndBase, projectMouseEventToFlow, selectGroupsWithinSelection]
  );

  const handleSelectionDragStart = useCallback(
    (event: any, nodes: any[]) => {
      onSelectionDragStartBase(event, nodes);
    },
    [onSelectionDragStartBase]
  );

  const handleSelectionDragStop = useCallback(
    (event: any, nodes: any[]) => {
      onSelectionDragStopBase(event, nodes);
    },
    [onSelectionDragStopBase]
  );

  const resetSelectionTracking = useCallback(() => {
    selectionStartRef.current = null;
    selectionEndRef.current = null;
  }, []);

  const selectGroupsWithinSelection = useCallback(() => {
    const selectionRect = getSelectionRect(
      selectionStartRef.current,
      selectionEndRef.current
    );
    if (!selectionRect) {
      return;
    }

    const intersectingGroups = getNodesWithinSelection(
      reactFlowInstance,
      selectionRect,
      (node) => (node.type || node.data?.originalType) === GROUP_NODE_TYPE
    );

    intersectingGroups.forEach((node) => {
      if (!node.selected) {
        updateNode(node.id, { selected: true });
      }
    });
  }, [reactFlowInstance, updateNode]);

  return {
    handleSelectionContextMenu,
    handleSelectionStart,
    handleSelectionEnd,
    handleSelectionDragStart,
    handleSelectionDragStop,
    resetSelectionTracking,
    selectGroupsWithinSelection,
    projectMouseEventToFlow,
    selectionStartRef,
    selectionEndRef
  };
}
