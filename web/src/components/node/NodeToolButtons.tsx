import React, { useCallback, useState } from "react";
import { useReactFlow, Node } from "@xyflow/react";
import {
  Toolbar,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider
} from "@mui/material";
import CopyAllIcon from "@mui/icons-material/CopyAll";
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";
import InfoIcon from "@mui/icons-material/Info";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import BlockIcon from "@mui/icons-material/Block";
import EditIcon from "@mui/icons-material/Edit";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import GroupRemoveIcon from "@mui/icons-material/GroupRemove";
import SearchIcon from "@mui/icons-material/Search";
import FilterListIcon from "@mui/icons-material/FilterList";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import SyncIcon from "@mui/icons-material/Sync";
import DataArrayIcon from "@mui/icons-material/DataArray";

import { useDuplicateNodes } from "../../hooks/useDuplicate";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { getMousePosition } from "../../utils/MousePosition";
import { useNodes } from "../../contexts/NodeContext";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { getShortcutTooltip } from "../../config/shortcuts";
import { useInspectedNodeStore } from "../../stores/InspectedNodeStore";
import { useNodeContextMenu } from "../../hooks/nodes/useNodeContextMenu";
import { useRemoveFromGroup } from "../../hooks/nodes/useRemoveFromGroup";
import { NodeData } from "../../stores/NodeData";
import { isDevelopment } from "../../stores/ApiClient";

interface NodeToolbarProps {
  nodeId: string | null;
}

