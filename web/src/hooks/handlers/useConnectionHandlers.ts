import { useCallback, useRef } from "react";
import { OnConnectStartParams, Connection } from "@xyflow/react";
import useConnectionStore from "../../stores/ConnectionStore";
import { useNodeStore } from "../../stores/NodeStore";
import { TypeName } from "../../stores/ApiTypes";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { devLog } from "../../utils/DevLog";
import { isConnectable } from "../../utils/TypeHandler";
import { useNotificationStore } from "../../stores/NotificationStore";
import useMetadataStore from "../../stores/MetadataStore";

/**
 * Find if an element or any of its parents has a class name
 */
const findClassNameinElementOrParents = (
  element: HTMLElement,
  className: string
) => {
  if (element.classList.contains(className)) {
    return true;
  }
  if (element.parentElement) {
    return findClassNameinElementOrParents(element.parentElement, className);
  }
  return false;
};

export default function useConnectionHandlers() {
  // useRef is needed to track current connection state
  const connectionCreated = useRef(false);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const { connecting, startConnecting, endConnecting } = useConnectionStore(
    (state) => ({
      connecting: state.connecting,
      startConnecting: state.startConnecting,
      endConnecting: state.endConnecting
    })
  );

  const findNode = useNodeStore((state) => state.findNode);
  const setConnectionAttempted = useNodeStore(
    (state) => state.setConnectionAttempted
  );
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);

  /* CONNECT START */
  const onConnectStart = useCallback(
    (event: any, { nodeId, handleId, handleType }: OnConnectStartParams) => {
      if (!nodeId || !handleId || !handleType) {
        console.warn("Missing required data for connection start");
        return;
      }

      const node = findNode(nodeId);
      if (!node) {
        console.warn(`Node with id ${nodeId} not found`);
        return;
      }

      const nodeMetadata = getMetadata(node.type || "");
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
    [findNode, startConnecting, endConnecting, getMetadata]
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
      const { connectDirection, connectNodeId, connectHandleId, connectType } =
        useConnectionStore.getState();
      const targetIsGroup = findClassNameinElementOrParents(
        event.target,
        "loop-node"
      );
      const targetIsPane = event.target.classList.contains("react-flow__pane");
      const targetIsNode =
        event.target.closest(".react-flow__node") !== null &&
        !targetIsGroup &&
        !targetIsPane;

      // targetIsNode: try to auto-connect
      if (!connectionCreated.current && targetIsNode) {
        const nodeId = event.target.closest(".react-flow__node").dataset.id;
        const node = findNode(nodeId);
        if (!node) {
          return;
        }

        const nodeMetadata = getMetadata(node.type || "");
        if (!nodeMetadata) {
          console.warn(`Metadata for node type ${node.type} not found`);
          return;
        }
        if (connectDirection === "source") {
          const possibleInputs = nodeMetadata.properties.filter(
            (prop) =>
              isConnectable(
                {
                  type: connectType?.type || "any",
                  optional: false,
                  type_args: []
                },
                {
                  type: prop.type.type as TypeName,
                  optional: false,
                  type_args: []
                }
              ),
            true
          );

          if (possibleInputs.length > 0) {
            const edges = useNodeStore.getState().edges;
            const unusedInput = possibleInputs.find(
              (input) =>
                !edges.some(
                  (edge) =>
                    edge.target === nodeId && edge.targetHandle === input.name
                )
            );

            if (unusedInput) {
              const newConnection = {
                source: connectNodeId || "",
                sourceHandle: connectHandleId || "",
                target: nodeId,
                targetHandle: unusedInput.name
              };
              handleOnConnect(newConnection);
              endConnecting();
            } else {
              endConnecting();
              addNotification({
                type: "warning",
                alert: true,
                content: "All possible inputs are already connected"
              });
            }
          } else {
            endConnecting();
            addNotification({
              type: "warning",
              alert: true,
              content: "No possible connections found for this node"
            });
          }
        } else if (connectDirection === "target") {
          const possibleOutputs = nodeMetadata.outputs.filter((prop) =>
            isConnectable(
              {
                type: connectType?.type || "any",
                optional: false,
                type_args: []
              },
              {
                type: prop.type.type as TypeName,
                optional: false,
                type_args: []
              },
              true
            )
          );
          if (possibleOutputs.length > 0) {
            // connect first possible output
            const firstOutput = possibleOutputs[0];
            const newConnection = {
              source: nodeId,
              sourceHandle: firstOutput.name,
              target: connectNodeId || "",
              targetHandle: connectHandleId || ""
            };
            handleOnConnect(newConnection);
            endConnecting();
          } else {
            endConnecting();
          }
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
            connectType ?? undefined,
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
            connectType ?? undefined,
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
      getMetadata,
      handleOnConnect,
      addNotification,
      openContextMenu
    ]
  );

  return { handleOnConnect, onConnectStart, onConnectEnd, connecting };
}
