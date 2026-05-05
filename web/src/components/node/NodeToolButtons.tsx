import React, { memo, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useReactFlow, Node } from "@xyflow/react";
import {
  Toolbar,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText
} from "@mui/material";
import { Divider, ToolbarIconButton } from "../ui_primitives";
import CopyAllIcon from "@mui/icons-material/CopyAll";
import { DeleteButton } from "../ui_primitives";
import InfoIcon from "@mui/icons-material/Info";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import { EditButton } from "../ui_primitives";
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
import { useRunFromHere } from "../../hooks/nodes/useRunFromHere";
import { NodeData } from "../../stores/NodeData";
import { isDevelopment } from "../../lib/env";

interface NodeToolbarProps {
  nodeId: string | null;
}

const NodeToolButtons: React.FC<NodeToolbarProps> = ({ nodeId }) => {
  const { getNode } = useReactFlow();
  const navigate = useNavigate();
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
  const { runFromHere, isWorkflowRunning } = useRunFromHere(node as Node<NodeData> | null);

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const dropdownOpen = Boolean(anchorEl);

  const syncMode = nodeData?.sync_mode || "on_any";
  const hasCommentTitle = Boolean(nodeData?.title?.trim());
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

  const handleToggleComment = useCallback(() => {
    if (nodeId !== null) {
      updateNodeData(nodeId, { title: hasCommentTitle ? "" : "comment" });
    }
  }, [nodeId, hasCommentTitle, updateNodeData]);

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

  // Use local node from props, not from context menu store
  const handleFindTemplates = useCallback(() => {
    const nodeType = node?.type || "";
    if (nodeType) {
      navigate(`/templates?node=${encodeURIComponent(nodeType)}`);
    }
  }, [navigate, node?.type]);

  const handleSelectSyncMode = useCallback((mode: "on_any" | "zip_all") => {
    if (nodeId !== null) {
      updateNodeData(nodeId, { sync_mode: mode });
    }
    setAnchorEl(null);
  }, [nodeId, updateNodeData]);

  const handleSelectOnAny = useCallback(() => {
    handleSelectSyncMode("on_any");
  }, [handleSelectSyncMode]);

  const handleSelectZipAll = useCallback(() => {
    handleSelectSyncMode("zip_all");
  }, [handleSelectSyncMode]);

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
        <ToolbarIconButton
          title={isWorkflowRunning ? "Running..." : "Run From Here"}
          delay={TOOLTIP_ENTER_DELAY}
          className="nodrag"
          onClick={runFromHere}
          tabIndex={-1}
          disabled={isWorkflowRunning}
          size="small"
        >
          <PlayArrowIcon fontSize="small" />
        </ToolbarIconButton>

        <ToolbarIconButton
          title={`${isBypassed ? "Enable Node" : "Bypass Node"} ${getShortcutTooltip("bypassNode", undefined, "combo")}`}
          delay={TOOLTIP_ENTER_DELAY}
          className="nodrag"
          onClick={handleToggleBypass}
          tabIndex={-1}
          color={isBypassed ? "warning" : "default"}
          size="small"
        >
          <PowerSettingsNewIcon fontSize="small" />
        </ToolbarIconButton>

        <EditButton
          onClick={handleToggleComment}
          tooltip={hasCommentTitle ? "Remove Comment" : "Add Comment"}
          tabIndex={-1}
          sx={hasCommentTitle ? { color: "primary.main" } : undefined}
        />

        <ToolbarIconButton
          title={`Duplicate ${getShortcutTooltip("duplicate", undefined, "combo")}`}
          delay={TOOLTIP_ENTER_DELAY}
          className="nodrag"
          onClick={handleDuplicateNodes}
          tabIndex={-1}
          size="small"
        >
          <CopyAllIcon fontSize="small" />
        </ToolbarIconButton>

        <DeleteButton
          onClick={handleDelete}
          tabIndex={-1}
          tooltip={
            <span>
              Delete{" "}
              {getShortcutTooltip("deleteSelected", undefined, "combo")}
            </span>
          }
        />

        <ToolbarIconButton
          title="Info"
          delay={TOOLTIP_ENTER_DELAY}
          className="nodrag"
          onClick={handleToggleInfo}
          tabIndex={-1}
          color={isInspected ? "primary" : "default"}
          size="small"
        >
          <InfoIcon fontSize="small" />
        </ToolbarIconButton>


        {/* More Actions Dropdown */}
        <ToolbarIconButton
          title="More Actions"
          delay={TOOLTIP_ENTER_DELAY}
          className="nodrag"
          onClick={handleOpenDropdown}
          tabIndex={-1}
          size="small"
        >
          <MoreVertIcon fontSize="small" />
        </ToolbarIconButton>
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
              borderRadius: "var(--rounded-lg)",
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

        <MenuItem onClick={handleFindTemplates}>
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
          onClick={handleSelectOnAny}
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
          onClick={handleSelectZipAll}
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

        {isDevelopment && [
          <Divider key="dev-divider" />,
          <MenuItem key="dev-copy-metadata" onClick={handlers.handleCopyMetadataToClipboard}>
            <ListItemIcon>
              <DataArrayIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Copy NodeData</ListItemText>
          </MenuItem>
        ]}
      </Menu>
    </>
  );
};

export default memo(NodeToolButtons);
