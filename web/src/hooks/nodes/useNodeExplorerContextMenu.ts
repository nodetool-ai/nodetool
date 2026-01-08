import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useNotificationStore } from "../../stores/NotificationStore";
import useResultsStore from "../../stores/ResultsStore";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import { useClipboard } from "../browser/useClipboard";
import log from "loglevel";
import { useRemoveFromGroup } from "./useRemoveFromGroup";
import useMetadataStore from "../../stores/MetadataStore";
import { subgraph } from "../../core/graph";
import { resolveExternalEdgeValue } from "../../utils/edgeValue";
import { useNodes } from "../../contexts/NodeContext";
import {
  constantToInputType,
  inputToConstantType
} from "../../utils/NodeTypeMapping";

interface UseNodeExplorerContextMenuReturn {
  menuPosition: { x: number; y: number } | null;
  closeContextMenu: () => void;
  openContextMenu: (nodeId: string, x: number, y: number) => void;
  nodeId: string | null;
  node: Node<NodeData> | null;
  handlers: {
    handleFocusNode: () => void;
    handleEditNode: () => void;
    handleRunFromHere: () => void;
    handleToggleBypass: () => void;
    handleToggleComment: () => void;
    handleFindTemplates: () => void;
    handleSelectAllSameType: () => void;
    handleDeleteNode: () => void;
    handleCopyMetadataToClipboard: () => void;
    handleConvertToInput: () => void;
    handleConvertToConstant: () => void;
    handleRemoveFromGroup: () => void;
  };
  conditions: {
    hasCommentTitle: boolean;
    isBypassed: boolean;
    canConvertToInput: boolean;
    canConvertToConstant: boolean;
    isWorkflowRunning: boolean;
    isInGroup: boolean;
  };
}

