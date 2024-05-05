import { useCallback } from "react";
import { Edge, OnConnectStartParams, useReactFlow } from "reactflow";
import useConnectionStore from "../../stores/ConnectionStore";
import { useNodeStore } from "../../stores/NodeStore";
import useKeyPressedListener from "../../utils/KeyPressedListener";
import { TypeName, TypeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { getMousePosition } from "../../utils/MousePosition";
import { Slugify } from "../../utils/TypeHandler";
import { useMetadata } from "../../serverState/useMetadata";
import { ConnectDirection } from "../../stores/ConnectionStore";

export const inputForType = (type: TypeName) => {
  switch (type) {
    case "str":
      return "nodetool.input.StringInput";
    case "int":
      return "nodetool.input.IntInput";
    case "float":
      return "nodetool.input.FloatInput";
    case "bool":
      return "nodetool.input.BooleanInput";
    case "image":
      return "nodetool.input.ImageInput";
    case "video":
      return "nodetool.input.VideoInput";
    case "audio":
      return "nodetool.input.AudioInput";
    default:
      return null;
  }
};

export const outputForType = (type: TypeName) => {
  switch (type) {
    case "str":
      return "nodetool.output.StringOutput";
    case "text":
      return "nodetool.output.TextOutput";
    case "int":
      return "nodetool.output.IntOutput";
    case "float":
      return "nodetool.output.FloatOutput";
    case "bool":
      return "nodetool.output.BooleanOutput";
    case "image":
      return "nodetool.output.ImageOutput";
    case "video":
      return "nodetool.output.VideoOutput";
    case "audio":
      return "nodetool.output.AudioOutput";
    case "dataframe":
      return "nodetool.output.DataFrameOutput";
    case "tensor":
      return "nodetool.output.TensorOutput";
    case "folder":
      return "nodetool.output.FolderOutput";
    default:
      return null;
  }
};

export const constantForType = (type: TypeName) => {
  switch (type) {
    case "str":
      return "nodetool.constant.String";
    case "int":
      return "nodetool.constant.Int";
    case "float":
      return "nodetool.constant.Float";
    case "bool":
      return "nodetool.constant.Boolean";
    case "image":
      return "nodetool.constant.Image";
    case "video":
      return "nodetool.constant.Video";
    case "audio":
      return "nodetool.constant.Audio";
    case "list":
      return "nodetool.constant.List";
    default:
      return null;
  }
};

export default function useConnectionHandlers() {
  const reactFlow = useReactFlow();
  const {
    connecting,
    startConnecting,
    endConnecting,
    connectType,
    connectDirection,
    connectNodeId,
    connectHandleId
  } = useConnectionStore();

  const {
    addNode,
    addEdge,
    edges,
    setEdges,
    createNode,
    findNode,
    generateEdgeId,
    setConnectionAttempted
  } = useNodeStore();
  const controlKeyPressed = useKeyPressedListener("Control");
  const shiftKeyPressed = useKeyPressedListener("Shift");
  const altKeyPressed = useKeyPressedListener("Alt");
  const metaKeyPressed = useKeyPressedListener("Meta");
  const optionKeyPressed = useKeyPressedListener("Option");
  const { openNodeMenu } = useNodeMenuStore();
  const { data: metadata } = useMetadata();

  /* CONNECT START */
  const onConnectStart = useCallback(
    (
      _: React.MouseEvent | React.TouchEvent,
      { nodeId, handleId, handleType }: OnConnectStartParams
    ) => {
      if (!nodeId || !handleId || !handleType || !metadata) return;
      const node = findNode(nodeId);
      if (!node) return;
      const nodeMetadata = metadata.metadataByType[node.type || ""];

      startConnecting(nodeId, handleId, handleType, nodeMetadata);
    },
    [metadata, findNode, startConnecting]
  );
  const addNewNode = useCallback(
    (connectType: TypeMetadata | null, event: any, isInput: boolean) => {
      if (!connectType) return;
      const nodeType =
        controlKeyPressed || metaKeyPressed
          ? isInput
            ? inputForType(connectType.type)
            : outputForType(connectType.type)
          : constantForType(connectType.type);

      if (!nodeType || !metadata) return;

      const nodeMetadata = metadata?.metadataByType[nodeType];

      const newNode = createNode(
        nodeMetadata,
        // reactFlow.screenToFlowPosition({
        reactFlow.project({
          x: event.clientX,
          y: event.clientY
        })
      );
      newNode.selected = false;
      if (connectDirection === "target") {
        newNode.data.properties.name = connectHandleId || "Input";
      } else {
        let nodeName: string | undefined = "Output";
        if (connectNodeId) {
          nodeName = findNode(connectNodeId)?.type?.toString();
        }
        newNode.data.properties.name = nodeName;
      }

      addNode(newNode);
      return newNode;
    },
    [
      controlKeyPressed,
      metaKeyPressed,
      metadata,
      createNode,
      reactFlow,
      connectDirection,
      addNode,
      connectHandleId,
      connectNodeId,
      findNode
    ]
  );

  /* CONNECT END */
  // called after onConnect
  const onConnectEnd = useCallback(
    // create input, output, constant nodes
    (event: any) => {
      const targetIsPane = event.target.classList.contains("react-flow__pane");
      const shiftOrControlKeyPressed =
        shiftKeyPressed || controlKeyPressed || metaKeyPressed;

      if (shiftOrControlKeyPressed && targetIsPane && connectNodeId) {
        if (connectDirection === "source") {
          // connection starts from output
          const node = addNewNode(connectType, event, false);
          if (node) {
            addEdge({
              id: generateEdgeId(),
              source: connectNodeId,
              target: node.id,
              sourceHandle: connectHandleId,
              targetHandle: "value",
              type: "default",
              className: Slugify(connectType?.type || "")
            });
          }
        }
        if (connectDirection === "target") {
          // connection starts from input
          const node = addNewNode(connectType, event, true);
          // remove existing connection
          // (source handles should only have 1 input)
          const validEdges = edges.filter(
            (edge: Edge) =>
              !(
                edge.target === connectNodeId &&
                edge.targetHandle === connectHandleId
              )
          );
          if (!node) return;
          // create connection for new node + delete possible existing edge
          const newEdge = {
            id: generateEdgeId(),
            source: node.id,
            target: connectNodeId,
            sourceHandle: "output",
            targetHandle: connectHandleId,
            type: "default",
            className: Slugify(connectType?.type || "")
          };
          setEdges([...validEdges, newEdge]);
        }
      } else {
        // TODO: open NodeMenu if connection was dropped and no attempt was made to connect
        // currently opens type-filtered NodeMenu only when alt/option is pressed
        if (altKeyPressed || optionKeyPressed) {
          openNodeMenu(
            getMousePosition().x,
            getMousePosition().y,
            true,
            connectType?.type,
            connectDirection?.toString() as ConnectDirection
          );
        }
        setConnectionAttempted(false);
      }
      endConnecting();
    },
    [
      shiftKeyPressed,
      controlKeyPressed,
      metaKeyPressed,
      connectNodeId,
      endConnecting,
      connectDirection,
      addNewNode,
      connectType,
      addEdge,
      generateEdgeId,
      connectHandleId,
      edges,
      setEdges,
      altKeyPressed,
      optionKeyPressed,
      setConnectionAttempted,
      openNodeMenu
    ]
  );

  return { onConnectStart, onConnectEnd, connecting };
}
