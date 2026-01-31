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

    // Get groups that are fully enclosed by the selection rectangle
    const fullyEnclosedGroups = getNodesWithinSelection(
      reactFlowInstance,
      selectionRect,
      (node) => (node.type || node.data?.originalType) === GROUP_NODE_TYPE
    );
    const fullyEnclosedIds = new Set(fullyEnclosedGroups.map((n) => n.id));

    // Get all group nodes from the instance
    const allNodes = reactFlowInstance.getNodes();
    const allGroupNodes = allNodes.filter(
      (node) => (node.type || node.data?.originalType) === GROUP_NODE_TYPE
    );

    // Select fully enclosed groups, deselect groups that are selected but not fully enclosed
    allGroupNodes.forEach((node) => {
      const isFullyEnclosed = fullyEnclosedIds.has(node.id);
      if (isFullyEnclosed && !node.selected) {
        updateNode(node.id, { selected: true });
      } else if (!isFullyEnclosed && node.selected) {
        // Deselect groups that were selected by ReactFlow but aren't fully enclosed
        updateNode(node.id, { selected: false });
      }
    });
  }, [reactFlowInstance, updateNode]);

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
      // Defer to next frame to allow ReactFlow to complete its selection updates
      requestAnimationFrame(() => {
        selectGroupsWithinSelection();
      });
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
