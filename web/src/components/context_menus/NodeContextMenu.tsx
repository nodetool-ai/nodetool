import React, { useState } from "react";
import {
  Menu,
  Divider,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Box,
  Popover
} from "@mui/material";
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
import DataArrayIcon from "@mui/icons-material/DataArray";
import SyncIcon from "@mui/icons-material/Sync";
import PaletteIcon from "@mui/icons-material/Palette";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { isDevelopment } from "../../stores/ApiClient";
import { useRemoveFromGroup } from "../../hooks/nodes/useRemoveFromGroup";
import { useNodes } from "../../contexts/NodeContext";
import { NODE_COLOR_OPTIONS, getNodeColorLabel } from "../../config/nodeColors";

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

  const [colorMenuAnchor, setColorMenuAnchor] = useState<HTMLElement | null>(null);

  const nodeData = node?.data as NodeData | undefined;
  const currentColor = nodeData?.color;
  const currentColorLabel = getNodeColorLabel(currentColor);
  const syncMode = nodeData?.sync_mode || "on_any";

  const handleSelectMode = (mode: "on_any" | "zip_all") => {
    if (node?.id) {
      updateNodeData(node.id, { sync_mode: mode });
    }
    closeContextMenu();
  };

  const handleSelectColor = (color: string | undefined) => {
    if (node?.id) {
      updateNodeData(node.id, { color });
    }
    setColorMenuAnchor(null);
    closeContextMenu();
  };

  const openColorMenu = (event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      event.stopPropagation();
      setColorMenuAnchor(event.currentTarget);
    } else {
      setColorMenuAnchor(null);
    }
  };

  const closeColorMenu = () => {
    setColorMenuAnchor(null);
  };

  const menuItems = [
    conditions.isInGroup && (
      <ContextMenuItem
        key="remove-from-group"
        onClick={() => removeFromGroup([node as Node<NodeData>])}
        label="Remove from Group"
        IconComponent={<GroupRemoveIcon />}
        tooltip="Remove this node from the group"
      />
    ),
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
      IconComponent={conditions.isBypassed ? <PlayArrowIcon /> : <BlockIcon />}
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
      onClick={() => handleSelectMode("on_any")}
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
      onClick={() => handleSelectMode("zip_all")}
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
    <ContextMenuItem
      key="node-color"
      onClick={openColorMenu}
      label="Node Color"
      IconComponent={<PaletteIcon />}
      tooltip="Set a color label for this node"
      submenu
    />,
    <Divider key="divider-before-delete" />,
    <ContextMenuItem
      key="delete-node"
      onClick={handlers.handleDeleteNode}
      label="Delete Node"
      IconComponent={<DeleteIcon />}
      tooltip="Delete this node"
    />,
    isDevelopment && (
      <React.Fragment key="dev">
        <Divider />
        <ContextMenuItem
          onClick={handlers.handleCopyMetadataToClipboard}
          label="Copy NodeData"
          IconComponent={<DataArrayIcon />}
          tooltip="Copy node data to the clipboard"
        />
      </React.Fragment>
    )
  ];

  return (
    <>
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
      <Popover
        open={Boolean(colorMenuAnchor)}
        anchorEl={colorMenuAnchor}
        onClose={closeColorMenu}
        anchorOrigin={{
          vertical: "top",
          horizontal: "right"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left"
        }}
        slotProps={{
          paper: {
            sx: {
              borderRadius: "8px",
              p: 1,
              minWidth: "180px"
            }
          }
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          <ListItemText
            primary="Node Color"
            primaryTypographyProps={{ fontSize: "0.75rem", fontWeight: 600 }}
            sx={{ px: 1, pt: 0.5 }}
          />
          {NODE_COLOR_OPTIONS.map((colorOption) => (
            <MenuItem
              key={colorOption.key}
              selected={colorOption.key === currentColorLabel}
              onClick={() => handleSelectColor(colorOption.value)}
              sx={{
                py: 0.5,
                minHeight: "unset",
                display: "flex",
                gap: 1
              }}
            >
              <Box
                sx={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "4px",
                  backgroundColor: colorOption.value || "transparent",
                  border: colorOption.value ? "none" : "1px solid",
                  borderColor: "divider",
                  flexShrink: 0
                }}
              />
              <ListItemText
                primary={colorOption.label}
                secondary={colorOption.description}
                primaryTypographyProps={{ fontSize: "0.8rem" }}
                secondaryTypographyProps={{ fontSize: "0.65rem" }}
              />
            </MenuItem>
          ))}
        </Box>
      </Popover>
    </>
  );
};

export default NodeContextMenu;
