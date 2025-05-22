/**
 * Drag handlers for ReactFlow node editor
 *
 * Features:
 * - Drag nodes into groups to add them
 * - CTRL+drag nodes out of groups to remove them (supports pressing CTRL during drag)
 * - C+drag to create comment nodes
 * - Support for both single node and selection dragging
 */
import { useCallback, useState, MouseEvent } from "react";
import { useSettingsStore } from "../../stores/SettingsStore";
import { getMousePosition } from "../../utils/MousePosition";
import { useReactFlow, Node } from "@xyflow/react";
import {
  useKeyPressed,
  useKeyPressedStore
} from "../../stores/KeyPressedStore";
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
  const onNodeDragStart = useCallback(
    (_event: any, node: Node<NodeData>) => {
      console.log(
        "[DragDebug] onNodeDragStart called for node:",
        node.id,
        "Initial CTRL:",
        useKeyPressedStore.getState().isKeyPressed("control")
      );
      setLastParentNode(undefined);
      // Pause history tracking at the start of a single node drag
      console.log(
        "[DragDebug] onNodeDragStart - DIAGNOSTIC: pause() call is now COMMENTED OUT for node:",
        node.id
      );
      // pause(); // DIAGNOSTIC: Temporarily disable history
      setDraggedNodes(new Set([node])); // Ensure draggedNodes is set here
    },
    [setDraggedNodes] // Keep pause in deps for now, even if commented out for diagnostic
  );

  /* NODE DRAG STOP */
  const onNodeDragStop = useCallback(
    (_event: any, node: Node<NodeData>) => {
      const initialCtrlPressed = useKeyPressedStore
        .getState()
        .isKeyPressed("control");
      console.log(
        "[DragDebug] onNodeDragStop called for node:",
        node.id,
        "Initial CTRL:",
        initialCtrlPressed
      );
      const currentCtrlPressed = useKeyPressedStore
        .getState()
        .isKeyPressed("control");
      console.log(
        "[DragDebug] onNodeDragStop - currentCtrlPressed:",
        currentCtrlPressed,
        "node.parentId:",
        node.parentId
      );

      if (currentCtrlPressed && node.parentId) {
        console.log(
          "[DragDebug] onNodeDragStop - Attempting to remove node from group:",
          node.id,
          "CTRL:",
          currentCtrlPressed
        );
        removeFromGroup([node]);
        console.log("[DragDebug] onNodeDragStop - removeFromGroup finished");
      } else if (
        lastParentNode &&
        node.parentId !== lastParentNode.id &&
        !currentCtrlPressed
      ) {
        console.log(
          "[DragDebug] onNodeDragStop - Attempting to add node to group:",
          node.id,
          "lastParentNode:",
          lastParentNode.id,
          "CTRL:",
          currentCtrlPressed
        );
        addToGroup([node], lastParentNode);
        console.log("[DragDebug] onNodeDragStop - addToGroup finished");
      }

      console.log(
        "[DragDebug] onNodeDragStop - DIAGNOSTIC: resume() call is now COMMENTED OUT. CTRL:",
        currentCtrlPressed
      );
      // resume(); // DIAGNOSTIC: Temporarily disable history

      setDraggedNodes(new Set());
      setHoveredNodes([]);
      setLastParentNode(undefined);
      const finalCtrlPressed = useKeyPressedStore
        .getState()
        .isKeyPressed("control");
      console.log(
        "[DragDebug] onNodeDragStop - finished for node:",
        node.id,
        "Final CTRL:",
        finalCtrlPressed
      );
    },
    [
      addToGroup,
      removeFromGroup,
      lastParentNode,
      resume, // Keep resume in deps for now, even if commented out for diagnostic
      setDraggedNodes,
      setHoveredNodes
    ]
  );

  /* SELECTION DRAG START */
  const onSelectionDragStart = useCallback(
    (_event: any, nodes: Node<NodeData>[]) => {
      console.log(
        "[DragDebug] onSelectionDragStart called for nodes:",
        nodes.map((n) => n.id),
        "Initial CTRL:",
        useKeyPressedStore.getState().isKeyPressed("control")
      );
      // Clear potential parent from previous drag
      setLastParentNode(undefined);
      // Pause history tracking at the start of selection drag
      console.log(
        "[DragDebug] onSelectionDragStart - Calling pause() for nodes:",
        nodes.map((n) => n.id)
      );
      pause();
      setDraggedNodes(new Set(nodes));
    },
    [pause, setDraggedNodes] // Ensured setDraggedNodes is in dependencies
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
      }
    },
    [reactFlow, setHoveredNodes, isGroup, findNode]
  );

  /* SELECTION DRAG STOP */
  const onSelectionDragStop = useCallback(
    (_event: any, nodes: Node<NodeData>[]) => {
      const initialCtrlPressed = useKeyPressedStore
        .getState()
        .isKeyPressed("control");
      console.log(
        "[DragDebug] onSelectionDragStop called for nodes:",
        nodes.map((n) => n.id),
        "Initial CTRL:",
        initialCtrlPressed
      );
      const currentCtrlPressed = useKeyPressedStore
        .getState()
        .isKeyPressed("control");
      console.log(
        "[DragDebug] onSelectionDragStop - currentCtrlPressed:",
        currentCtrlPressed
      );

      if (currentCtrlPressed) {
        const nodesToRemove = nodes.filter((node) => node.parentId);
        console.log(
          "[DragDebug] onSelectionDragStop - nodesToRemove:",
          nodesToRemove.map((n) => n.id),
          "CTRL:",
          currentCtrlPressed
        );
        if (nodesToRemove.length > 0) {
          console.log(
            "[DragDebug] onSelectionDragStop - Attempting to remove nodes from group:",
            nodesToRemove.map((n) => n.id),
            "CTRL:",
            currentCtrlPressed
          );
          removeFromGroup(nodesToRemove);
          console.log(
            "[DragDebug] onSelectionDragStop - removeFromGroup finished"
          );
        }
      } else if (
        lastParentNode &&
        nodes.length > 0 &&
        nodes[0].parentId !== lastParentNode.id &&
        !currentCtrlPressed
      ) {
        console.log(
          "[DragDebug] onSelectionDragStop - Attempting to add nodes to group:",
          nodes.map((n) => n.id),
          "lastParentNode:",
          lastParentNode.id,
          "CTRL:",
          currentCtrlPressed
        );
        addToGroup(nodes, lastParentNode);
        console.log("[DragDebug] onSelectionDragStop - addToGroup finished");
      }

      console.log(
        "[DragDebug] onSelectionDragStop - ALWAYS Calling resume() from drag handler. CTRL:",
        currentCtrlPressed
      );
      resume(); // Always resume the history started by onNodeDragStart/onSelectionDragStart

      setDraggedNodes(new Set());
      setHoveredNodes([]);
      setLastParentNode(undefined);
      const finalCtrlPressed = useKeyPressedStore
        .getState()
        .isKeyPressed("control");
      console.log(
        "[DragDebug] onSelectionDragStop - finished for nodes:",
        nodes.map((n) => n.id),
        "Final CTRL:",
        finalCtrlPressed
      );
    },
    [
      addToGroup,
      removeFromGroup,
      lastParentNode,
      resume,
      setDraggedNodes,
      setHoveredNodes
    ]
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

  /* NODE DRAG */
  const onNodeDrag = useCallback(
    (event: MouseEvent, node: Node<NodeData>) => {
      // console.log("[DragDebug] onNodeDrag called for node:", node.id); // Optional: can be noisy
      // The main pause is now in onNodeDragStart or onSelectionDragStart
      // Ensure draggedNodes includes the current node if a drag is in progress without selection start (e.g., if onNodeDragStart didn't set it properly)
      if (!draggedNodes.has(node) && !draggedNodes.size) {
        // This case should ideally not be hit if onNodeDragStart is working correctly for single nodes.
        // console.warn("[DragDebug] onNodeDrag - draggedNodes was empty, setting for node:", node.id);
        // setDraggedNodes(new Set([node])); // Re-evaluating if this is needed or causes issues
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
      }
    },
    [
      reactFlow,
      setHoveredNodes,
      isGroup,
      findNode,
      draggedNodes,
      setDraggedNodes
    ]
  );

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
