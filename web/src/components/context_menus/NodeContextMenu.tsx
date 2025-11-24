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
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
import { NodeData } from "../../stores/NodeData";
import { useNotificationStore } from "../../stores/NotificationStore";
//utils
import { useClipboard } from "../../hooks/browser/useClipboard";
import log from "loglevel";
import { useRemoveFromGroup } from "../../hooks/nodes/useRemoveFromGroup";
import { isDevelopment } from "../../stores/ApiClient";
//reactflow
import { Node } from "@xyflow/react";
import useMetadataStore from "../../stores/MetadataStore";
import { useNavigate } from "react-router-dom";
import { useNodes } from "../../contexts/NodeContext";

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
  const { updateNodeData, selectNodesByType, deleteNode, selectedNodes } =
    useNodes((state) => ({
      updateNodeData: state.updateNodeData,
      selectNodesByType: state.selectNodesByType,
      deleteNode: state.deleteNode,
      selectedNodes: state.getSelectedNodes()
    }));
  const hasCommentTitle = Boolean(nodeData?.title?.trim());
  const handleToggleComment = useCallback(() => {
    if (!nodeId) {
      return;
    }
    updateNodeData(nodeId, { title: hasCommentTitle ? "" : "comment" });
    closeContextMenu();
  }, [closeContextMenu, hasCommentTitle, nodeId, updateNodeData]);

  //copy metadata to clipboard
  const handleCopyMetadataToClipboard = useCallback(() => {
    if (nodeId && nodeData) {
      const metadataToCopy = {
        NodeData: metadata
      };
      log.info("Copying metadata to clipboard", metadataToCopy);
      addNotification({
        type: "info",
        alert: true,
        content: "Copied NodeData to Clipboard!"
      });
      writeClipboard(JSON.stringify(metadataToCopy), true, true);
      closeContextMenu();
    }
  }, [
    nodeId,
    nodeData,
    metadata,
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
      {node?.parentId && (
        <ContextMenuItem
          onClick={() => removeFromGroup([node as Node<NodeData>])}
          label="Remove from Group"
          IconComponent={<GroupRemoveIcon />}
          tooltip="Remove this node from the group"
        />
      )}
      {nodeId && (
        <ContextMenuItem
          onClick={handleToggleComment}
          label={hasCommentTitle ? "Remove Comment" : "Add Comment"}
          IconComponent={<EditIcon />}
          tooltip={
            hasCommentTitle
              ? "Remove the comment from this node"
              : "Add a comment to this node"
          }
        />
      )}
      <ContextMenuItem
        onClick={handleFindTemplates}
        label="Show Templates"
        IconComponent={<SearchIcon />}
        tooltip="Find Templates using this node"
      />
      <ContextMenuItem
        onClick={handleSelectAllSameType}
        label={`Select all ${metadata?.title || node?.type || ""} nodes`}
        IconComponent={<FilterListIcon />}
        tooltip="Select all nodes of the same type"
      />
      {/* Delete Node */}
      <ContextMenuItem
        onClick={handleDeleteNode}
        label="Delete Node"
        IconComponent={<DeleteIcon />}
        tooltip="Delete this node"
      />
      {isDevelopment && (
        <>
          <Divider />
          <ContextMenuItem
            onClick={handleCopyMetadataToClipboard}
            label="Copy NodeData"
            IconComponent={<DataArrayIcon />}
            tooltip="Copy node metadata to the clipboard"
          />
        </>
      )}
    </Menu>
  );
};

export default NodeContextMenu;
