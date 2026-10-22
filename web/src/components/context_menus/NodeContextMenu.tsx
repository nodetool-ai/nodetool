import React, { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Divider, ContextMenu } from "../ui_primitives";
import ContextMenuItem from "./ContextMenuItem";
import { useNodeContextMenu } from "../../hooks/nodes/useNodeContextMenu";
import GroupRemoveIcon from "@mui/icons-material/GroupRemove";
import SearchIcon from "@mui/icons-material/Search";
import EditIcon from "@mui/icons-material/EditOutlined";
import FilterListIcon from "@mui/icons-material/FilterList";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import BlockIcon from "@mui/icons-material/Block";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import DataArrayIcon from "@mui/icons-material/DataArray";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import QueueIcon from "@mui/icons-material/Queue";
import SouthIcon from "@mui/icons-material/South";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useRemoveFromGroup } from "../../hooks/nodes/useRemoveFromGroup";
import { useGroupIntoSubgraph } from "../../hooks/nodes/useGroupIntoSubgraph";
import { useNodes } from "../../contexts/NodeContext";
import { useChatAboutNodesOnMenuClose } from "../../hooks/nodes/useChatAboutNodes";

const NodeContextMenu: React.FC = () => {
  const { t } = useTranslation();
  const {
    menuPosition,
    closeContextMenu,
    node,
    handlers,
    conditions
  } = useNodeContextMenu();
  const removeFromGroup = useRemoveFromGroup();
  const handleRemoveFromGroup = useCallback(() => {
    removeFromGroup([node as Node<NodeData>]);
    closeContextMenu();
  }, [removeFromGroup, node, closeContextMenu]);

  const groupIntoSubgraph = useGroupIntoSubgraph();
  const getSelectedNodes = useNodes((s) => s.getSelectedNodes);
  const handleGroupIntoSubgraph = useCallback(() => {
    if (!node) return;
    const selected = getSelectedNodes();
    const ids = selected.some((n) => n.id === node.id)
      ? selected.map((n) => n.id)
      : [node.id];
    if (ids.length === 0) return;
    groupIntoSubgraph(ids);
    closeContextMenu();
  }, [groupIntoSubgraph, getSelectedNodes, node, closeContextMenu]);

  const chatAboutNodes = useChatAboutNodesOnMenuClose();
  const handleChatAboutNode = useCallback(() => {
    if (!node) return;
    chatAboutNodes([node.id]);
    closeContextMenu();
  }, [chatAboutNodes, node, closeContextMenu]);

  const menuItems = [
    <ContextMenuItem
      key="chat-about-node"
      onClick={handleChatAboutNode}
      label={t("screen_editor.nodeChat.chatAboutNode")}
      IconComponent={<ForumOutlinedIcon />}
      tooltip={t("screen_editor.nodeChat.chatAboutNodeTooltip")}
    />,
    <Divider key="divider-after-chat" />,
    conditions.isInGroup && (
      <ContextMenuItem
        key="remove-from-group"
        onClick={handleRemoveFromGroup}
        label={t("screen_editor.removeFromGroup")}
        IconComponent={<GroupRemoveIcon />}
        tooltip={t("screen_editor.removeNodeFromGroupTooltip")}
      />
    ),
    <ContextMenuItem
      key="copy"
      onClick={handlers.handleCopy}
      label={t("screen_editor.copy")}
      IconComponent={<ContentCopyIcon />}
      tooltip={
        <div className="tooltip-span">
          <div className="tooltip-title">{t("screen_editor.copy")}</div>
          <div className="tooltip-key">
            <kbd>CTRL</kbd>+<kbd>C</kbd> / <kbd>⌘</kbd>+<kbd>C</kbd>
          </div>
        </div>
      }
    />,
    <ContextMenuItem
      key="cut"
      onClick={handlers.handleCut}
      label={t("screen_editor.cut")}
      IconComponent={<ContentCutIcon />}
      tooltip={
        <div className="tooltip-span">
          <div className="tooltip-title">{t("screen_editor.cut")}</div>
          <div className="tooltip-key">
            <kbd>CTRL</kbd>+<kbd>X</kbd> / <kbd>⌘</kbd>+<kbd>X</kbd>
          </div>
        </div>
      }
    />,
    <ContextMenuItem
      key="copy-nodedata"
      onClick={handlers.handleCopyMetadataToClipboard}
      label={t("screen_editor.copyNodeAsJson")}
      IconComponent={<DataArrayIcon />}
      tooltip={t("screen_editor.copyNodeDataAsJsonTooltip")}
    />,
    <ContextMenuItem
      key="duplicate"
      onClick={handlers.handleDuplicate}
      label={t("screen_editor.duplicate")}
      IconComponent={<QueueIcon />}
      tooltip={
        <div className="tooltip-span">
          <div className="tooltip-title">{t("screen_editor.duplicate")}</div>
          <div className="tooltip-key">
            <kbd>CTRL</kbd>+<kbd>D</kbd> / <kbd>⌘</kbd>+<kbd>D</kbd>
          </div>
        </div>
      }
    />,
    <ContextMenuItem
      key="duplicate-vertical"
      onClick={handlers.handleDuplicateVertical}
      label={t("screen_editor.duplicateVertically")}
      IconComponent={<SouthIcon />}
      tooltip={
        <div className="tooltip-span">
          <div className="tooltip-title">{t("screen_editor.duplicateVertically")}</div>
          <div className="tooltip-key">
            <kbd>CTRL</kbd>+<kbd>SHIFT</kbd>+<kbd>D</kbd> / <kbd>⌘</kbd>+<kbd>SHIFT</kbd>+<kbd>D</kbd>
          </div>
        </div>
      }
    />,
    <ContextMenuItem
      key="run-from-here"
      onClick={handlers.handleRunFromHere}
      label={conditions.isWorkflowRunning ? t("screen_editor.running") : t("screen_editor.runNode")}
      IconComponent={<PlayArrowIcon />}
      tooltip={t("screen_editor.runNodeTooltip")}
      disabled={conditions.isWorkflowRunning}
    />,
    <ContextMenuItem
      key="toggle-bypass"
      onClick={handlers.handleToggleBypass}
      label={conditions.isBypassed ? t("screen_editor.enableNode") : t("screen_editor.disableNode")}
      IconComponent={conditions.isBypassed ? <PowerSettingsNewIcon /> : <BlockIcon />}
      tooltip={
        <div className="tooltip-span">
          <div className="tooltip-title">
            {conditions.isBypassed ? t("screen_editor.enableNode") : t("screen_editor.disableNode")}
          </div>
          <div className="tooltip-key">
            <kbd>B</kbd>
          </div>
        </div>
      }
    />,
    <ContextMenuItem
      key="toggle-collapsed"
      onClick={handlers.handleToggleCollapsed}
      label={conditions.isCollapsed ? t("screen_editor.expandNode") : t("screen_editor.collapseNode")}
      IconComponent={
        conditions.isCollapsed ? <UnfoldMoreIcon /> : <UnfoldLessIcon />
      }
      tooltip={
        <div className="tooltip-span">
          <div className="tooltip-title">
            {conditions.isCollapsed ? t("screen_editor.expandNode") : t("screen_editor.collapseNode")}
          </div>
          <div className="tooltip-key">
            <kbd>C</kbd>
          </div>
        </div>
      }
    />,
    <ContextMenuItem
      key="toggle-comment"
      onClick={handlers.handleToggleComment}
      label={conditions.hasCommentTitle ? t("screen_editor.deleteComment") : t("screen_editor.addComment")}
      IconComponent={<EditIcon />}
      tooltip={
        conditions.hasCommentTitle
          ? t("screen_editor.deleteCommentTooltip")
          : t("screen_editor.addCommentTooltip")
      }
    />,
    <ContextMenuItem
      key="group-into-subgraph"
      onClick={handleGroupIntoSubgraph}
      label={t("screen_editor.groupIntoSubgraph")}
      IconComponent={<AccountTreeIcon />}
      tooltip={t("screen_editor.groupIntoSubgraphTooltip")}
    />,
    conditions.canConvertToInput && (
      <ContextMenuItem
        key="convert-to-input"
        onClick={handlers.handleConvertToInput}
        label={t("screen_editor.convertToInput")}
        IconComponent={<SwapHorizIcon />}
        tooltip={t("screen_editor.convertToInputTooltip")}
      />
    ),
    conditions.canConvertToConstant && (
      <ContextMenuItem
        key="convert-to-constant"
        onClick={handlers.handleConvertToConstant}
        label={t("screen_editor.convertToConstant")}
        IconComponent={<SwapHorizIcon />}
        tooltip={t("screen_editor.convertToConstantTooltip")}
      />
    ),
    <ContextMenuItem
      key="show-templates"
      onClick={handlers.handleFindTemplates}
      label={t("screen_editor.showTemplates")}
      IconComponent={<SearchIcon />}
      tooltip={t("screen_editor.showTemplatesTooltip")}
    />,
    <ContextMenuItem
      key="select-all"
      onClick={handlers.handleSelectAllSameType}
      label={
        node?.type
          ? t("screen_editor.selectAllTypeNodes", {
              type: node.type.split(".").pop()
            })
          : t("screen_editor.selectAllNodeType")
      }
      IconComponent={<FilterListIcon />}
      tooltip={t("screen_editor.selectSameTypeNodes")}
    />,
    <Divider key="divider-before-delete" />,
    <ContextMenuItem
      key="delete-node"
      onClick={handlers.handleDeleteNode}
      label={t("screen_editor.deleteNode")}
      destructive
      IconComponent={<DeleteIcon />}
      tooltip={t("screen_editor.deleteNodeTooltip")}
    />
  ];

  return (
    <ContextMenu
      className="context-menu node-context-menu"
      open={menuPosition !== null}
      onClose={closeContextMenu}
      onContextMenu={(event) => event.preventDefault()}
      position={menuPosition}
    >
      {menuItems.filter(Boolean)}
    </ContextMenu>
  );
};

export default memo(NodeContextMenu);
