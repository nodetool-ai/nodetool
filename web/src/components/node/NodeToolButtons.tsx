import React, { memo, useCallback, useState } from "react";
import { useReactFlow, Node } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { useTheme } from "@mui/material/styles";

import {
  Divider,
  ToolbarIconButton,
  EditorMenu,
  EditorMenuItem,
  BORDER_RADIUS,
  CONTROL,
  SHADOW,
  Toolbar,
  ListItemIcon,
  ListItemText
} from "../ui_primitives";
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
import { useNodes } from "../../contexts/NodeContext";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { getShortcutTooltip } from "../../config/shortcuts";
import { useNodeContextMenu } from "../../hooks/nodes/useNodeContextMenu";
import { useRemoveFromGroup } from "../../hooks/nodes/useRemoveFromGroup";
import { useRunFromHere } from "../../hooks/nodes/useRunFromHere";
import { openPageTab } from "../workspace/openPageTab";
import { NodeData } from "../../stores/NodeData";

interface NodeToolbarProps {
  nodeId: string | null;
}

const BUTTON_BOX = {
  width: CONTROL.height.sm,
  height: CONTROL.height.sm,
  borderRadius: CONTROL.radius
} as const;
const ICON_SX = { fontSize: 18 } as const;

const NodeToolButtons: React.FC<NodeToolbarProps> = ({ nodeId }) => {
  const theme = useTheme();
  const { getNode } = useReactFlow();
  const { deleteNode, updateNodeData, selectNodesByType, toggleBypass } = useNodes(
    (state) => ({
      deleteNode: state.deleteNode,
      updateNodeData: state.updateNodeData,
      selectNodesByType: state.selectNodesByType,
      toggleBypass: state.toggleBypass
    }),
    shallow
  );

  const node = nodeId !== null ? getNode(nodeId) : null;
  const nodeData = node?.data as NodeData | undefined;
  const duplicateNodes = useDuplicateNodes();
  const removeFromGroup = useRemoveFromGroup();
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
    if (node?.type) {
      openPageTab("examples");
    }
  }, [node?.type]);

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
        disableGutters
        sx={{
          minHeight: 0,
          gap: 0.5,
          padding: 0.5,
          backgroundColor: theme.vars.palette.grey[900],
          border: `1px solid ${theme.vars.palette.divider}`,
          borderRadius: BORDER_RADIUS.lg,
          boxShadow: SHADOW(theme).md,
          marginBottom: 2
        }}
      >
        <ToolbarIconButton
          title={isWorkflowRunning ? "Running..." : "Run Node"}
          delay={TOOLTIP_ENTER_DELAY}
          className="nodrag"
          onClick={runFromHere}
          tabIndex={-1}
          disabled={isWorkflowRunning}
          size="small"
          sx={{
            ...BUTTON_BOX,
            backgroundColor: theme.vars.palette.primary.main,
            color: theme.vars.palette.primary.contrastText,
            "&:hover": {
              backgroundColor: theme.vars.palette.primary.light,
              color: theme.vars.palette.primary.contrastText
            },
            "&.Mui-disabled": {
              backgroundColor: theme.vars.palette.grey[800],
              color: theme.vars.palette.grey[500]
            }
          }}
        >
          <PlayArrowIcon sx={ICON_SX} />
        </ToolbarIconButton>

        <Divider
          orientation="vertical"
          flexItem
          sx={{ marginX: 0.5, marginY: 0.5 }}
        />

        <ToolbarIconButton
          title={
            <>
              {isBypassed ? "Enable Node" : "Disable Node"}{" "}
              {getShortcutTooltip("bypassNode", undefined, "combo")}
            </>
          }
          ariaLabel={isBypassed ? "Enable Node" : "Disable Node"}
          delay={TOOLTIP_ENTER_DELAY}
          className="nodrag"
          onClick={handleToggleBypass}
          tabIndex={-1}
          active={isBypassed}
          size="small"
          sx={{
            ...BUTTON_BOX,
            ...(isBypassed && { color: theme.vars.palette.warning.main })
          }}
        >
          <PowerSettingsNewIcon sx={ICON_SX} />
        </ToolbarIconButton>

        <ToolbarIconButton
          title={
            <>
              Duplicate {getShortcutTooltip("duplicate", undefined, "combo")}
            </>
          }
          ariaLabel="Duplicate"
          delay={TOOLTIP_ENTER_DELAY}
          className="nodrag"
          onClick={handleDuplicateNodes}
          tabIndex={-1}
          size="small"
          sx={BUTTON_BOX}
        >
          <CopyAllIcon sx={ICON_SX} />
        </ToolbarIconButton>

        <ToolbarIconButton
          title="More Actions"
          delay={TOOLTIP_ENTER_DELAY}
          className="nodrag"
          onClick={handleOpenDropdown}
          tabIndex={-1}
          active={dropdownOpen}
          size="small"
          sx={BUTTON_BOX}
        >
          <MoreVertIcon sx={ICON_SX} />
        </ToolbarIconButton>
      </Toolbar>

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

        <EditorMenuItem onClick={handlers.handleCopyMetadataToClipboard}>
          <ListItemIcon>
            <DataArrayIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Copy Node as JSON</ListItemText>
        </EditorMenuItem>

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
