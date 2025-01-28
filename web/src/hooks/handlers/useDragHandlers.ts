import { useCallback, useState, MouseEvent } from "react";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useNodeStore, useTemporalStore } from "../../stores/NodeStore";
import { getMousePosition } from "../../utils/MousePosition";
import { useReactFlow, Node } from "@xyflow/react";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import { NodeData } from "../../stores/NodeData";
import { useAddToGroup } from "../nodes/useAddToGroup";
import { useRemoveFromGroup } from "../nodes/useRemoveFromGroup";
import { useIsGroupable } from "../nodes/useIsGroupable";

export default function useDragHandlers() {
  const addToGroup = useAddToGroup();
  const removeFromGroup = useRemoveFromGroup();
  const { isGroup } = useIsGroupable();
  const { isKeyPressed } = useKeyPressedStore();
  const CKeyPressed = isKeyPressed("c");
  const spaceKeyPressed = isKeyPressed(" ");
  const reactFlow = useReactFlow();
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [lastParentNode, setLastParentNode] = useState<Node | undefined>();
  const { settings } = useSettingsStore((state) => state);
  const history = useTemporalStore((state) => state);

  const resumeHistoryAndSave = useCallback(() => {
    useNodeStore.getState().setExplicitSave(true);
    history.resume();
    useNodeStore.getState().setExplicitSave(false);
  }, [history]);

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
          the_model_info: {},
          basic_fields: [],
          layout: "comment",
          recommended_models: [],
          is_dynamic: false
        };
        const newNode = useNodeStore.getState().createNode(metadata, {
          x: startPos.x,
          y: startPos.y - 20
        });
        newNode.width = Math.max(width, 150);
        newNode.height = Math.max(height, 100);
        newNode.style = {
          width: Math.max(width, 150),
          height: Math.max(height, 100)
        };
        useNodeStore.getState().addNode(newNode);
      }
    },
    [CKeyPressed, startPos]
  );

  /* NODE DRAG START */
  const onNodeDragStart = useCallback(
    (_event: any) => {
      history.pause();
    },
    [history]
  );

  /* NODE DRAG STOP */
  const onNodeDragStop = useCallback(
    (_event: any, node: Node<NodeData>) => {
      addToGroup([node], lastParentNode);
      resumeHistoryAndSave();
    },
    [resumeHistoryAndSave, addToGroup, lastParentNode]
  );

  /* SELECTION DRAG START */
  const onSelectionDragStart = useCallback(
    (_event: any) => {
      history.pause();
    },
    [history]
  );

  /* SELECTION DRAG */
  const onSelectionDrag = useCallback(
    (event: MouseEvent, nodes: Node<NodeData>[]) => {
      if (spaceKeyPressed) {
        removeFromGroup(nodes);
      }
    },
    [spaceKeyPressed, removeFromGroup]
  );

  /* SELECTION DRAG STOP */
  const onSelectionDragStop = useCallback(
    (_event: any, nodes: Node<NodeData>[]) => {
      addToGroup(nodes, lastParentNode);
      resumeHistoryAndSave();
    },
    [addToGroup, lastParentNode, resumeHistoryAndSave]
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
    if (CKeyPressed) {
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
  }, [createCommentNode, startPos, reactFlow, CKeyPressed]);

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

  /* NODE DRAG */
  const onNodeDrag = useCallback(
    (event: MouseEvent, node: Node<NodeData>) => {
      const intersections = reactFlow
        .getIntersectingNodes(node)
        // .filter((n) => isGroupable(n as Node<NodeData>))
        .filter((n) => isGroup(n as Node<NodeData>))
        .map((n) => n.id);
      useNodeStore.getState().setHoveredNodes(intersections);
      if (intersections.length > 0) {
        const lastParent = useNodeStore.getState().findNode(intersections[0]);
        setLastParentNode(lastParent);
      }
      if (spaceKeyPressed) {
        removeFromGroup([node]);
      }
    },
    [reactFlow, spaceKeyPressed, removeFromGroup]
  );

  return {
    onNodeDragStart,
    onNodeDragStop,
    onSelectionDragStart,
    onSelectionDrag,
    onSelectionDragStop,
    onSelectionStart,
    onSelectionEnd,
    onDragOver,
    onNodeDrag,
    panOnDrag
  };
}
