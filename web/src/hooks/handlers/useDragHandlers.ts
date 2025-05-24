import { useCallback, useState, MouseEvent } from "react";
import { useSettingsStore } from "../../stores/SettingsStore";
import { getMousePosition } from "../../utils/MousePosition";
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
  const reactFlow = useReactFlow();
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
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
    (width: number, height: number) => {
      if (cKeyPressed) {
        const metadata = COMMENT_NODE_METADATA;
        const newNode = createNode(metadata, {
          x: startPos.x,
          y: startPos.y - 20
        });
        newNode.width = Math.max(width, 150);
        newNode.height = Math.max(height, 100);
        newNode.style = {
          width: newNode.width,
          height: newNode.height
        };
        addNode(newNode);
      }
    },
    [addNode, cKeyPressed, createNode, startPos.x, startPos.y]
  );

  /* NODE DRAG START */
  const onNodeDragStart = useCallback((_event: any) => {
    setLastParentNode(undefined);
  }, []);

  /* NODE DRAG */
  const onNodeDrag = useCallback(
    (event: MouseEvent, node: Node<NodeData>) => {
      if (controlKeyPressed) {
        if (node.parentId) {
          removeFromGroup([node]);
        }
      }
      if (draggedNodes.size === 0) {
        pause(); // Pause if starting a single node drag
        setDraggedNodes(new Set([node]));
      }

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
        if (controlKeyPressed) {
          removeFromGroup([node]);
        }
      }
    },
    [
      pause,
      controlKeyPressed,
      removeFromGroup,
      reactFlow,
      setHoveredNodes,
      isGroup,
      findNode,
      draggedNodes,
      setDraggedNodes
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
      setLastParentNode(undefined); // Clear parent after drag
    },
    [addToGroup, lastParentNode, resume, setDraggedNodes, setHoveredNodes]
  );

  /* SELECTION DRAG START */
  const onSelectionDragStart = useCallback(
    (_event: any, nodes: Node<NodeData>[]) => {
      // Clear potential parent from previous drag
      setLastParentNode(undefined);
      // Pause history tracking at the start of selection drag
      pause();
      setDraggedNodes(new Set(nodes));
    },
    [pause, setDraggedNodes]
  );

  /* SELECTION DRAG */
  const onSelectionDrag = useCallback(
    (event: MouseEvent, nodes: Node<NodeData>[]) => {
      // Find potential parent based on the position of the *first* node in selection
      // (This might need refinement if selection spans multiple groups)
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
        if (nodes[0].parentId && controlKeyPressed) {
          nodes.forEach((node) => {
            removeFromGroup([node]);
            setLastParentNode(undefined);
          });
        }
      }
    },
    [
      reactFlow,
      setHoveredNodes,
      isGroup,
      findNode,
      controlKeyPressed,
      removeFromGroup
    ]
  );

  /* SELECTION DRAG STOP */
  const onSelectionDragStop = useCallback(
    (_event: any, nodes: Node<NodeData>[]) => {
      // Only add to group if a valid parent was intersected during drag
      // and nodes aren't already in that group (check first node as proxy)
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
      setLastParentNode(undefined); // Clear parent after drag
    },
    [addToGroup, lastParentNode, resume, setDraggedNodes, setHoveredNodes]
  );

  /* SELECTION START */
  const onSelectionStart = useCallback(() => {
    // get mouse position for creating comment node
    const mousePos = getMousePosition();
    const projectedStartPos = reactFlow.screenToFlowPosition({
      x: mousePos.x,
      y: mousePos.y
    });
    setStartPos(projectedStartPos);
  }, [reactFlow]);

  /* SELECTION END */
  const onSelectionEnd = useCallback(() => {
    if (cKeyPressed) {
      // create comment node
      const mousePos = getMousePosition();
      const projectedEndPos = reactFlow.screenToFlowPosition({
        x: mousePos.x,
        y: mousePos.y
      });
      const width = Math.abs(projectedEndPos.x - startPos.x);
      const height = Math.abs(projectedEndPos.y - startPos.y);
      createCommentNode(width, height);
    }
  }, [createCommentNode, startPos, reactFlow, cKeyPressed]);

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
