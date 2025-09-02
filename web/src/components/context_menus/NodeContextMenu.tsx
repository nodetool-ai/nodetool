import React, { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
//mui
import { Menu } from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
//icons
import DataArrayIcon from "@mui/icons-material/DataArray";
import GroupRemoveIcon from "@mui/icons-material/GroupRemove";
import SearchIcon from "@mui/icons-material/Search";
import EditIcon from "@mui/icons-material/Edit";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
import { NodeData } from "../../stores/NodeData";
import { useNotificationStore } from "../../stores/NotificationStore";
//utils
import { useClipboard } from "../../hooks/browser/useClipboard";
import log from "loglevel";
import { useRemoveFromGroup } from "../../hooks/nodes/useRemoveFromGroup";
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
  const { updateNodeData } = useNodes((state) => ({
    updateNodeData: state.updateNodeData
  }));

  const currentSyncMode = (nodeData?.sync_mode as string) || "on_any";

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

  const handleFindExamples = () => {
    const nodeType = node?.type || "";
    // Navigate to examples with the node type as a search parameter
    navigate(`/examples?node=${encodeURIComponent(nodeType)}`);
    closeContextMenu();
  };

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
      <ContextMenuItem
        onClick={() => {
          if (nodeId) {
            updateNodeData(nodeId, {
              title: "Click to edit"
            });
          }
        }}
        label="Edit Comment"
        IconComponent={<EditIcon />}
        tooltip="Edit this comment"
      />
      <ContextMenuItem
        onClick={handleFindExamples}
        label="Show Examples"
        IconComponent={<SearchIcon />}
        tooltip="Find Examples using this node"
      />
      {/* Sync mode selection moved to header icon menu */}
      <ContextMenuItem
        onClick={handleCopyMetadataToClipboard}
        label="Copy NodeData"
        IconComponent={<DataArrayIcon />}
        tooltip="Copy node metadata to the clipboard"
      />
    </Menu>
  );
};

export default NodeContextMenu;
