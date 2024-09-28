import { useCallback, useState, MouseEvent } from "react";
import { useSettingsStore } from "../../stores/SettingsStore";
import { HistoryManager } from "../../HistoryManager";
import { useNodeStore, useTemporalStore } from "../../stores/NodeStore";
import { getMousePosition } from "../../utils/MousePosition";
import { useReactFlow, Node } from "@xyflow/react";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import { NodeData } from "../../stores/NodeData";
import useSessionStateStore from "../../stores/SessionStateStore";

export default function useDragHandlers(resumeHistoryAndSave: () => void) {
  const createNode = useNodeStore((state) => state.createNode);
  const addNode = useNodeStore((state) => state.addNode);
  const updateNode = useNodeStore((state) => state.updateNode);
  const { isKeyPressed } = useKeyPressedStore();
  const CKeyPressed = isKeyPressed("c");
  const spaceKeyPressed = isKeyPressed(" ");
  const reactFlow = useReactFlow();
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [lastParentNode, setLastParentNode] = useState<Node | undefined>();
  const setHoveredNodes = useNodeStore((state) => state.setHoveredNodes);
  const { settings } = useSettingsStore((state) => state);
  const history: HistoryManager = useTemporalStore((state) => state);
  const hoveredNodes = useNodeStore((state) => state.hoveredNodes);
  const findNode = useNodeStore((state) => state.findNode);

  const setSelectedNodes = useSessionStateStore(
    (state) => state.setSelectedNodes
  );

  const createCommentNode = useCallback(
    (width: number, height: number) => {
      if (CKeyPressed) {
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
          model_info: {},
          primary_field: "",
          secondary_field: "",
          layout: "comment",
          recommended_models: []
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
    [addNode, createNode, CKeyPressed, startPos]
  );

  /* NODE DRAG START */
  const onNodeDragStart = useCallback(
    (_event: any, _node: any) => {
      history.pause();
    },
    [history]
  );

  /* NODE DRAG STOP */
  const onNodeDragStop = useCallback(
    (_event: any, node: Node<NodeData>) => {
      resumeHistoryAndSave();
      const parentId = hoveredNodes[0];
      const parentNode = findNode(parentId);
      if (hoveredNodes.length > 0) {
        if (!node.parentId && parentNode) {
          // add to loop
          setTimeout(() => {
            updateNode(node.id, {
              position: {
                x: node.position.x - parentNode.position.x,
                y: node.position.y - parentNode.position.y
              },
              parentId: parentId,
              // parentNode: parentId,
              expandParent: true
            });
          }, 0);
        }
        if (node.parentId) {
          // already in loop
          updateNode(node.id, {
            expandParent: true
          });
        }
      } else {
        // not hovered over loop node
        if (node.parentId) {
          // remove from loop and adjust position
          updateNode(node.id, {
            position: {
              x: node.position.x + (lastParentNode?.position.x || 0),
              y: node.position.y + (lastParentNode?.position.y || 0)
            },
            parentId: undefined,
            // parentNode: undefined,
            expandParent: false
          });
          setLastParentNode(undefined);
        }
      }
      setHoveredNodes([]);
    },
    [
      resumeHistoryAndSave,
      hoveredNodes,
      findNode,
      lastParentNode,
      setHoveredNodes,
      updateNode
    ]
  );

  /* SELECTION DRAG START */
  const onSelectionDragStart = useCallback(
    (_event: any, _node: any) => {
      history.pause();
    },
    [history]
  );

  /* SELECTION DRAG STOP */
  const onSelectionDragStop = useCallback(
    (_event: any, _node: any) => {
      resumeHistoryAndSave();
    },
    [resumeHistoryAndSave]
  );

  /* SELECTION START */
  const onSelectionStart = useCallback(() => {
    // get mouse position for creating comment node
    const mousePos = getMousePosition();
    // const projectedStartPos = reactFlow.screenToFlowPosition({
    const projectedStartPos = reactFlow.screenToFlowPosition({
      x: mousePos.x,
      y: mousePos.y
    });
    setStartPos(projectedStartPos);
  }, [reactFlow]);

  /* SELECTION END */
  const onSelectionEnd = useCallback(() => {
    const selectedNodes = reactFlow
      .getNodes()
      .filter((n) => n.selected) as Node<NodeData>[];
    setSelectedNodes(selectedNodes);

    if (CKeyPressed) {
      const mousePos = getMousePosition();
      const projectedEndPos = reactFlow.screenToFlowPosition({
        x: mousePos.x,
        y: mousePos.y
      });
      const width = Math.abs(projectedEndPos.x - startPos.x);
      const height = Math.abs(projectedEndPos.y - startPos.y);
      createCommentNode(width, height);
    }
  }, [createCommentNode, startPos, reactFlow, CKeyPressed, setSelectedNodes]);

  // enables pan on drag. accepts boolean or array of mouse buttons
  let panOnDrag: number[] = [0];
  if (settings.panControls === "RMB") {
    panOnDrag = [1, 2];
  }

  /* DRAG OVER */
  const onDragOver = useCallback((event: any) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onNodeDrag = useCallback(
    (event: MouseEvent, node: Node) => {
      const intersections = reactFlow
        .getIntersectingNodes(node)
        .filter(
          (n) =>
            n.type === "nodetool.group.Loop" ||
            n.type === "nodetool.workflows.base_node.Group"
        )
        .map((n) => n.id);
      setHoveredNodes(intersections);
      if (intersections.length > 0) {
        const lastParent = findNode(intersections[0]);
        setLastParentNode(lastParent);
      }
      if (spaceKeyPressed) {
        if (node.expandParent) {
          updateNode(node.id, {
            expandParent: false,
            parentId: undefined
          });
        }
      }
    },
    [
      reactFlow,
      setHoveredNodes,
      spaceKeyPressed,
      findNode,
      setLastParentNode,
      updateNode
    ]
  );

  return {
    onNodeDragStart,
    onNodeDragStop,
    onSelectionDragStart,
    onSelectionDragStop,
    onSelectionStart,
    onSelectionEnd,
    onDragOver,
    onNodeDrag,
    panOnDrag
  };
}
