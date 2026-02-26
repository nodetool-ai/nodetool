import React, { memo, useCallback } from "react";
import { Menu, Divider, ListItemIcon, ListItemText, MenuItem } from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
import { useNodeContextMenu } from "../../hooks/nodes/useNodeContextMenu";
import GroupRemoveIcon from "@mui/icons-material/GroupRemove";
import SearchIcon from "@mui/icons-material/Search";
import EditIcon from "@mui/icons-material/Edit";
import FilterListIcon from "@mui/icons-material/FilterList";
import DeleteIcon from "@mui/icons-material/Delete";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import BlockIcon from "@mui/icons-material/Block";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import DataArrayIcon from "@mui/icons-material/DataArray";
import SyncIcon from "@mui/icons-material/Sync";
import QueueIcon from "@mui/icons-material/Queue";
import SouthIcon from "@mui/icons-material/South";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { isDevelopment } from "../../stores/ApiClient";
import { useRemoveFromGroup } from "../../hooks/nodes/useRemoveFromGroup";
import { useNodes } from "../../contexts/NodeContext";

const NodeContextMenu: React.FC = () => {
  const {
    menuPosition,
    closeContextMenu,
    node,
    handlers,
    conditions
  } = useNodeContextMenu();
  const removeFromGroup = useRemoveFromGroup();
  const updateNodeData = useNodes((state) => state.updateNodeData);

  const syncMode = (node?.data as NodeData | undefined)?.sync_mode || "on_any";

  const handleSelectMode = useCallback((mode: "on_any" | "zip_all") => {
    if (node?.id) {
      updateNodeData(node.id, { sync_mode: mode });
    }
    closeContextMenu();
  }, [node, updateNodeData, closeContextMenu]);

  const handleRemoveFromGroup = useCallback(() => {
    removeFromGroup([node as Node<NodeData>]);
  }, [removeFromGroup, node]);

  const handleSyncModeOnAny = useCallback(() => handleSelectMode("on_any"), [handleSelectMode]);
  const handleSyncModeZipAll = useCallback(() => handleSelectMode("zip_all"), [handleSelectMode]);

  const menuItems = [
    conditions.isInGroup && (
      <ContextMenuItem
        key="remove-from-group"
        onClick={handleRemoveFromGroup}
        label="Remove from Group"
        IconComponent={<GroupRemoveIcon />}
        tooltip="Remove this node from the group"
      />
    ),
    <ContextMenuItem
      key="duplicate"
      onClick={handlers.handleDuplicate}
      label="Duplicate"
      IconComponent={<QueueIcon />}
      tooltip={
        <div className="tooltip-span">
          <div className="tooltip-title">Duplicate</div>
          <div className="tooltip-key">
            <kbd>CTRL</kbd>+<kbd>D</kbd> / <kbd>⌘</kbd>+<kbd>D</kbd>
          </div>
        </div>
      }
    />,
    <ContextMenuItem
      key="duplicate-vertical"
      onClick={handlers.handleDuplicateVertical}
      label="Duplicate Vertical"
      IconComponent={<SouthIcon />}
      tooltip={
        <div className="tooltip-span">
          <div className="tooltip-title">Duplicate Vertical</div>
          <div className="tooltip-key">
            <kbd>CTRL</kbd>+<kbd>SHIFT</kbd>+<kbd>D</kbd> / <kbd>⌘</kbd>+<kbd>SHIFT</kbd>+<kbd>D</kbd>
          </div>
        </div>
      }
    />,
    <ContextMenuItem
      key="run-from-here"
      onClick={handlers.handleRunFromHere}
      label={conditions.isWorkflowRunning ? "Running..." : "Run From Here"}
      IconComponent={<PlayArrowIcon />}
      tooltip="Run the workflow from this node onwards, using previous results as inputs"
      addButtonClassName={conditions.isWorkflowRunning ? "disabled" : ""}
    />,
    <ContextMenuItem
      key="toggle-bypass"
      onClick={handlers.handleToggleBypass}
      label={conditions.isBypassed ? "Enable Node" : "Bypass Node"}
      IconComponent={conditions.isBypassed ? <PowerSettingsNewIcon /> : <BlockIcon />}
      tooltip={
        <div className="tooltip-span">
          <div className="tooltip-title">
            {conditions.isBypassed ? "Enable Node" : "Bypass Node"}
          </div>
          <div className="tooltip-key">
            <kbd>B</kbd>
          </div>
        </div>
      }
    />,
    <ContextMenuItem
      key="toggle-comment"
      onClick={handlers.handleToggleComment}
      label={conditions.hasCommentTitle ? "Remove Comment" : "Add Comment"}
      IconComponent={<EditIcon />}
      tooltip={
        conditions.hasCommentTitle
          ? "Remove the comment from this node"
          : "Add a comment to this node"
      }
    />,
    conditions.canConvertToInput && (
      <ContextMenuItem
        key="convert-to-input"
        onClick={handlers.handleConvertToInput}
        label="Convert to Input Node"
        IconComponent={<SwapHorizIcon />}
        tooltip="Convert this constant node to an input node"
      />
    ),
    conditions.canConvertToConstant && (
      <ContextMenuItem
        key="convert-to-constant"
        onClick={handlers.handleConvertToConstant}
        label="Convert to Constant Node"
        IconComponent={<SwapHorizIcon />}
        tooltip="Convert this input node to a constant node"
      />
    ),
    <ContextMenuItem
      key="show-templates"
      onClick={handlers.handleFindTemplates}
      label="Show Templates"
      IconComponent={<SearchIcon />}
      tooltip="Find Templates using this node"
    />,
    <ContextMenuItem
      key="select-all"
      onClick={handlers.handleSelectAllSameType}
      label={`Select all ${""} nodes`}
      IconComponent={<FilterListIcon />}
      tooltip="Select all nodes of the same type"
    />,
    <MenuItem key="sync-mode" disabled sx={{ py: 0.5, minHeight: "unset" }}>
      <ListItemText
        primary="Sync Mode"
        secondary="How inputs are coordinated"
        primaryTypographyProps={{ fontSize: "0.75rem" }}
        secondaryTypographyProps={{ fontSize: "0.7rem" }}
      />
    </MenuItem>,
    <MenuItem
      key="sync-on-any"
      selected={syncMode === "on_any"}
      onClick={handleSyncModeOnAny}
      sx={{ py: 0.5, minHeight: "unset" }}
    >
      <ListItemIcon>
        <SyncIcon sx={{ fontSize: "1rem" }} />
      </ListItemIcon>
      <ListItemText
        primary="on_any"
        secondary="Run when any input arrives"
        primaryTypographyProps={{ fontSize: "0.75rem" }}
        secondaryTypographyProps={{ fontSize: "0.7rem" }}
      />
    </MenuItem>,
    <MenuItem
      key="sync-zip-all"
      selected={syncMode === "zip_all"}
      onClick={handleSyncModeZipAll}
      sx={{ py: 0.5, minHeight: "unset" }}
    >
      <ListItemIcon>
        <SyncIcon sx={{ fontSize: "1rem", transform: "scaleX(-1)" }} />
      </ListItemIcon>
      <ListItemText
        primary="zip_all"
        secondary="Wait for all inputs; process items together"
        primaryTypographyProps={{ fontSize: "0.75rem" }}
        secondaryTypographyProps={{ fontSize: "0.7rem" }}
      />
    </MenuItem>,
    <Divider key="divider-before-delete" />,
    <ContextMenuItem
      key="delete-node"
      onClick={handlers.handleDeleteNode}
      label="Delete Node"
      IconComponent={<DeleteIcon />}
      tooltip="Delete this node"
    />,
    isDevelopment && <Divider key="dev-divider" />,
    isDevelopment && (
      <ContextMenuItem
        key="copy-nodedata"
        onClick={handlers.handleCopyMetadataToClipboard}
        label="Copy NodeData"
        IconComponent={<DataArrayIcon />}
        tooltip="Copy node data to the clipboard"
      />
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

export default memo(NodeContextMenu);
