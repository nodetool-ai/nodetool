import { useCallback, useRef } from "react";
import { OnConnectStartParams, Connection } from "@xyflow/react";
import useConnectionStore from "../../stores/ConnectionStore";
import { TypeName } from "../../stores/ApiTypes";
import useContextMenu from "../../stores/ContextMenuStore";
import { isConnectable, Slugify } from "../../utils/TypeHandler";
import { findOutputHandle, findInputHandle } from "../../utils/handleUtils";
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
  const { openContextMenu } = useContextMenu();

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
        console.warn("Invalid source or target node", { source, target });
        return;
      }
      if (!sourceHandle || !targetHandle) {
        console.warn(
          `Invalid source or target handle. Source: ${sourceHandle}, Target: ${targetHandle}`
        );
        return;
      }
      const sourceMetadata = getMetadata(sourceNode.type || "");
      const targetMetadata = getMetadata(targetNode.type || "");

      if (!sourceMetadata || !targetMetadata) {
        console.warn("Missing metadata for source or target node");
        return;
      }

      const sourceHandleMetadata = findOutputHandle(
        sourceNode,
        sourceHandle,
        sourceMetadata
      );
      const targetHandleMetadata = findInputHandle(
        targetNode,
        targetHandle,
        targetMetadata
      );
      const isDynamicProperty =
        targetNode.data.dynamic_properties[targetHandle] !== undefined;

      if (!sourceHandleMetadata) {
        console.warn(`Invalid source handle. Source: ${sourceHandle}`);
        return;
      }

      if (!targetHandleMetadata && !isDynamicProperty) {
        console.warn(`Invalid target handle. Target: ${targetHandle}`);
        return;
      }

      if (
        isDynamicProperty ||
        isConnectable(
          sourceHandleMetadata.type,
          targetHandleMetadata?.type || {
            type: "any",
            optional: false,
            type_args: [],
            type_name: "any"
          },
          true
        )
      ) {
        connectionCreated.current = true;
        // Add className based on the source handle type
        const connectionWithClassName = {
          ...connection,
          className: Slugify(sourceHandleMetadata.type.type || "")
        };
        onConnect(connectionWithClassName);
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
      if (!connectNodeId || !connectHandleId || !connectType) {
        return;
      }
      const connectNode = findNode(connectNodeId);
      if (!connectNode) {
        return;
      }
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

        if (
          nodeMetadata.supports_dynamic_outputs &&
          connectDirection === "target"
        ) {
          const sourceNodeType = connectNode.type?.split(".").pop();
          const dynamicOutputs = node.data?.dynamic_outputs || {};
          const sourceHandle = sourceNodeType || connectHandleId || "";
          const dynamicOutput = {
            type: connectType?.type || "",
            optional: false,
            type_args: [],
            type_name: ""
          };
          updateNodeData(nodeId, {
            dynamic_outputs: {
              ...dynamicOutputs,
              [sourceHandle]: dynamicOutput
            }
          });
          const newConnection = {
            source: nodeId,
            sourceHandle: sourceHandle,
            target: connectNodeId || "",
            targetHandle: connectHandleId || "",
            className: Slugify(connectType?.type || "")
          };
          onConnect(newConnection);
          endConnecting();
          return;
        }

        // Handle dynamic properties case
        if (nodeMetadata.is_dynamic && connectDirection === "source") {
          // Use the source node's name as the property name
          const sourceNodeName =
            connectNode.data?.title ||
            connectNode.type?.split(".").pop() ||
            connectHandleId ||
            "";
          const dynamicProps = node.data?.dynamic_properties || {};

          // Find a unique name if the property already exists
          let propertyName = sourceNodeName;
          let counter = 1;
          while (dynamicProps[propertyName]) {
            propertyName = `${sourceNodeName}_${counter}`;
            counter++;
          }

          const newConnection = {
            source: connectNodeId || "",
            sourceHandle: connectHandleId || "",
            target: nodeId,
            targetHandle: propertyName,
            className: Slugify(connectType?.type || "")
          };

          // Create the dynamic property
          if (!dynamicProps[propertyName]) {
            const updatedProps = {
              ...dynamicProps,
              [propertyName]: ""
            };
            updateNodeData(nodeId, {
              dynamic_properties: updatedProps
            });
          }

          handleOnConnect(newConnection);
          endConnecting();
          return;
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
      openContextMenu,
      updateNodeData,
      onConnect
    ]
  );

  return { handleOnConnect, onConnectStart, onConnectEnd, connecting };
}
