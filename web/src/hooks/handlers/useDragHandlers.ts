import { useCallback, useState, MouseEvent } from "react";
import { useSettingsStore } from "../../stores/SettingsStore";
import {
  getMousePosition,
  addWiggleMovement,
  isWiggling,
  resetWiggleDetection
} from "../../utils/MousePosition";
import { useReactFlow, Node } from "@xyflow/react";
import { useKeyPressed } from "../../stores/KeyPressedStore";
import { NodeData } from "../../stores/NodeData";
import { useAddToGroup } from "../nodes/useAddToGroup";
import { useRemoveFromGroup } from "../nodes/useRemoveFromGroup";
import { useIsGroupable } from "../nodes/useIsGroupable";
import { useNodes, useTemporalNodes } from "../../contexts/NodeContext";
// Removed comment creation via drag

export default function useDragHandlers() {
  const addToGroup = useAddToGroup();
  const removeFromGroup = useRemoveFromGroup();
  const { isGroup } = useIsGroupable();
  // Removed: c-key drag-to-create-comment feature
  const controlKeyPressed = useKeyPressed((state) =>
    state.isKeyPressed("control")
  );
  const metaKeyPressed = useKeyPressed((state) => state.isKeyPressed("meta"));
  const reactFlow = useReactFlow();
  const [_startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [lastParentNode, setLastParentNode] = useState<
    Node<NodeData> | undefined
  >();
  const { settings } = useSettingsStore((state) => state);
  const [_draggedNodes, setDraggedNodes] = useState<Set<Node<NodeData>>>(
    new Set()
  );
  const { pause, resume } = useTemporalNodes((state) => ({
    pause: state.pause,
    resume: state.resume
  }));

  const { setHoveredNodes, findNode } =
    useNodes((state) => ({
      setHoveredNodes: state.setHoveredNodes,
      findNode: state.findNode
    }));
  // Removed: createCommentNode helper and related drag-to-create logic

  /* NODE DRAG START */
  const onNodeDragStart = useCallback((_event: any) => {
    setLastParentNode(undefined);
    resetWiggleDetection(); // Reset wiggle detection for new drag
  }, []);

  /* NODE DRAG */
  const onNodeDrag = useCallback(
    (event: MouseEvent, node: Node<NodeData>) => {
      pause();
      addWiggleMovement(event.clientX, event.clientY);

      // Wiggle ungrouping (works for both single nodes and selections)
      if (node.parentId && isWiggling()) {
        removeFromGroup([node]);
      }

      let wasUngroupedByControlKey = false;
      // Control-key or Meta-key based ungrouping
      if (node.parentId && (controlKeyPressed || metaKeyPressed)) {
        removeFromGroup([node]);
        wasUngroupedByControlKey = true;
      }

      setDraggedNodes(new Set([node]));

      if (wasUngroupedByControlKey) {
        setLastParentNode(undefined);
        setHoveredNodes([]);
      } else {
        // Find potential parent based on intersection
        const intersections = reactFlow
          .getIntersectingNodes(node)
          .filter((n) => isGroup(n as Node<NodeData>))
          .map((n) => n.id);
        setHoveredNodes(intersections);
        if (intersections.length > 0) {
          const potentialParent = findNode(intersections[0]);
          setLastParentNode(potentialParent);
        } else {
          setLastParentNode(undefined);
        }
      }
    },
    [
      pause,
      controlKeyPressed,
      metaKeyPressed,
      removeFromGroup,
      reactFlow,
      setHoveredNodes,
      isGroup,
      findNode
    ]
  );

  /* NODE DRAG STOP */
  const onNodeDragStop = useCallback(
    (_event: any, node: Node<NodeData>) => {
      // Only add to group if a valid parent was intersected during drag
      // and the node isn't already in that group
      if (lastParentNode && node.parentId !== lastParentNode.id) {
        addToGroup([node], lastParentNode);
      }
      resume(); // Resume history
      setDraggedNodes(new Set());
      setHoveredNodes([]);
      setLastParentNode(undefined);
      resetWiggleDetection();
    },
    [addToGroup, lastParentNode, resume, setDraggedNodes, setHoveredNodes]
  );

  /* SELECTION DRAG START */
  const onSelectionDragStart = useCallback(
    (event: any, nodes: Node<NodeData>[]) => {
      // Clear potential parent from previous drag
      setLastParentNode(undefined);
      pause(); // pause history
      setDraggedNodes(new Set(nodes));
      resetWiggleDetection();
    },
    [pause, setDraggedNodes]
  );

  /* SELECTION DRAG */
  const onSelectionDrag = useCallback(
    (event: MouseEvent, nodes: Node<NodeData>[]) => {
      // Add movement to wiggle detection
      addWiggleMovement(event.clientX, event.clientY);

      const parentedNodesForSpeedCheck = nodes.filter((n) => n.parentId);

      // Check if wiggling and ungroup if so
      if (parentedNodesForSpeedCheck.length > 0 && isWiggling()) {
        removeFromGroup(parentedNodesForSpeedCheck);
      }

      let wasUngroupedByControlKey = false;

      // Control-key or Meta-key based ungrouping for selection
      if (
        parentedNodesForSpeedCheck.length > 0 &&
        (controlKeyPressed || metaKeyPressed)
      ) {
        removeFromGroup(parentedNodesForSpeedCheck); // removeFromGroup is idempotent
        wasUngroupedByControlKey = true;
      }

      // Intersection logic conditional on *control key* ungrouping
      if (wasUngroupedByControlKey) {
        setLastParentNode(undefined);
        setHoveredNodes([]);
      } else {
        // Find potential parent based on the position of the *first* node in selection
        if (nodes.length > 0) {
          const intersections = reactFlow
            .getIntersectingNodes(nodes[0]) // Check based on first node
            .filter((n) => isGroup(n as Node<NodeData>))
            .map((n) => n.id);
          setHoveredNodes(intersections); // Highlight intersected groups
          if (intersections.length > 0) {
            const potentialParent = findNode(intersections[0]);
            setLastParentNode(potentialParent);
          } else {
            setLastParentNode(undefined);
          }
        }
      }
    },
    [
      reactFlow,
      setHoveredNodes,
      isGroup,
      findNode,
      controlKeyPressed,
      metaKeyPressed,
      removeFromGroup
    ]
  );

  /* SELECTION DRAG STOP */
  const onSelectionDragStop = useCallback(
    (event: MouseEvent, nodes: Node<NodeData>[]) => {
      if (
        lastParentNode &&
        nodes.length > 0 &&
        nodes[0].parentId !== lastParentNode.id
      ) {
        addToGroup(nodes, lastParentNode);
      }

      resume(); // Resume history
      setDraggedNodes(new Set());
      setHoveredNodes([]);
      setLastParentNode(undefined);
      resetWiggleDetection();
    },
    [addToGroup, lastParentNode, resume, setDraggedNodes, setHoveredNodes]
  );

  /* SELECTION START */
  const onSelectionStart = useCallback((_event: any) => {
    const currentMousePos = getMousePosition();
    const projectedStartPos = reactFlow.screenToFlowPosition({
      x: currentMousePos.x,
      y: currentMousePos.y
    });
    setStartPos(projectedStartPos); // General purpose
  }, [
    reactFlow,
    setStartPos,
    // comment creation via drag removed
  ]); // Added commentDragState.isActive

  const onSelectionEnd = useCallback(
    (_event: MouseEvent) => {
      // No-op: drag-to-create-comment has been removed
    },
    []
  );

  // enables pan on drag. accepts boolean or array of mouse buttons
  let panOnDrag: number[] = [0];
  if (settings.panControls === "RMB") {
    panOnDrag = [1, 2];
  }

  return {
    onNodeDragStart,
    onNodeDragStop,
    onSelectionDragStart,
    onSelectionDrag,
    onSelectionDragStop,
    onSelectionStart,
    onSelectionEnd,
    onNodeDrag,
    panOnDrag
  };
}
