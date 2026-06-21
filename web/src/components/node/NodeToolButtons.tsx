import React, { memo, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useReactFlow, Node } from "@xyflow/react";
import {
  Toolbar,
  ListItemIcon,
  ListItemText
} from "@mui/material";
import { Divider, ToolbarIconButton, EditorMenu, EditorMenuItem, BORDER_RADIUS } from "../ui_primitives";
import CopyAllIcon from "@mui/icons-material/CopyAll";
import DeleteIcon from "@mui/icons-material/Delete";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import GroupRemoveIcon from "@mui/icons-material/GroupRemove";
import SearchIcon from "@mui/icons-material/Search";
import FilterListIcon from "@mui/icons-material/FilterList";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import DataArrayIcon from "@mui/icons-material/DataArray";
import EditIcon from "@mui/icons-material/Edit";

import { useDuplicateNodes } from "../../hooks/useDuplicate";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { getMousePosition } from "../../utils/MousePosition";
import { useNodes } from "../../contexts/NodeContext";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { getShortcutTooltip } from "../../config/shortcuts";
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
  const { handlers, conditions } = useNodeContextMenu();
  const { runFromHere, isWorkflowRunning } = useRunFromHere(node as Node<NodeData> | null);

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const dropdownOpen = Boolean(anchorEl);

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

  const handleOpenDropdown = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleCloseDropdown = useCallback(() => {
    setAnchorEl(null);
  }, []);

  if (!nodeId) { return null; }

  return (
    <>
      <Toolbar
        variant="dense"
        className="node-toolbar"
        sx={{ backgroundColor: "transparent", gap: 0.5 }}
      >
        {/* Primary Actions - Always Visible */}
        <ToolbarIconButton
          title={isWorkflowRunning ? "Running..." : "Run Node"}
          delay={TOOLTIP_ENTER_DELAY}
          className="nodrag"
          onClick={runFromHere}
          tabIndex={-1}
          disabled={isWorkflowRunning}
          size="small"
          variant="primary"
        >
          <PlayArrowIcon sx={{ fontSize: 28 }} />
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
      <EditorMenu
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
        paperSx={{
          borderRadius: BORDER_RADIUS.lg,
          minWidth: 200
        }}
      >
        {isInGroup && (
          <EditorMenuItem onClick={handleRemoveFromGroup}>
            <ListItemIcon>
              <GroupRemoveIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Remove from Group</ListItemText>
          </EditorMenuItem>
        )}

        {conditions.canConvertToInput && (
          <EditorMenuItem onClick={handlers.handleConvertToInput}>
            <ListItemIcon>
              <SwapHorizIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Convert to Input</ListItemText>
          </EditorMenuItem>
        )}

        {conditions.canConvertToConstant && (
          <EditorMenuItem onClick={handlers.handleConvertToConstant}>
            <ListItemIcon>
              <SwapHorizIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Convert to Constant</ListItemText>
          </EditorMenuItem>
        )}

        <EditorMenuItem onClick={handleToggleComment}>
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>
            {hasCommentTitle ? "Remove Comment" : "Add Comment"}
          </ListItemText>
        </EditorMenuItem>

        <EditorMenuItem onClick={handleFindTemplates}>
          <ListItemIcon>
            <SearchIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Show Templates</ListItemText>
        </EditorMenuItem>

        <EditorMenuItem onClick={handleSelectAllSameType}>
          <ListItemIcon>
            <FilterListIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Select All Same Type</ListItemText>
        </EditorMenuItem>

        {isDevelopment && [
          <Divider key="dev-divider" />,
          <EditorMenuItem key="dev-copy-metadata" onClick={handlers.handleCopyMetadataToClipboard}>
            <ListItemIcon>
              <DataArrayIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Copy NodeData</ListItemText>
          </EditorMenuItem>
        ]}

        <Divider />

        <EditorMenuItem onClick={handleDelete} sx={{ color: "error.main" }}>
          <ListItemIcon sx={{ color: "error.main" }}>
            <DeleteIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>
            Delete {getShortcutTooltip("deleteSelected", undefined, "combo")}
          </ListItemText>
        </EditorMenuItem>
      </EditorMenu>
    </>
  );
};

export default memo(NodeToolButtons);
