import React, { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
//mui
import { Menu, Divider } from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
//icons
import DataArrayIcon from "@mui/icons-material/DataArray";
import GroupRemoveIcon from "@mui/icons-material/GroupRemove";
import SearchIcon from "@mui/icons-material/Search";
import EditIcon from "@mui/icons-material/Edit";
import FilterListIcon from "@mui/icons-material/FilterList";
import DeleteIcon from "@mui/icons-material/Delete";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import BlockIcon from "@mui/icons-material/Block";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
import { NodeData } from "../../stores/NodeData";
import { useNotificationStore } from "../../stores/NotificationStore";
import useResultsStore from "../../stores/ResultsStore";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
//utils
import { useClipboard } from "../../hooks/browser/useClipboard";
import log from "loglevel";
import { useRemoveFromGroup } from "../../hooks/nodes/useRemoveFromGroup";
import { isDevelopment } from "../../stores/ApiClient";
import { subgraph } from "../../core/graph";
//reactflow
import { Node } from "@xyflow/react";
import useMetadataStore from "../../stores/MetadataStore";
import { useNavigate } from "react-router-dom";
import { useNodes } from "../../contexts/NodeContext";
import {
  constantToInputType,
  inputToConstantType
} from "../../utils/NodeTypeMapping";

const NodeContextMenu: React.FC = () => {
  const menuPosition = useContextMenuStore((state) => state.menuPosition);
  const closeContextMenu = useContextMenuStore(
    (state) => state.closeContextMenu
  );
  const nodeId = useContextMenuStore((state) => state.nodeId);
  const { getNode } = useReactFlow();
  const node = nodeId ? getNode(nodeId) : null;
  const nodeData = node?.data as NodeData;
  const removeFromGroup = useRemoveFromGroup();
  const metadata = useMetadataStore((state) =>
    state.getMetadata(node?.type ?? "")
  );
  const { writeClipboard } = useClipboard();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const navigate = useNavigate();
  const { updateNodeData, updateNode, selectNodesByType, deleteNode, selectedNodes, toggleBypass, nodes, edges, workflow } =
    useNodes((state) => ({
      updateNodeData: state.updateNodeData,
      updateNode: state.updateNode,
      selectNodesByType: state.selectNodesByType,
      deleteNode: state.deleteNode,
      selectedNodes: state.getSelectedNodes(),
      toggleBypass: state.toggleBypass,
      nodes: state.nodes,
      edges: state.edges,
      workflow: state.workflow
    }));
  const run = useWebsocketRunner((state) => state.run);
  const isWorkflowRunning = useWebsocketRunner(
    (state) => state.state === "running"
  );
  const getResult = useResultsStore((state) => state.getResult);
  const hasCommentTitle = Boolean(nodeData?.title?.trim());
  const isBypassed = Boolean(nodeData?.bypassed);

  const handleToggleComment = useCallback(() => {
    if (!nodeId) {
      return;
    }
    updateNodeData(nodeId, { title: hasCommentTitle ? "" : "comment" });
    closeContextMenu();
  }, [closeContextMenu, hasCommentTitle, nodeId, updateNodeData]);

  // Run workflow from the selected node (downstream subgraph)
  const handleRunFromHere = useCallback(() => {
    if (!node || !nodeId || isWorkflowRunning) {
      return;
    }

    // Get the downstream subgraph starting from this node
    const downstream = subgraph(edges, nodes, node as Node<NodeData>);

    // Find incoming edges to the start node that connect from nodes outside the subgraph
    const subgraphNodeIds = new Set(downstream.nodes.map((n) => n.id));
    const incomingEdges = edges.filter(
      (edge) => edge.target === nodeId && !subgraphNodeIds.has(edge.source)
    );

    // Build a map of property values from upstream results
    const propertyOverrides: Record<string, any> = {};
    for (const edge of incomingEdges) {
      const sourceNodeId = edge.source;
      const sourceHandle = edge.sourceHandle; // The output handle name
      const targetHandle = edge.targetHandle; // The property name on the start node

      if (!targetHandle) {
        continue;
      }

      // Get the result from the upstream node
      const result = getResult(workflow.id, sourceNodeId);
      if (result !== undefined) {
        // If the result is an object with multiple outputs, get the specific output
        // Otherwise use the whole result
        const value =
          sourceHandle && typeof result === "object" && result !== null
            ? result[sourceHandle] ?? result
            : result;
        propertyOverrides[targetHandle] = value;
        log.info(`Run from here: Setting property ${targetHandle} from upstream node ${sourceNodeId}`);
      }
    }

    // Update the start node's properties with the upstream results
    const startNode = downstream.nodes.find((n) => n.id === nodeId);
    if (startNode && Object.keys(propertyOverrides).length > 0) {
      // Clone the node and update its properties for the run
      const updatedStartNode = {
        ...startNode,
        data: {
          ...startNode.data,
          properties: {
            ...startNode.data.properties,
            ...propertyOverrides
          }
        }
      };
      // Replace the start node in the subgraph with the updated one
      const subgraphNodesWithUpdates = downstream.nodes.map((n) =>
        n.id === nodeId ? updatedStartNode : n
      );

      log.info("Running downstream subgraph from node", {
        startNodeId: nodeId,
        nodeCount: subgraphNodesWithUpdates.length,
        edgeCount: downstream.edges.length,
        propertyCount: Object.keys(propertyOverrides).length
      });

      run({}, workflow, subgraphNodesWithUpdates, downstream.edges);
    } else {
      log.info("Running downstream subgraph from node", {
        startNodeId: nodeId,
        nodeCount: downstream.nodes.length,
        edgeCount: downstream.edges.length
      });

      run({}, workflow, downstream.nodes, downstream.edges);
    }

    addNotification({
      type: "info",
      alert: false,
      content: `Running workflow from ${metadata?.title || node?.type || "node"}`
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
    metadata,
    closeContextMenu
  ]);

  const handleToggleBypass = useCallback(() => {
    if (!nodeId) {
      return;
    }
    toggleBypass(nodeId);
    closeContextMenu();
  }, [closeContextMenu, nodeId, toggleBypass]);

  //copy metadata to clipboard
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

  const handleFindTemplates = () => {
    const nodeType = node?.type || "";
    // Navigate to templates with the node type as a search parameter
    navigate(`/templates?node=${encodeURIComponent(nodeType)}`);
    closeContextMenu();
  };

  const handleSelectAllSameType = () => {
    if (node?.type) {
      selectNodesByType(node.type);
      closeContextMenu();
    }
  };

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

  const canConvertToInput = nodeId && constantToInputType(node?.type ?? "");
  const canConvertToConstant = nodeId && inputToConstantType(node?.type ?? "");

  const menuItems = [
    node?.parentId && (
      <ContextMenuItem
        key="remove-from-group"
        onClick={() => removeFromGroup([node as Node<NodeData>])}
        label="Remove from Group"
        IconComponent={<GroupRemoveIcon />}
        tooltip="Remove this node from the group"
      />
    ),
    nodeId && (
      <ContextMenuItem
        key="run-from-here"
        onClick={handleRunFromHere}
        label={isWorkflowRunning ? "Running..." : "Run From Here"}
        IconComponent={<PlayArrowIcon />}
        tooltip="Run the workflow from this node onwards, using previous results as inputs"
        addButtonClassName={isWorkflowRunning ? "disabled" : ""}
      />
    ),
    nodeId && (
      <ContextMenuItem
        key="toggle-bypass"
        onClick={handleToggleBypass}
        label={isBypassed ? "Enable Node" : "Bypass Node"}
        IconComponent={isBypassed ? <PlayArrowIcon /> : <BlockIcon />}
        tooltip={
          isBypassed
            ? "Enable this node to process normally"
            : "Bypass this node to pass inputs through to outputs"
        }
      />
    ),
    nodeId && (
      <ContextMenuItem
        key="toggle-comment"
        onClick={handleToggleComment}
        label={hasCommentTitle ? "Remove Comment" : "Add Comment"}
        IconComponent={<EditIcon />}
        tooltip={
          hasCommentTitle
            ? "Remove the comment from this node"
            : "Add a comment to this node"
        }
      />
    ),
    canConvertToInput && (
      <ContextMenuItem
        key="convert-to-input"
        onClick={handleConvertToInput}
        label="Convert to Input Node"
        IconComponent={<SwapHorizIcon />}
        tooltip="Convert this constant node to an input node"
      />
    ),
    canConvertToConstant && (
      <ContextMenuItem
        key="convert-to-constant"
        onClick={handleConvertToConstant}
        label="Convert to Constant Node"
        IconComponent={<SwapHorizIcon />}
        tooltip="Convert this input node to a constant node"
      />
    ),
    <ContextMenuItem
      key="show-templates"
      onClick={handleFindTemplates}
      label="Show Templates"
      IconComponent={<SearchIcon />}
      tooltip="Find Templates using this node"
    />,
    <ContextMenuItem
      key="select-all"
      onClick={handleSelectAllSameType}
      label={`Select all ${metadata?.title || node?.type || ""} nodes`}
      IconComponent={<FilterListIcon />}
      tooltip="Select all nodes of the same type"
    />,
    <ContextMenuItem
      key="delete-node"
      onClick={handleDeleteNode}
      label="Delete Node"
      IconComponent={<DeleteIcon />}
      tooltip="Delete this node"
    />,
    isDevelopment && (
      <React.Fragment key="dev">
        <Divider />
        <ContextMenuItem
          onClick={handleCopyMetadataToClipboard}
          label="Copy NodeData"
          IconComponent={<DataArrayIcon />}
          tooltip="Copy node data to the clipboard"
        />
      </React.Fragment>
    )
  ];

  return (
    <Menu
      className="context-menu node-context-menu"
      open={menuPosition !== null}
      onClose={closeContextMenu}
      onContextMenu={(event) => event.preventDefault()}
      anchorReference="anchorPosition"
      anchorPosition={
        menuPosition ? { top: menuPosition.y, left: menuPosition.x } : undefined
      }
      slotProps={{
        paper: {
          sx: {
            borderRadius: "8px"
          }
        }
      }}
    >
      {menuItems.filter(Boolean)}
    </Menu>
  );
};

export default NodeContextMenu;
