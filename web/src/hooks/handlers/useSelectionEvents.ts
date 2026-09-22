import { useCallback, useRef, MouseEvent as ReactMouseEvent } from "react";
import { useReactFlow, type Node } from "@xyflow/react";
import useContextMenu from "../../stores/ContextMenuStore";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useNodes } from "../../contexts/NodeContext";
import {
  getSelectionRect,
  getNodesWithinSelection
} from "../../utils/selectionBounds";
import { NodeData } from "../../stores/NodeData";
import { shallow } from "zustand/shallow";
import { GROUP_NODE_TYPE } from "../../constants/nodeTypes";

interface ScreenRect {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

const pointInsideRect = (point: Point, rect: ScreenRect): boolean =>
  point.x >= rect.minX &&
  point.x <= rect.maxX &&
  point.y >= rect.minY &&
  point.y <= rect.maxY;

const orientation = (a: Point, b: Point, c: Point): number =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

const segmentsIntersect = (
  firstStart: Point,
  firstEnd: Point,
  secondStart: Point,
  secondEnd: Point
): boolean => {
  const overlaps = (a: number, b: number, c: number): boolean =>
    c >= Math.min(a, b) && c <= Math.max(a, b);
  const onSegment = (start: Point, end: Point, point: Point): boolean =>
    Math.abs(orientation(start, end, point)) < Number.EPSILON &&
    overlaps(start.x, end.x, point.x) &&
    overlaps(start.y, end.y, point.y);
  const firstSideStart = orientation(firstStart, firstEnd, secondStart);
  const firstSideEnd = orientation(firstStart, firstEnd, secondEnd);
  const secondSideStart = orientation(secondStart, secondEnd, firstStart);
  const secondSideEnd = orientation(secondStart, secondEnd, firstEnd);
  if (
    firstSideStart * firstSideEnd < 0 &&
    secondSideStart * secondSideEnd < 0
  ) {
    return true;
  }
  return (
    onSegment(firstStart, firstEnd, secondStart) ||
    onSegment(firstStart, firstEnd, secondEnd) ||
    onSegment(secondStart, secondEnd, firstStart) ||
    onSegment(secondStart, secondEnd, firstEnd)
  );
};

const segmentIntersectsRect = (
  start: Point,
  end: Point,
  rect: ScreenRect
): boolean => {
  if (pointInsideRect(start, rect) || pointInsideRect(end, rect)) {
    return true;
  }
  const topLeft = { x: rect.minX, y: rect.minY };
  const topRight = { x: rect.maxX, y: rect.minY };
  const bottomRight = { x: rect.maxX, y: rect.maxY };
  const bottomLeft = { x: rect.minX, y: rect.maxY };
  return (
    segmentsIntersect(start, end, topLeft, topRight) ||
    segmentsIntersect(start, end, topRight, bottomRight) ||
    segmentsIntersect(start, end, bottomRight, bottomLeft) ||
    segmentsIntersect(start, end, bottomLeft, topLeft)
  );
};

export const edgePathIntersectsRect = (
  path: SVGPathElement,
  rect: ScreenRect
): boolean => {
  if (
    typeof path.getTotalLength !== "function" ||
    typeof path.getPointAtLength !== "function"
  ) {
    return false;
  }
  const bounds = path.getBoundingClientRect();
  if (
    bounds.right < rect.minX ||
    bounds.left > rect.maxX ||
    bounds.bottom < rect.minY ||
    bounds.top > rect.maxY
  ) {
    return false;
  }
  const totalLength = path.getTotalLength();
  const sampleCount = Math.max(1, Math.min(2048, Math.ceil(totalLength / 4)));
  const screenTransform = path.getScreenCTM();
  const toScreenPoint = (point: Point): Point => {
    if (!screenTransform) {
      return point;
    }
    return {
      x:
        point.x * screenTransform.a +
        point.y * screenTransform.c +
        screenTransform.e,
      y:
        point.x * screenTransform.b +
        point.y * screenTransform.d +
        screenTransform.f
    };
  };

  let previousPoint = toScreenPoint(path.getPointAtLength(0));
  if (pointInsideRect(previousPoint, rect)) {
    return true;
  }
  for (let index = 1; index <= sampleCount; index += 1) {
    const point = toScreenPoint(
      path.getPointAtLength((totalLength * index) / sampleCount)
    );
    if (segmentIntersectsRect(previousPoint, point, rect)) {
      return true;
    }
    previousPoint = point;
  }
  return false;
};

interface UseSelectionEventsProps {
  reactFlowInstance: ReturnType<typeof useReactFlow>;
  onSelectionStartBase: (event: ReactMouseEvent) => void;
  onSelectionEndBase: (event: ReactMouseEvent) => void;
  onSelectionDragStartBase: (event: ReactMouseEvent, nodes: Node<NodeData>[]) => void;
  onSelectionDragStopBase: (event: ReactMouseEvent, nodes: Node<NodeData>[]) => void;
  /** When true, the pane effect does not auto-select edges from selected nodes (node-only marquee). */
  setSuppressNodeDrivenEdgeSelection: (suppress: boolean) => void;
}

export function useSelectionEvents({
  reactFlowInstance,
  onSelectionStartBase,
  onSelectionEndBase,
  onSelectionDragStartBase,
  onSelectionDragStopBase,
  setSuppressNodeDrivenEdgeSelection
}: UseSelectionEventsProps) {
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectionEndRef = useRef<{ x: number; y: number } | null>(null);

  const { openContextMenu } = useContextMenu();
  const closeNodeMenu = useNodeMenuStore((state) => state.closeNodeMenu);
  const { updateNode, setEdgeSelectionState } = useNodes((state) => ({
    updateNode: state.updateNode,
    setEdgeSelectionState: state.setEdgeSelectionState
  }), shallow);

  const projectMouseEventToFlow = useCallback(
    (event?: { clientX?: number; clientY?: number } | null) => {
      const fallback = { x: 0, y: 0 };
      const x = event?.clientX != null ? event.clientX : fallback.x;
      const y = event?.clientY != null ? event.clientY : fallback.y;
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

    const selectionScreenRect = { minX, maxX, minY, maxY };

    allEdges.forEach((edge) => {
      const edgeElement = document.querySelector(
        `.react-flow__edge[data-id="${edge.id}"]`
      );
      if (!edgeElement) {
        edgeSelections[edge.id] = false;
        return;
      }

      const edgePath = edgeElement.querySelector<SVGPathElement>(
        ".react-flow__edge-path"
      );
      if (!edgePath) {
        edgeSelections[edge.id] = false;
        return;
      }

      edgeSelections[edge.id] = edgePathIntersectsRect(
        edgePath,
        selectionScreenRect
      );
    });

    setEdgeSelectionState(edgeSelections);
  }, [reactFlowInstance, setEdgeSelectionState]);

  const handleSelectionStart = useCallback(
    (event: ReactMouseEvent) => {
      // Suppress native browser text selection while box-selecting nodes.
      // The marquee drag starts on the pane and extends over nodes, which
      // otherwise highlights their text. Cleared in handleSelectionEnd.
      document.body.classList.add("is-marquee-selecting");
      const flowPoint = projectMouseEventToFlow(event);
      selectionStartRef.current = flowPoint;
      selectionEndRef.current = flowPoint;
      onSelectionStartBase(event);
    },
    [onSelectionStartBase, projectMouseEventToFlow]
  );

  const handleSelectionEnd = useCallback(
    (event: ReactMouseEvent) => {
      document.body.classList.remove("is-marquee-selecting");
      onSelectionEndBase(event);
      selectionEndRef.current = projectMouseEventToFlow(event);
      const includeMarqueeEdges = event.shiftKey;
      // Defer to next frame to allow ReactFlow to complete its selection updates
      requestAnimationFrame(() => {
        selectGroupsWithinSelection();
        const hasSelectedNode = reactFlowInstance
          .getNodes()
          .some((n) => n.selected);
        if (!hasSelectedNode) {
          closeNodeMenu();
        }
        if (hasSelectedNode && !includeMarqueeEdges) {
          setSuppressNodeDrivenEdgeSelection(true);
          const allEdges = reactFlowInstance.getEdges();
          if (allEdges.length > 0) {
            setEdgeSelectionState(
              Object.fromEntries(allEdges.map((e) => [e.id, false]))
            );
          }
        } else {
          setSuppressNodeDrivenEdgeSelection(false);
          selectEdgesWithinSelection();
        }
      });
    },
    [
      closeNodeMenu,
      onSelectionEndBase,
      projectMouseEventToFlow,
      reactFlowInstance,
      selectGroupsWithinSelection,
      selectEdgesWithinSelection,
      setEdgeSelectionState,
      setSuppressNodeDrivenEdgeSelection
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
