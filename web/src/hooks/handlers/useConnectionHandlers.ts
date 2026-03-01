import { useCallback, useRef } from "react";
import { Connection, type OnConnectStart, type OnConnectEnd } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import useConnectionStore from "../../stores/ConnectionStore";
import useContextMenu from "../../stores/ContextMenuStore";
import { isConnectable, Slugify, typeToString } from "../../utils/TypeHandler";
import {
  findOutputHandle,
  findInputHandle,
  getAllInputHandles,
  getAllOutputHandles
} from "../../utils/handleUtils";
import { useNotificationStore } from "../../stores/NotificationStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useNodes } from "../../contexts/NodeContext";
import {
  ConnectionMatchMenuPayload,
  ConnectionMatchOption
} from "../../components/context_menus/ConnectionMatchMenu";
import { wouldCreateCycle } from "../../utils/graphCycle";
import { CONTROL_HANDLE_ID } from "../../stores/graphEdgeToReactFlowEdge";

const PREVIEW_NODE_TYPE = "nodetool.workflows.base_node.Preview";
const PREVIEW_VALUE_HANDLE = "value";
const REROUTE_NODE_TYPE = "nodetool.control.Reroute";
const REROUTE_INPUT_HANDLE = "input_value";
const REROUTE_OUTPUT_HANDLE = "output";

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
    }),
    shallow
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
  const onConnectStart: OnConnectStart = useCallback(
    (event, { nodeId, handleId, handleType }) => {
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

      // Control edge: skip type validation, delegate to NodeStore
      if (targetHandle === CONTROL_HANDLE_ID || sourceHandle === CONTROL_HANDLE_ID) {
        if (wouldCreateCycle(edges, source, target)) {
          addNotification({
            type: "warning",
            alert: true,
            content: "Cannot create a cyclic connection"
          });
          return;
        }
        // Normalize: control edges always use __control__ for both handles
        const controlConnection: Connection = {
          source,
          sourceHandle: CONTROL_HANDLE_ID,
          target,
          targetHandle: CONTROL_HANDLE_ID
        };
        connectionCreated.current = true;
        onConnect(controlConnection);
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
        if (wouldCreateCycle(edges, source, target)) {
          addNotification({
            type: "warning",
            alert: true,
            content: "Cannot create a cyclic connection"
          });
          return;
        }
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
    [findNode, getMetadata, onConnect, addNotification, edges]
  );

  const openHandleSelectionMenu = useCallback(
    (
      event: MouseEvent,
      anchorNodeId: string,
      options: ConnectionMatchOption[]
    ) => {
      if (!options.length) {
        return false;
      }

      const payload: ConnectionMatchMenuPayload = {
        options,
        onSelect: (option) => {
          handleOnConnect(option.connection);
        }
      };

      openContextMenu(
        "connection-match-menu",
        anchorNodeId,
        event.clientX,
        event.clientY,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        payload
      );
      connectionCreated.current = true;
      setConnectionAttempted(false);
      endConnecting();
      return true;
    },
    [openContextMenu, handleOnConnect, setConnectionAttempted, endConnecting]
  );

  /* CONNECT END */
  const onConnectEnd: OnConnectEnd = useCallback(
    (event, _connectionState) => {
      // Only handle mouse events, not touch events
      // Note: In tests, event may be a mock object that doesn't inherit from MouseEvent
      if (event instanceof TouchEvent) {
        return;
      }

      const { connectDirection, connectNodeId, connectHandleId, connectType } =
        useConnectionStore.getState();
      if (!connectNodeId || !connectHandleId || !connectType) {
        return;
      }
      const connectNode = findNode(connectNodeId);
      if (!connectNode) {
        return;
      }

      // Type guard to ensure event.target is an HTMLElement
      // Note: For production code, we check instanceof HTMLElement
      // For tests, we check if target has the necessary properties
      const target = event.target;
      if (!target) {
        return;
      }
      // Check if target is an HTMLElement OR has the necessary properties for tests
      const isHTMLElement = target instanceof HTMLElement;
      const hasTestProperties =
        "classList" in target &&
        "closest" in target &&
        typeof target.classList === "object" &&
        typeof target.closest === "function";

      if (!isHTMLElement && !hasTestProperties) {
        return;
      }

      // Cast target to HTMLElement for production use or test mocks
      const htmlTarget = target as HTMLElement;
      const targetIsGroup = findClassNameinElementOrParents(
        htmlTarget,
        "loop-node"
      );
      const targetIsPane = htmlTarget.classList.contains("react-flow__pane");
      const targetIsNode =
        htmlTarget.closest(".react-flow__node") !== null &&
        !targetIsGroup &&
        !targetIsPane;

      // targetIsNode: try to auto-connect or create dynamic property
      if (!connectionCreated.current && targetIsNode) {
        const closestNode = htmlTarget.closest(".react-flow__node") as HTMLElement | null;
        const nodeId = closestNode?.dataset.id;
        if (!nodeId) {
          return;
        }
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
          const baseHandle = sourceNodeType || connectHandleId || "";
          let sourceHandle = baseHandle;
          let counter = 1;
          while (sourceHandle in dynamicOutputs) {
            sourceHandle = `${baseHandle}_${counter}`;
            counter++;
          }
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


        // Auto-connect for reroute nodes regardless of drop location
        if (nodeMetadata.node_type === REROUTE_NODE_TYPE) {
          if (connectDirection === "source") {
            const rerouteConnection: Connection = {
              source: connectNodeId || "",
              sourceHandle: connectHandleId || "",
              target: nodeId,
              targetHandle: REROUTE_INPUT_HANDLE
            };
            handleOnConnect(rerouteConnection);
            endConnecting();
            return;
          }

          if (connectDirection === "target") {
            const rerouteConnection: Connection = {
              source: nodeId,
              sourceHandle: REROUTE_OUTPUT_HANDLE,
              target: connectNodeId || "",
              targetHandle: connectHandleId || ""
            };
            handleOnConnect(rerouteConnection);
            endConnecting();
            return;
          }
        }

        // Allow preview nodes to auto-connect drops anywhere on the node body
        if (
          nodeMetadata.node_type === PREVIEW_NODE_TYPE &&
          connectDirection === "source"
        ) {
          const previewConnection: Connection = {
            source: connectNodeId || "",
            sourceHandle: connectHandleId || "",
            target: nodeId,
            targetHandle: PREVIEW_VALUE_HANDLE
          };
          handleOnConnect(previewConnection);
          endConnecting();
          return;
        }

        // Auto-create control edge when dragging from an Agent's control handle onto a node body
        if (
          connectDirection === "source" &&
          connectHandleId === CONTROL_HANDLE_ID
        ) {
          const controlConnection: Connection = {
            source: connectNodeId || "",
            sourceHandle: connectHandleId || "",
            target: nodeId,
            targetHandle: CONTROL_HANDLE_ID
          };
          handleOnConnect(controlConnection);
          endConnecting();
          return;
        }

        // Generic fallback: pick compatible handle(s)
        if (connectType) {
          if (connectDirection === "source") {
            const allInputs = getAllInputHandles(node, nodeMetadata);
            const matchingInputs = allInputs.filter(
              (handle) => isConnectable(connectType, handle.type, true)
            );

            if (matchingInputs.length === 1) {
              const matchingInput = matchingInputs[0];
              const autoConnection: Connection = {
                source: connectNodeId || "",
                sourceHandle: connectHandleId || "",
                target: nodeId,
                targetHandle: matchingInput.name
              };
              handleOnConnect(autoConnection);
              endConnecting();
              return;
            }

            if (matchingInputs.length > 1) {
              const options: ConnectionMatchOption[] = matchingInputs.map(
                (handle) => ({
                  id: handle.name,
                  label: handle.name,
                  typeLabel: typeToString(handle.type),
                  connection: {
                    source: connectNodeId || "",
                    sourceHandle: connectHandleId || "",
                    target: nodeId,
                    targetHandle: handle.name
                  }
                })
              );
              if (openHandleSelectionMenu(event, nodeId, options)) {
                return;
              }
            }
          } else if (connectDirection === "target") {
            const allOutputs = getAllOutputHandles(node, nodeMetadata);
            const matchingOutputs = allOutputs.filter(
              (handle) => isConnectable(handle.type, connectType, true)
            );

            if (matchingOutputs.length === 1) {
              const matchingOutput = matchingOutputs[0];
              const autoConnection: Connection = {
                source: nodeId,
                sourceHandle: matchingOutput.name,
                target: connectNodeId || "",
                targetHandle: connectHandleId || ""
              };
              handleOnConnect(autoConnection);
              endConnecting();
              return;
            }

            if (matchingOutputs.length > 1) {
              const options: ConnectionMatchOption[] = matchingOutputs.map(
                (handle) => ({
                  id: handle.name,
                  label: handle.name,
                  typeLabel: typeToString(handle.type),
                  connection: {
                    source: nodeId,
                    sourceHandle: handle.name,
                    target: connectNodeId || "",
                    targetHandle: connectHandleId || ""
                  }
                })
              );
              if (openHandleSelectionMenu(event, nodeId, options)) {
                return;
              }
            }
          }
        }

        // Handle dynamic properties case (if no auto-connection was possible)
        // Note: For FAL nodes, we only want inputs derived from the schema, so we skip manual creation.
        if (
          nodeMetadata.is_dynamic &&
          connectDirection === "source" &&
          node.type !== "fal.DynamicFal" &&
          node.type !== "kie.DynamicKie"
        ) {
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

      // targetIsPane: open context menu for output (skip during edge reconnection)
      const { isReconnecting } = useConnectionStore.getState();
      if (
        !connectionCreated.current &&
        !isReconnecting &&
        (targetIsPane || targetIsGroup)
      ) {
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
          // Get min/max/default from ConnectionStore before it gets reset
          const { connectMin, connectMax, connectDefault } =
            useConnectionStore.getState();
          openContextMenu(
            "input-context-menu",
            connectNodeId || "",
            event.clientX + 25,
            event.clientY - 50,
            "react-flow__pane",
            connectType ?? undefined,
            connectHandleId || "",
            undefined,
            undefined,
            { connectMin, connectMax, connectDefault } // Pass min/max/default through payload
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
      onConnect,
      openHandleSelectionMenu
    ]
  );

  return { handleOnConnect, onConnectStart, onConnectEnd, connecting };
}