export function useNodeExplorerContextMenu(): UseNodeExplorerContextMenuReturn {
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [nodeId, setNodeId] = useState<string | null>(null);

  const navigate = useNavigate();
  const metadata = useMetadataStore((state) => state.getMetadata);
  const { writeClipboard } = useClipboard();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const {
    updateNodeData,
    updateNode,
    selectNodesByType,
    deleteNode,
    getSelectedNodes,
    toggleBypass,
    nodes,
    edges,
    workflow,
    findNode
  } = useNodes((state) => ({
    updateNodeData: state.updateNodeData,
    updateNode: state.updateNode,
    selectNodesByType: state.selectNodesByType,
    deleteNode: state.deleteNode,
    getSelectedNodes: state.getSelectedNodes,
    toggleBypass: state.toggleBypass,
    nodes: state.nodes,
    edges: state.edges,
    workflow: state.workflow,
    findNode: state.findNode
  }));
  const run = useWebsocketRunner((state) => state.run);
  const isWorkflowRunning = useWebsocketRunner(
    (state) => state.state === "running"
  );
  const getResult = useResultsStore((state) => state.getResult);
  const removeFromGroup = useRemoveFromGroup();

  const node = nodeId ? nodes.find((n) => n.id === nodeId) : null;
  const nodeData = node?.data;
  const nodeMetadata = node ? metadata(node.type ?? "") : null;
  const selectedNodes = getSelectedNodes();

  const openContextMenu = useCallback((id: string, x: number, y: number) => {
    setNodeId(id);
    setMenuPosition({ x, y });
  }, []);

  const closeContextMenu = useCallback(() => {
    setMenuPosition(null);
    setNodeId(null);
  }, []);

  const handleFocusNode = useCallback(() => {
    if (!nodeId || !node) {
      return;
    }
    window.dispatchEvent(
      new CustomEvent("nodetool:fit-node", {
        detail: { nodeId, node }
      })
    );
    closeContextMenu();
  }, [nodeId, node, closeContextMenu]);

  const handleEditNode = useCallback(() => {
    if (!nodeId || !node) {
      return;
    }
    window.dispatchEvent(
      new CustomEvent("nodetool:edit-node", {
        detail: { nodeId, node }
      })
    );
    closeContextMenu();
  }, [nodeId, node, closeContextMenu]);

  const handleToggleComment = useCallback(() => {
    if (!nodeId) {
      return;
    }
    const currentNode = nodes.find((n) => n.id === nodeId);
    const hasCommentTitle = Boolean(currentNode?.data?.title?.trim());
    updateNodeData(nodeId, { title: hasCommentTitle ? "" : "comment" });
    closeContextMenu();
  }, [closeContextMenu, nodeId, updateNodeData, nodes]);

  const handleRunFromHere = useCallback(() => {
    if (!node || !nodeId || isWorkflowRunning) {
      return;
    }

    const downstream = subgraph(edges, nodes, node as Node<NodeData>);
    const subgraphNodeIds = new Set(downstream.nodes.map((n) => n.id));

    const externalInputEdges = edges.filter(
      (edge) =>
        subgraphNodeIds.has(edge.target) && !subgraphNodeIds.has(edge.source)
    );

    const nodePropertyOverrides = new Map<string, Record<string, any>>();

    for (const edge of externalInputEdges) {
      const sourceNodeId = edge.source;
      const sourceHandle = edge.sourceHandle;
      const targetNodeId = edge.target;
      const targetHandle = edge.targetHandle;

      if (!targetHandle) {
        continue;
      }

      const { value, hasValue, isFallback } = resolveExternalEdgeValue(
        edge,
        workflow.id,
        getResult,
        findNode
      );
      if (!hasValue) {
        continue;
      }

      const existing = nodePropertyOverrides.get(targetNodeId) || {};
      existing[targetHandle] = value;
      nodePropertyOverrides.set(targetNodeId, existing);

      log.info(
        `Run from here: Caching property ${targetHandle} on node ${targetNodeId} from upstream node ${sourceNodeId}`,
        {
          sourceHandle,
          valueSource: isFallback ? "node" : "cached_result"
        }
      );
    }

    const nodesWithCachedValues = downstream.nodes.map((n) => {
      const overrides = nodePropertyOverrides.get(n.id);
      if (overrides && Object.keys(overrides).length > 0) {
        const dynamicProps = n.data?.dynamic_properties || {};
        const staticProps = n.data?.properties || {};
        const updatedDynamicProps = { ...dynamicProps };
        const updatedStaticProps = { ...staticProps };

        for (const [key, value] of Object.entries(overrides)) {
          if (Object.prototype.hasOwn.call(dynamicProps, key)) {
            updatedDynamicProps[key] = value;
          } else {
            updatedStaticProps[key] = value;
          }
        }

        return {
          ...n,
          data: {
            ...n.data,
            properties: {
              ...updatedStaticProps
            },
            dynamic_properties: {
              ...updatedDynamicProps
            }
          }
        };
      }
      return n;
    });

    log.info("Running downstream subgraph from node", {
      startNodeId: nodeId,
      nodeCount: nodesWithCachedValues.length,
      edgeCount: downstream.edges.length,
      nodesWithCachedDependencies: nodePropertyOverrides.size,
      totalCachedPropertiesInjected: Array.from(
        nodePropertyOverrides.values()
      ).reduce((sum, props) => sum + Object.keys(props).length, 0)
    });

    run({}, workflow, nodesWithCachedValues, downstream.edges);

    addNotification({
      type: "info",
      alert: false,
      content: `Running workflow from ${nodeMetadata?.title || node?.type || "node"}`
    });
    closeContextMenu();
  }, [
    node,
    nodeId,
    isWorkflowRunning,
    edges,
    nodes,
    workflow,
    getResult,
    run,
    addNotification,
    nodeMetadata,
    closeContextMenu,
    findNode
  ]);

  const handleToggleBypass = useCallback(() => {
    if (!nodeId) {
      return;
    }
    toggleBypass(nodeId);
    closeContextMenu();
  }, [closeContextMenu, nodeId, toggleBypass]);

  const handleCopyMetadataToClipboard = useCallback(() => {
    if (nodeId && nodeData) {
      log.info("Copying node data to clipboard", nodeData);
      addNotification({
        type: "info",
        alert: true,
        content: "Copied Node Data to Clipboard!"
      });
      writeClipboard(JSON.stringify(nodeData, null, 2), true, true);
      closeContextMenu();
    }
  }, [
    nodeId,
    nodeData,
    addNotification,
    writeClipboard,
    closeContextMenu
  ]);

  const handleFindTemplates = useCallback(() => {
    const nodeType = node?.type || "";
    navigate(`/templates?node=${encodeURIComponent(nodeType)}`);
    closeContextMenu();
  }, [navigate, closeContextMenu, node?.type]);

  const handleSelectAllSameType = useCallback(() => {
    if (node?.type) {
      selectNodesByType(node.type);
      closeContextMenu();
    }
  }, [closeContextMenu, node?.type, selectNodesByType]);

  const handleDeleteNode = useCallback(() => {
    if (selectedNodes.length > 1) {
      selectedNodes.forEach((selected) => {
        deleteNode(selected.id);
      });
    } else if (nodeId) {
      deleteNode(nodeId);
    }
    closeContextMenu();
  }, [closeContextMenu, deleteNode, nodeId, selectedNodes]);

  const handleConvertToInput = useCallback(() => {
    if (!node || !nodeId) {
      return;
    }
    const targetType = constantToInputType(node?.type ?? "");
    if (targetType) {
      const match = targetType.match(/nodetool\.input\.(\w+)Input$/);
      const name = match ? match[1].toLowerCase() : "input";
      updateNodeData(nodeId, { properties: { ...nodeData?.properties, name } });
      updateNode(nodeId, { type: targetType });
      log.info("Converted constant node to input node", {
        from: node.type,
        to: targetType
      });
      addNotification({
        type: "info",
        alert: false,
        content: `Converted to ${targetType.split(".").pop()}`
      });
    }
    closeContextMenu();
  }, [node, nodeId, nodeData, updateNodeData, updateNode, addNotification, closeContextMenu]);

  const handleConvertToConstant = useCallback(() => {
    if (!node || !nodeId) {
      return;
    }
    const targetType = inputToConstantType(node?.type ?? "");
    if (targetType) {
      updateNodeData(nodeId, { properties: { ...nodeData?.properties } });
      updateNode(nodeId, { type: targetType });
      log.info("Converted input node to constant node", {
        from: node.type,
        to: targetType
      });
      addNotification({
        type: "info",
        alert: false,
        content: `Converted to ${targetType.split(".").pop()}`
      });
    }
    closeContextMenu();
  }, [node, nodeId, nodeData, updateNodeData, updateNode, addNotification, closeContextMenu]);

  const handleRemoveFromGroup = useCallback(() => {
    if (node) {
      removeFromGroup([node]);
      closeContextMenu();
    }
  }, [node, removeFromGroup, closeContextMenu]);

  const hasCommentTitle = Boolean(nodeData?.title?.trim());
  const isBypassed = Boolean(nodeData?.bypassed);
  const canConvertToInput = Boolean(nodeId && constantToInputType(node?.type ?? ""));
  const canConvertToConstant = Boolean(nodeId && inputToConstantType(node?.type ?? ""));
  const isInGroup = Boolean(node?.parentId);

  return {
    menuPosition,
    closeContextMenu,
    openContextMenu,
    nodeId,
    node: node || null,
    handlers: {
      handleFocusNode,
      handleEditNode,
      handleRunFromHere,
      handleToggleBypass,
      handleToggleComment,
      handleFindTemplates,
      handleSelectAllSameType,
      handleDeleteNode,
      handleCopyMetadataToClipboard,
      handleConvertToInput,
      handleConvertToConstant,
      handleRemoveFromGroup
    },
    conditions: {
      hasCommentTitle,
      isBypassed,
      canConvertToInput,
      canConvertToConstant,
      isWorkflowRunning,
      isInGroup
    }
  };
}
