import React, { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useReactFlow } from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { useTheme } from "@mui/material/styles";

import {
  Divider,
  ToolbarIconButton,
  EditorMenu,
  MenuItemPrimitive,
  CONTROL,
  FloatingToolbar
} from "../ui_primitives";
import CopyAllIcon from "@mui/icons-material/CopyAll";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import GroupRemoveIcon from "@mui/icons-material/GroupRemove";
import SearchIcon from "@mui/icons-material/Search";
import FilterListIcon from "@mui/icons-material/FilterList";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import DataArrayIcon from "@mui/icons-material/DataArray";
import EditIcon from "@mui/icons-material/EditOutlined";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";

import { useDuplicateNodes } from "../../hooks/useDuplicate";
import { useNodes } from "../../contexts/NodeContext";
import { getShortcutTooltip } from "../../config/shortcuts";
import { useNodeContextMenu } from "../../hooks/nodes/useNodeContextMenu";
import { isMac } from "../../utils/platform";
import { useRemoveFromGroup } from "../../hooks/nodes/useRemoveFromGroup";
import { useRunFromHere } from "../../hooks/nodes/useRunFromHere";
import { useChatAboutNodes } from "../../hooks/nodes/useChatAboutNodes";
import { openPageTab } from "../workspace/openPageTab";

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
  const { t } = useTranslation();
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

  // Read the node from the store: `getNode` subscribes to nothing, so the
  // toolbar would show bypass, comment and group state from one edit earlier.
  const node = useNodes((state) =>
    nodeId !== null ? state.findNode(nodeId) ?? null : null
  );
  const nodeData = node?.data;
  const duplicateNodes = useDuplicateNodes();
  const removeFromGroup = useRemoveFromGroup();
  const { handlers, conditions } = useNodeContextMenu();
  const { runFromHere, isWorkflowRunning } = useRunFromHere(node);

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
      removeFromGroup([node]);
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

  const chatAboutNodes = useChatAboutNodes();
  const handleChatAboutNode = useCallback(() => {
    if (nodeId !== null) {
      void chatAboutNodes([nodeId]);
    }
  }, [nodeId, chatAboutNodes]);

  const handleOpenDropdown = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleCloseDropdown = useCallback(() => {
    setAnchorEl(null);
  }, []);

  if (!nodeId) { return null; }

  return (
    <>
      <FloatingToolbar className="node-toolbar" sx={{ marginBottom: 2 }}>
        <ToolbarIconButton
          title={isWorkflowRunning ? t("screen_editor.nodeTools.running") : t("screen_editor.nodeTools.runNode")}
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
              {isBypassed ? t("screen_editor.nodeTools.enableNode") : t("screen_editor.nodeTools.disableNode")}{" "}
              {getShortcutTooltip("bypassNode", undefined, "combo")}
            </>
          }
          ariaLabel={isBypassed ? t("screen_editor.nodeTools.enableNode") : t("screen_editor.nodeTools.disableNode")}
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
              {t("screen_editor.nodeTools.duplicate")} {getShortcutTooltip("duplicate", undefined, "combo")}
            </>
          }
          ariaLabel={t("screen_editor.nodeTools.duplicate")}
          className="nodrag"
          onClick={handleDuplicateNodes}
          tabIndex={-1}
          size="small"
          sx={BUTTON_BOX}
        >
          <CopyAllIcon sx={ICON_SX} />
        </ToolbarIconButton>

        <ToolbarIconButton
          title={t("screen_editor.nodeChat.chatAboutNode")}
          ariaLabel={t("screen_editor.nodeChat.chatAboutNode")}
          className="nodrag"
          onClick={handleChatAboutNode}
          tabIndex={-1}
          size="small"
          sx={BUTTON_BOX}
        >
          <ForumOutlinedIcon sx={ICON_SX} />
        </ToolbarIconButton>

        <ToolbarIconButton
          title={t("screen_editor.nodeTools.moreActions")}
          className="nodrag"
          onClick={handleOpenDropdown}
          tabIndex={-1}
          active={dropdownOpen}
          size="small"
          sx={BUTTON_BOX}
        >
          <MoreVertIcon sx={ICON_SX} />
        </ToolbarIconButton>
      </FloatingToolbar>

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
        paperSx={{ minWidth: 200 }}
      >
        {isInGroup && (
          <MenuItemPrimitive
            label={t("screen_editor.nodeTools.removeFromGroup")}
            icon={<GroupRemoveIcon />}
            onClick={handleRemoveFromGroup}
          />
        )}

        {conditions.canConvertToInput && (
          <MenuItemPrimitive
            label={t("screen_editor.nodeTools.convertToInput")}
            icon={<SwapHorizIcon />}
            onClick={handlers.handleConvertToInput}
          />
        )}

        {conditions.canConvertToConstant && (
          <MenuItemPrimitive
            label={t("screen_editor.nodeTools.convertToConstant")}
            icon={<SwapHorizIcon />}
            onClick={handlers.handleConvertToConstant}
          />
        )}

        <MenuItemPrimitive
          label={hasCommentTitle ? t("screen_editor.nodeTools.deleteComment") : t("screen_editor.nodeTools.addComment")}
          icon={<EditIcon />}
          onClick={handleToggleComment}
        />

        <MenuItemPrimitive
          label={t("screen_editor.nodeTools.showTemplates")}
          icon={<SearchIcon />}
          onClick={handleFindTemplates}
        />

        <MenuItemPrimitive
          label={t("screen_editor.nodeTools.selectAllSameType")}
          icon={<FilterListIcon />}
          onClick={handleSelectAllSameType}
        />

        <MenuItemPrimitive
          label={t("screen_editor.nodeTools.copyNodeAsJson")}
          icon={<DataArrayIcon />}
          onClick={handlers.handleCopyMetadataToClipboard}
        />

        <MenuItemPrimitive
          label={t("screen_editor.nodeTools.delete")}
          icon={<DeleteIcon />}
          shortcut={isMac() ? "⌫" : "Del"}
          color="error"
          dividerBefore
          onClick={handleDelete}
        />
      </EditorMenu>
    </>
  );
};

export default memo(NodeToolButtons);
