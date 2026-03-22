import { useCallback, useRef, MouseEvent as ReactMouseEvent } from "react";
import { useReactFlow, type Node } from "@xyflow/react";
import useContextMenu from "../../stores/ContextMenuStore";
import { useNodes } from "../../contexts/NodeContext";
import {
  getSelectionRect,
  getNodesWithinSelection
} from "../../utils/selectionBounds";
import { NodeData } from "../../stores/NodeData";

interface UseSelectionEventsProps {
  reactFlowInstance: ReturnType<typeof useReactFlow>;
  onSelectionStartBase: (event: ReactMouseEvent) => void;
  onSelectionEndBase: (event: ReactMouseEvent) => void;
  onSelectionDragStartBase: (event: ReactMouseEvent, nodes: Node<NodeData>[]) => void;
  onSelectionDragStopBase: (event: ReactMouseEvent, nodes: Node<NodeData>[]) => void;
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
  const { updateNode, setEdgeSelectionState } = useNodes((state) => ({
    updateNode: state.updateNode,
    setEdgeSelectionState: state.setEdgeSelectionState
  }));

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

  const selectEdgesWithinSelection = useCallback(() => {
    const selectionRect = getSelectionRect(
      selectionStartRef.current,
      selectionEndRef.current
    );
    if (!selectionRect) {
      return;
    }

    const topLeft = reactFlowInstance.flowToScreenPosition({
      x: selectionRect.x,
      y: selectionRect.y
    });
    const bottomRight = reactFlowInstance.flowToScreenPosition({
      x: selectionRect.x + selectionRect.width,
      y: selectionRect.y + selectionRect.height
    });

    const minX = Math.min(topLeft.x, bottomRight.x);
    const maxX = Math.max(topLeft.x, bottomRight.x);
    const minY = Math.min(topLeft.y, bottomRight.y);
    const maxY = Math.max(topLeft.y, bottomRight.y);

    const allEdges = reactFlowInstance.getEdges();
    const edgeSelections: Record<string, boolean> = {};

    const intersectsSelectionRect = (rect: DOMRect): boolean =>
      rect.right >= minX &&
      rect.left <= maxX &&
      rect.bottom >= minY &&
      rect.top <= maxY;

    allEdges.forEach((edge) => {
      const edgeElement = document.querySelector(
        `.react-flow__edge[data-id="${edge.id}"]`
      );
      if (!edgeElement) {
        edgeSelections[edge.id] = false;
        return;
      }

      const edgePath = edgeElement.querySelector(".react-flow__edge-path");
      if (!edgePath) {
        edgeSelections[edge.id] = false;
        return;
      }

      const edgeBounds = edgePath.getBoundingClientRect();
      edgeSelections[edge.id] = intersectsSelectionRect(edgeBounds);
    });

    setEdgeSelectionState(edgeSelections);
  }, [reactFlowInstance, setEdgeSelectionState]);

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
        selectEdgesWithinSelection();
      });
    },
    [
      onSelectionEndBase,
      projectMouseEventToFlow,
      selectGroupsWithinSelection,
      selectEdgesWithinSelection
    ]
  );

  const handleSelectionDragStart = useCallback(
    (event: ReactMouseEvent, nodes: Node<NodeData>[]) => {
      onSelectionDragStartBase(event, nodes);
    },
    [onSelectionDragStartBase]
  );

  const handleSelectionDragStop = useCallback(
    (event: ReactMouseEvent, nodes: Node<NodeData>[]) => {
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
    selectEdgesWithinSelection,
    projectMouseEventToFlow,
    selectionStartRef,
    selectionEndRef
  };
}
