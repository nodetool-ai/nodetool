import { useCallback } from "react";

import { useNavigate } from "react-router-dom";
import { Node } from "@xyflow/react";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { NodeData } from "../../stores/NodeData";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useClipboard } from "../browser/useClipboard";
import log from "loglevel";

import { useNodes } from "../../contexts/NodeContext";
import {
  constantToInputType,
  inputToConstantType
} from "../../utils/NodeTypeMapping";
import { useRunFromHere } from "./useRunFromHere";
import { useDuplicateNodes } from "../useDuplicate";

interface UseNodeContextMenuReturn {
  menuPosition: { x: number; y: number } | null;
  closeContextMenu: () => void;
  nodeId: string | null;
  node: Node<NodeData> | null;
  nodeData: NodeData | undefined;
  handlers: {
    handleToggleComment: () => void;
    handleRunFromHere: () => void;
    handleToggleBypass: () => void;
    handleCopyMetadataToClipboard: () => void;
    handleFindTemplates: () => void;
    handleSelectAllSameType: () => void;
    handleDeleteNode: () => void;
    handleConvertToInput: () => void;
    handleConvertToConstant: () => void;
    handleDuplicate: () => void;
    handleDuplicateVertical: () => void;
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

export function useNodeContextMenu(): UseNodeContextMenuReturn {
  const menuPosition = useContextMenuStore((state) => state.menuPosition);
  const closeContextMenu = useContextMenuStore(
    (state) => state.closeContextMenu
  );
  const nodeId = useContextMenuStore((state) => state.nodeId);

  const {
    updateNodeData,
    updateNode,
    selectNodesByType,
    deleteNode,
    getSelectedNodes,
    toggleBypass,
    nodes,
    setSelectedNodes
  } = useNodes((state) => ({
    updateNodeData: state.updateNodeData,
    updateNode: state.updateNode,
    selectNodesByType: state.selectNodesByType,
    deleteNode: state.deleteNode,
    getSelectedNodes: state.getSelectedNodes,
    toggleBypass: state.toggleBypass,
    nodes: state.nodes,
    setSelectedNodes: state.setSelectedNodes
  }));

  const rawNode = nodeId ? nodes.find((n) => n.id === nodeId) : undefined;
  const node = rawNode as Node<NodeData> | null;
  const nodeData = node?.data;
  const { writeClipboard } = useClipboard();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const navigate = useNavigate();

  const { runFromHere, isWorkflowRunning } = useRunFromHere(node);

  const hasCommentTitle = Boolean(nodeData?.title?.trim());
  const isBypassed = Boolean(nodeData?.bypassed);
  const selectedNodes = getSelectedNodes();

  const handleToggleComment = useCallback(() => {
    if (!nodeId) {
      return;
    }
    updateNodeData(nodeId, { title: hasCommentTitle ? "" : "comment" });
    closeContextMenu();
  }, [closeContextMenu, hasCommentTitle, nodeId, updateNodeData]);

  const handleRunFromHere = useCallback(() => {
    runFromHere();
    closeContextMenu();
  }, [runFromHere, closeContextMenu]);

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
  }, [nodeId, nodeData, addNotification, writeClipboard, closeContextMenu]);

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
  }, [
    node,
    nodeId,
    nodeData,
    updateNodeData,
    updateNode,
    addNotification,
    closeContextMenu
  ]);

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
  }, [
    node,
    nodeId,
    nodeData,
    updateNodeData,
    updateNode,
    addNotification,
    closeContextMenu
  ]);

  const duplicateNode = useDuplicateNodes(false, true);
  const duplicateNodeVertical = useDuplicateNodes(true, true);

  const handleDuplicate = useCallback(() => {
    if (!node) {
      return;
    }
    // Select the current node if it's not already selected
    const selectedNodes = getSelectedNodes();
    if (!selectedNodes.some((n) => n.id === node.id)) {
      setSelectedNodes([node]);
    }
    duplicateNode();
    closeContextMenu();
  }, [node, getSelectedNodes, setSelectedNodes, duplicateNode, closeContextMenu]);

  const handleDuplicateVertical = useCallback(() => {
    if (!node) {
      return;
    }
    // Select the current node if it's not already selected
    const selectedNodes = getSelectedNodes();
    if (!selectedNodes.some((n) => n.id === node.id)) {
      setSelectedNodes([node]);
    }
    duplicateNodeVertical();
    closeContextMenu();
  }, [
    node,
    getSelectedNodes,
    setSelectedNodes,
    duplicateNodeVertical,
    closeContextMenu
  ]);

  const canConvertToInput = Boolean(
    nodeId && constantToInputType(node?.type ?? "")
  );
  const canConvertToConstant = Boolean(
    nodeId && inputToConstantType(node?.type ?? "")
  );
  const isInGroup = Boolean(node?.parentId);

  return {
    menuPosition,
    closeContextMenu,
    nodeId,
    node: node || null,
    nodeData,
    handlers: {
      handleToggleComment,
      handleRunFromHere,
      handleToggleBypass,
      handleCopyMetadataToClipboard,
      handleFindTemplates,
      handleSelectAllSameType,
      handleDeleteNode,
      handleConvertToInput,
      handleConvertToConstant,
      handleDuplicate,
      handleDuplicateVertical
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