const NodeToolButtons: React.FC<NodeToolbarProps> = ({ nodeId }) => {
  const { getNode } = useReactFlow();
  const deleteNode = useNodes((state) => state.deleteNode);
  const updateNodeData = useNodes((state) => state.updateNodeData);
  const selectNodesByType = useNodes((state) => state.selectNodesByType);
  const toggleBypass = useNodes((state) => state.toggleBypass);

  const node = nodeId !== null ? getNode(nodeId) : null;
  const nodeData = node?.data as NodeData | undefined;
  const duplicateNodes = useDuplicateNodes();
  const removeFromGroup = useRemoveFromGroup();
  const openDocumentation = useNodeMenuStore(
    (state) => state.openDocumentation
  );
  const inspectedNodeId = useInspectedNodeStore((state) => state.inspectedNodeId);
  const toggleInspectedNode = useInspectedNodeStore((state) => state.toggleInspectedNode);

  const { handlers, conditions } = useNodeContextMenu();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const dropdownOpen = Boolean(anchorEl);

  const syncMode = nodeData?.sync_mode || "on_any";
  const isBypassed = Boolean(nodeData?.bypassed);
  const isInGroup = Boolean(node?.parentId);

  const handleDelete = useCallback(() => {
    if (nodeId !== null) {
      deleteNode(nodeId);
    }
  }, [deleteNode, nodeId]);

  const handleDuplicateNodes = useCallback(() => {
    if (nodeId !== null && getNode(nodeId)) {
      duplicateNodes();
    }
  }, [nodeId, getNode, duplicateNodes]);

  const _handleOpenDocumentation = useCallback(() => {
    const mousePosition = getMousePosition();
    openDocumentation(node?.type || "", {
      x: mousePosition.x,
      y: mousePosition.y
    });
  }, [node?.type, openDocumentation]);

  const handleToggleInfo = useCallback(() => {
    if (nodeId !== null) {
      toggleInspectedNode(nodeId);
    }
  }, [nodeId, toggleInspectedNode]);

  const handleToggleBypass = useCallback(() => {
    if (nodeId !== null) {
      toggleBypass(nodeId);
    }
  }, [nodeId, toggleBypass]);

  const handleRemoveFromGroup = useCallback(() => {
    if (node) {
      removeFromGroup([node as Node<NodeData>]);
    }
  }, [node, removeFromGroup]);

  const handleSelectAllSameType = useCallback(() => {
    if (node?.type) {
      selectNodesByType(node.type);
    }
  }, [node?.type, selectNodesByType]);

  const handleSelectSyncMode = useCallback((mode: "on_any" | "zip_all") => {
    if (nodeId !== null) {
      updateNodeData(nodeId, { sync_mode: mode });
    }
    setAnchorEl(null);
  }, [nodeId, updateNodeData]);

  const handleOpenDropdown = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleCloseDropdown = useCallback(() => {
    setAnchorEl(null);
  }, []);

  if (!nodeId) { return null; }

  const isInspected = inspectedNodeId === nodeId;

  return (
    <>
      <Toolbar
        variant="dense"
        className="node-toolbar"
        sx={{ backgroundColor: "transparent", gap: 0.5 }}
      >
        {/* Primary Actions - Always Visible */}
        <Tooltip
          title={
            <span>
              {conditions.isWorkflowRunning ? "Running..." : "Run From Here"}
            </span>
          }
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <IconButton
            className="nodrag"
            onClick={handlers.handleRunFromHere}
            tabIndex={-1}
            disabled={conditions.isWorkflowRunning}
            size="small"
          >
            <PlayArrowIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip
          title={
            <span>
              {isBypassed ? "Enable Node" : "Bypass Node"}{" "}
              <span className="shortcut">B</span>
            </span>
          }
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <IconButton
            className="nodrag"
            onClick={handleToggleBypass}
            tabIndex={-1}
            color={isBypassed ? "warning" : "default"}
            size="small"
          >
            {isBypassed ? <PlayArrowIcon fontSize="small" /> : <BlockIcon fontSize="small" />}
          </IconButton>
        </Tooltip>

        <Tooltip
          title={
            <span>
              {conditions.hasComment ? "Remove Comment" : "Add Comment"}
            </span>
          }
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <IconButton
            className="nodrag"
            onClick={handlers.handleToggleComment}
            tabIndex={-1}
            color={conditions.hasComment ? "primary" : "default"}
            size="small"
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip
          title={
            <span>
              Duplicate{" "}
              <span className="shortcut">{getShortcutTooltip("duplicate")}</span>
            </span>
          }
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <IconButton
            className="nodrag"
            onClick={handleDuplicateNodes}
            tabIndex={-1}
            size="small"
          >
            <CopyAllIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip
          title={
            <span>
              Delete{" "}
              <span className="shortcut">{getShortcutTooltip("delete")}</span>
            </span>
          }
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <IconButton
            className="nodrag"
            onClick={handleDelete}
            tabIndex={-1}
            size="small"
          >
            <RemoveCircleIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip
          title={<span>Info</span>}
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <IconButton
            className="nodrag"
            onClick={handleToggleInfo}
            tabIndex={-1}
            color={isInspected ? "primary" : "default"}
            size="small"
          >
            <InfoIcon fontSize="small" />
          </IconButton>
        </Tooltip>


        {/* More Actions Dropdown */}
        <Tooltip
          title={<span>More Actions</span>}
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <IconButton
            className="nodrag"
            onClick={handleOpenDropdown}
            tabIndex={-1}
            size="small"
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Toolbar>

      {/* Dropdown Menu for Secondary Actions */}
      <Menu
        anchorEl={anchorEl}
        open={dropdownOpen}
        onClose={handleCloseDropdown}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        slotProps={{
          paper: {
            sx: {
              borderRadius: "8px",
              minWidth: 200
            }
          }
        }}
      >
        {isInGroup && (
          <MenuItem onClick={handleRemoveFromGroup}>
            <ListItemIcon>
              <GroupRemoveIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Remove from Group</ListItemText>
          </MenuItem>
        )}

        {conditions.canConvertToInput && (
          <MenuItem onClick={handlers.handleConvertToInput}>
            <ListItemIcon>
              <SwapHorizIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Convert to Input</ListItemText>
          </MenuItem>
        )}

        {conditions.canConvertToConstant && (
          <MenuItem onClick={handlers.handleConvertToConstant}>
            <ListItemIcon>
              <SwapHorizIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Convert to Constant</ListItemText>
          </MenuItem>
        )}

        <MenuItem onClick={handlers.handleFindTemplates}>
          <ListItemIcon>
            <SearchIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Show Templates</ListItemText>
        </MenuItem>

        <MenuItem onClick={handleSelectAllSameType}>
          <ListItemIcon>
            <FilterListIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Select All Same Type</ListItemText>
        </MenuItem>

        <Divider />

        <MenuItem disabled sx={{ py: 0.5, minHeight: "unset" }}>
          <ListItemText
            primary="Sync Mode"
            secondary="How inputs are coordinated"
            primaryTypographyProps={{ fontSize: "0.75rem", fontWeight: 600 }}
            secondaryTypographyProps={{ fontSize: "0.7rem" }}
          />
        </MenuItem>

        <MenuItem
          selected={syncMode === "on_any"}
          onClick={() => handleSelectSyncMode("on_any")}
          sx={{ py: 0.5, minHeight: "unset", pl: 3 }}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            <SyncIcon sx={{ fontSize: "1rem" }} />
          </ListItemIcon>
          <ListItemText
            primary="on_any"
            secondary="Run when any input arrives"
            primaryTypographyProps={{ fontSize: "0.75rem" }}
            secondaryTypographyProps={{ fontSize: "0.7rem" }}
          />
        </MenuItem>

        <MenuItem
          selected={syncMode === "zip_all"}
          onClick={() => handleSelectSyncMode("zip_all")}
          sx={{ py: 0.5, minHeight: "unset", pl: 3 }}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            <SyncIcon sx={{ fontSize: "1rem", transform: "scaleX(-1)" }} />
          </ListItemIcon>
          <ListItemText
            primary="zip_all"
            secondary="Wait for all inputs; process items together"
            primaryTypographyProps={{ fontSize: "0.75rem" }}
            secondaryTypographyProps={{ fontSize: "0.7rem" }}
          />
        </MenuItem>

        {isDevelopment && (
          <>
            <Divider />
            <MenuItem onClick={handlers.handleCopyMetadataToClipboard}>
              <ListItemIcon>
                <DataArrayIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Copy NodeData</ListItemText>
            </MenuItem>
          </>
        )}
      </Menu>
    </>
  );
};

export default NodeToolButtons;
