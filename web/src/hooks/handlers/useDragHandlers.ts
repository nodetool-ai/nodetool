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
        // Fake metadata for comments
        const metadata = {
          namespace: "default",
          node_type: "nodetool.workflows.base_node.Comment",
          properties: [],
          title: "Comment",
          description: "Comment",
          icon: "",
          color: "",
          outputs: [],
          the_model_info: {},
          basic_fields: [],
          layout: "comment",
          recommended_models: [],
          is_dynamic: false
        };
        const newNode = createNode(metadata, {
          x: startPos.x,
          y: startPos.y - 20
        });
        newNode.width = Math.max(width, 150);
        newNode.height = Math.max(height, 100);
        newNode.style = {
          width: Math.max(width, 150),
          height: Math.max(height, 100)
        };
        addNode(newNode);
      }
    },
    [cKeyPressed, startPos]
  );

  /* NODE DRAG START */
  const onNodeDragStart = useCallback(
    (_event: any) => {
      console.log("onNodeDragStart");
      // pause();
    },
    [pause]
  );

  /* NODE DRAG STOP */
  const onNodeDragStop = useCallback(
    (_event: any, node: Node<NodeData>) => {
      addToGroup([node], lastParentNode);
      resume();
      draggedNodes.forEach((node) => {
        updateNode(node.id, {
          position: {
            x: node.position.x,
            y: node.position.y
          }
        });
      });
      setDraggedNodes(new Set());
      setHoveredNodes([]);
      console.log("onNodeDragStop");
    },
    [addToGroup, lastParentNode, resume, draggedNodes, updateNode]
  );

  /* SELECTION DRAG START */
  const onSelectionDragStart = useCallback((_event: any) => {}, [pause]);

  /* SELECTION DRAG */
  const onSelectionDrag = useCallback(
    (event: MouseEvent, nodes: Node<NodeData>[]) => {
      pause();
      setDraggedNodes(new Set(nodes));
    },
    [pause, setDraggedNodes]
  );

  /* SELECTION DRAG STOP */
  const onSelectionDragStop = useCallback(
    (_event: any, nodes: Node<NodeData>[]) => {
      addToGroup(nodes, lastParentNode);
      resume();
      setDraggedNodes(new Set());
    },
    [addToGroup, lastParentNode, resume, setDraggedNodes]
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
      console.log("onSelectionEnd");
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
      pause();
      setDraggedNodes(new Set([node]));
      const intersections = reactFlow
        .getIntersectingNodes(node)
        .filter((n) => isGroup(n as Node<NodeData>))
        .map((n) => n.id);
      setHoveredNodes(intersections);
      if (intersections.length > 0) {
        const lastParent = findNode(intersections[0]);
        setLastParentNode(lastParent);
      }
    },
    [reactFlow, removeFromGroup, pause, draggedNodes, setDraggedNodes]
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
