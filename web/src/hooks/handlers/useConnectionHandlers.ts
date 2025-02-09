import { useCallback, useRef } from "react";
import { OnConnectStartParams, Connection } from "@xyflow/react";
import useConnectionStore from "../../stores/ConnectionStore";
import { TypeName } from "../../stores/ApiTypes";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { devLog } from "../../utils/DevLog";
import { isConnectable } from "../../utils/TypeHandler";
import { useNotificationStore } from "../../stores/NotificationStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useNodes } from "../../contexts/NodeContext";

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
  const { updateNodeData } = useNodes((state) => ({
    updateNodeData: state.updateNodeData
  }));
  const { connecting, startConnecting, endConnecting } = useConnectionStore(
    (state) => ({
      connecting: state.connecting,
      startConnecting: state.startConnecting,
      endConnecting: state.endConnecting
    })
  );

  const { findNode, onConnect, edges, setConnectionAttempted } = useNodes(
    (state) => ({
      findNode: state.findNode,
      onConnect: state.onConnect,
      edges: state.edges,
      setConnectionAttempted: state.setConnectionAttempted
    })
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
        const node = findNode(nodeId);
        if (!node) {
          console.warn(`Node with id ${nodeId} not found`);
          return;
        }
        startConnecting(node, handleId, handleType, nodeMetadata);
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
      const { source, sourceHandle, target, targetHandle } = connection;
      const sourceNode = findNode(source);
      const targetNode = findNode(target);
      if (!sourceNode || !targetNode) {
        return;
      }
      const sourceMetadata = getMetadata(sourceNode.type || "");
      const targetMetadata = getMetadata(targetNode.type || "");
      const sourceHandleMetadata = sourceMetadata?.outputs.find(
        (prop) => prop.name === sourceHandle
      );
      const targetHandleMetadata = targetMetadata?.properties.find(
        (prop) => prop.name === targetHandle
      );
      if (!sourceHandleMetadata || !targetHandleMetadata) {
        return;
      }
      if (
        isConnectable(
          sourceHandleMetadata.type,
          targetHandleMetadata.type,
          true
        )
      ) {
        connectionCreated.current = true;
        devLog("Connection Created", connection);
        onConnect(connection);
      } else {
        addNotification({
          type: "warning",
          alert: true,
          content: "Cannot connect these types"
        });
      }
    },
    [findNode, getMetadata, onConnect, addNotification]
  );

  /* CONNECT END */
  const onConnectEnd = useCallback(
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

      // targetIsNode: try to auto-connect or create dynamic property
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

        // Handle dynamic properties case
        if (nodeMetadata.is_dynamic && connectDirection === "source") {
          const newConnection = {
            source: connectNodeId || "",
            sourceHandle: connectHandleId || "",
            target: nodeId,
            targetHandle: connectHandleId // Use the same handle name for the dynamic property
          };

          // Create the dynamic property
          const dynamicProps = node.data?.dynamic_properties || {};
          if (!dynamicProps[connectHandleId || ""]) {
            const updatedProps = {
              ...dynamicProps,
              [connectHandleId || ""]: ""
            };
            updateNodeData(nodeId, {
              dynamic_properties: updatedProps
            });
          }

          handleOnConnect(newConnection);
          endConnecting();
          return;
        }

        // Original auto-connect logic
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
      edges,
      handleOnConnect,
      addNotification,
      openContextMenu,
      updateNodeData
    ]
  );

  return { handleOnConnect, onConnectStart, onConnectEnd, connecting };
}
