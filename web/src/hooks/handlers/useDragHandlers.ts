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
import { COMMENT_NODE_METADATA } from "../../utils/nodeUtils";

export default function useDragHandlers() {
  const addToGroup = useAddToGroup();
  const removeFromGroup = useRemoveFromGroup();
  const { isGroup } = useIsGroupable();
  const { cKeyPressed } = useKeyPressed((state) => ({
    cKeyPressed: state.isKeyPressed("c")
  }));
  const controlKeyPressed = useKeyPressed((state) =>
    state.isKeyPressed("control")
  );
  const metaKeyPressed = useKeyPressed((state) => state.isKeyPressed("meta"));
  const reactFlow = useReactFlow();
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [commentDragState, setCommentDragState] = useState<{
    isActive: boolean;
    startPos: { x: number; y: number } | null;
  }>({ isActive: false, startPos: null });
  const [lastParentNode, setLastParentNode] = useState<
    Node<NodeData> | undefined
  >();
  const { settings } = useSettingsStore((state) => state);
  const [draggedNodes, setDraggedNodes] = useState<Set<Node<NodeData>>>(
    new Set()
  );
  const { pause, resume } = useTemporalNodes((state) => ({
    pause: state.pause,
    resume: state.resume
  }));

  const { createNode, addNode, setHoveredNodes, findNode, updateNode } =
    useNodes((state) => ({
      createNode: state.createNode,
      addNode: state.addNode,
      setHoveredNodes: state.setHoveredNodes,
      findNode: state.findNode,
      updateNode: state.updateNode
    }));

  const createCommentNode = useCallback(
    (width: number, height: number, initialPos: { x: number; y: number }) => {
      const metadata = COMMENT_NODE_METADATA;
      const newNode = createNode(metadata, {
        x: initialPos.x,
        y: initialPos.y - 20
      });
      newNode.width = Math.max(width, 150);
      newNode.height = Math.max(height, 100);
      newNode.style = {
        width: newNode.width,
        height: newNode.height
      };
      addNode(newNode);
    },
    [addNode, createNode]
  );

  /* NODE DRAG START */
  const onNodeDragStart = useCallback((event: any) => {
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
  const onSelectionStart = useCallback(
    (event: any) => {
      const currentMousePos = getMousePosition();
      const projectedStartPos = reactFlow.screenToFlowPosition({
        x: currentMousePos.x,
        y: currentMousePos.y
      });
      setStartPos(projectedStartPos); // General purpose

      if (cKeyPressed) {
        setCommentDragState({ isActive: true, startPos: projectedStartPos });
      } else {
        if (!commentDragState.isActive) {
          setCommentDragState({ isActive: false, startPos: null });
        }
      }
    },
    [
      reactFlow,
      cKeyPressed,
      setStartPos,
      setCommentDragState,
      commentDragState.isActive
    ]
  ); // Added commentDragState.isActive

  const onSelectionEnd = useCallback(
    (event: MouseEvent) => {
      if (commentDragState.isActive && commentDragState.startPos) {
        const projectedEndPos = reactFlow.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY
        });

        const actualStartPos = commentDragState.startPos;
        const nodeX = Math.min(actualStartPos.x, projectedEndPos.x);
        const nodeY = Math.min(actualStartPos.y, projectedEndPos.y);

        const width = Math.abs(actualStartPos.x - projectedEndPos.x);
        const height = Math.abs(actualStartPos.y - projectedEndPos.y);

        if (width > 10 || height > 10) {
          // Threshold
          // Pass the calculated top-left (nodeX, nodeY) as the initial position
          createCommentNode(width, height, { x: nodeX, y: nodeY });
        }
      }
      setCommentDragState({ isActive: false, startPos: null });
    },
    [commentDragState, reactFlow, createCommentNode, setCommentDragState]
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
