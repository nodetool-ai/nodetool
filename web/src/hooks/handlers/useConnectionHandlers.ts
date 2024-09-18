import { useCallback, useRef } from "react";
import { OnConnectStartParams, Connection } from "reactflow";
import useConnectionStore from "../../stores/ConnectionStore";
import { useNodeStore } from "../../stores/NodeStore";
import { TypeName } from "../../stores/ApiTypes";
import { useMetadata } from "../../serverState/useMetadata";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { devLog } from "../../utils/DevLog";
// import { ConnectDirection } from "../../stores/ConnectionStore";

export const inputForType = (type: TypeName) => {
  switch (type) {
    case "str":
      return "nodetool.input.StringInput";
    case "dataframe":
      return "nodetool.input.DataFrameInput";
    case "int":
      return "nodetool.input.IntegerInput";
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
      return "nodetool.output.IntegerOutput";
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
    case "text":
      return "nodetool.constant.Text";
    case "dataframe":
      return "nodetool.dataframe.Dataframe";
    case "int":
      return "nodetool.constant.Integer";
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
  // useRef is needed to track current connection state
  const connectionCreated = useRef(false);

  const {
    connecting,
    startConnecting,
    endConnecting,
    connectType,
    connectDirection,
    connectNodeId,
    connectHandleId
  } = useConnectionStore((state) => ({
    connecting: state.connecting,
    startConnecting: state.startConnecting,
    endConnecting: state.endConnecting,
    connectType: state.connectType,
    connectDirection: state.connectDirection,
    connectNodeId: state.connectNodeId,
    connectHandleId: state.connectHandleId
  }));

  const findNode = useNodeStore((state) => state.findNode);
  const setConnectionAttempted = useNodeStore(
    (state) => state.setConnectionAttempted
  );
  const { data: metadata } = useMetadata();
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);

  /* CONNECT START */
  const onConnectStart = useCallback(
    (
      _: React.MouseEvent | React.TouchEvent,
      { nodeId, handleId, handleType }: OnConnectStartParams
    ) => {
      if (!nodeId || !handleId || !handleType || !metadata) {
        console.warn("Missing required data for connection start");
        return;
      }

      const node = findNode(nodeId);
      if (!node) {
        console.warn(`Node with id ${nodeId} not found`);
        return;
      }

      const nodeMetadata = metadata.metadataByType[node.type || ""];
      if (!nodeMetadata) {
        console.warn(`Metadata for node type ${node.type} not found`);
        return;
      }

      connectionCreated.current = false;

      try {
        startConnecting(nodeId, handleId, handleType, nodeMetadata);
      } catch (error) {
        console.error("Error starting connection:", error);
        endConnecting();
      }
    },
    [metadata, findNode, startConnecting, endConnecting]
  );

  /* ON CONNECT */
  const handleOnConnect = useCallback(
    (connection: Connection) => {
      connectionCreated.current = true;
      devLog("Connection Created", connection);
      // Call the onConnect function from NodeStore
      useNodeStore.getState().onConnect(connection);
    },
    [connectionCreated]
  );

  /* CONNECT END */
  // called after onConnect
  const onConnectEnd = useCallback(
    // open contextMenu for input/output
    (event: any) => {
      const targetIsGroup = event.target.classList.contains("loop-node");
      const targetIsPane = event.target.classList.contains("react-flow__pane");
      const targetIsNode = event.target.closest(".react-flow__node") !== null;

      // targetIsNode: try to connect to first possible input
      if (!connectionCreated.current && targetIsNode) {
        const nodeId = event.target.closest(".react-flow__node").dataset.id;
        const node = findNode(nodeId);
        if (!node || !metadata) {
          return;
        }

        const nodeMetadata = metadata.metadataByType[node.type || ""];
        if (!nodeMetadata) {
          return;
        }
        // Check if a connection is possible
        const possibleInputs = nodeMetadata.properties.filter(
          (prop) => prop.type.type === connectType?.type
        );

        if (possibleInputs.length > 0) {
          // Connect to the first possible input
          const firstInput = possibleInputs[0];
          const newConnection = {
            source: connectNodeId || "",
            sourceHandle: connectHandleId || "",
            target: nodeId,
            targetHandle: firstInput.name
          };

          handleOnConnect(newConnection);
          endConnecting();
        } else {
          endConnecting();
        }
      }

      // targetIsPane: open context menu for output
      if (!connectionCreated.current && (targetIsPane || targetIsGroup)) {
        if (connectDirection === "source") {
          openContextMenu(
            "output-context-menu",
            connectNodeId || "",
            event.clientX + 25,
            event.clientY - 50,
            "react-flow__pane",
            connectType ? connectType.type : "",
            connectHandleId || ""
          );
        }
        if (connectDirection === "target") {
          openContextMenu(
            "input-context-menu",
            connectNodeId || "",
            event.clientX + 25,
            event.clientY - 50,
            "react-flow__pane",
            connectType ? connectType.type : "",
            connectHandleId || ""
          );
        }
      }
      connectionCreated.current = true;
      setConnectionAttempted(false);

      endConnecting();
    },
    [
      setConnectionAttempted,
      endConnecting,
      findNode,
      metadata,
      connectType,
      connectNodeId,
      connectHandleId,
      handleOnConnect,
      connectDirection,
      openContextMenu
    ]
  );

  return { handleOnConnect, onConnectStart, onConnectEnd, connecting };
}
