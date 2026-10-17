import React, { memo, useCallback } from "react";
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
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useRemoveFromGroup } from "../../hooks/nodes/useRemoveFromGroup";
import { useGroupIntoSubgraph } from "../../hooks/nodes/useGroupIntoSubgraph";
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

  const menuItems = [
    conditions.isInGroup && (
      <ContextMenuItem
        key="remove-from-group"
        onClick={handleRemoveFromGroup}
        label="Remove from group"
        IconComponent={<GroupRemoveIcon />}
        tooltip="Remove this node from the group"
      />
    ),
    <ContextMenuItem
      key="copy"
      onClick={handlers.handleCopy}
      label="Copy"
      IconComponent={<ContentCopyIcon />}
      tooltip={
        <div className="tooltip-span">
          <div className="tooltip-title">Copy</div>
          <div className="tooltip-key">
            <kbd>CTRL</kbd>+<kbd>C</kbd> / <kbd>⌘</kbd>+<kbd>C</kbd>
          </div>
        </div>
      }
    />,
    <ContextMenuItem
      key="cut"
      onClick={handlers.handleCut}
      label="Cut"
      IconComponent={<ContentCutIcon />}
      tooltip={
        <div className="tooltip-span">
          <div className="tooltip-title">Cut</div>
          <div className="tooltip-key">
            <kbd>CTRL</kbd>+<kbd>X</kbd> / <kbd>⌘</kbd>+<kbd>X</kbd>
          </div>
        </div>
      }
    />,
    <ContextMenuItem
      key="copy-nodedata"
      onClick={handlers.handleCopyMetadataToClipboard}
      label="Copy node as JSON"
      IconComponent={<DataArrayIcon />}
      tooltip="Copy this node's data as JSON to the clipboard"
    />,
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
      label="Duplicate vertically"
      IconComponent={<SouthIcon />}
      tooltip={
        <div className="tooltip-span">
          <div className="tooltip-title">Duplicate vertically</div>
          <div className="tooltip-key">
            <kbd>CTRL</kbd>+<kbd>SHIFT</kbd>+<kbd>D</kbd> / <kbd>⌘</kbd>+<kbd>SHIFT</kbd>+<kbd>D</kbd>
          </div>
        </div>
      }
    />,
    <ContextMenuItem
      key="run-from-here"
      onClick={handlers.handleRunFromHere}
      label={conditions.isWorkflowRunning ? "Running…" : "Run node"}
      IconComponent={<PlayArrowIcon />}
      tooltip="Run this node as its own job, using previous results as inputs"
      disabled={conditions.isWorkflowRunning}
    />,
    <ContextMenuItem
      key="toggle-bypass"
      onClick={handlers.handleToggleBypass}
      label={conditions.isBypassed ? "Enable node" : "Disable node"}
      IconComponent={conditions.isBypassed ? <PowerSettingsNewIcon /> : <BlockIcon />}
      tooltip={
        <div className="tooltip-span">
          <div className="tooltip-title">
            {conditions.isBypassed ? "Enable node" : "Disable node"}
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
      label={conditions.isCollapsed ? "Expand node" : "Collapse node"}
      IconComponent={
        conditions.isCollapsed ? <UnfoldMoreIcon /> : <UnfoldLessIcon />
      }
      tooltip={
        <div className="tooltip-span">
          <div className="tooltip-title">
            {conditions.isCollapsed ? "Expand node" : "Collapse node"}
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
      label={conditions.hasCommentTitle ? "Remove comment" : "Add comment"}
      IconComponent={<EditIcon />}
      tooltip={
        conditions.hasCommentTitle
          ? "Remove the comment from this node"
          : "Add a comment to this node"
      }
    />,
    <ContextMenuItem
      key="group-into-subgraph"
      onClick={handleGroupIntoSubgraph}
      label="Group into subgraph"
      IconComponent={<AccountTreeIcon />}
      tooltip="Move the selected nodes into a new subgraph node"
    />,
    conditions.canConvertToInput && (
      <ContextMenuItem
        key="convert-to-input"
        onClick={handlers.handleConvertToInput}
        label="Convert to input node"
        IconComponent={<SwapHorizIcon />}
        tooltip="Convert this constant node to an input node"
      />
    ),
    conditions.canConvertToConstant && (
      <ContextMenuItem
        key="convert-to-constant"
        onClick={handlers.handleConvertToConstant}
        label="Convert to constant node"
        IconComponent={<SwapHorizIcon />}
        tooltip="Convert this input node to a constant node"
      />
    ),
    <ContextMenuItem
      key="show-templates"
      onClick={handlers.handleFindTemplates}
      label="Show templates"
      IconComponent={<SearchIcon />}
      tooltip="Find templates using this node"
    />,
    <ContextMenuItem
      key="select-all"
      onClick={handlers.handleSelectAllSameType}
      label={
        node?.type
          ? `Select all ${node.type.split(".").pop()} nodes`
          : "Select all nodes of this type"
      }
      IconComponent={<FilterListIcon />}
      tooltip="Select all nodes of the same type"
    />,
    <Divider key="divider-before-delete" />,
    <ContextMenuItem
      key="delete-node"
      onClick={handlers.handleDeleteNode}
      label="Delete node"
      destructive
      IconComponent={<DeleteIcon />}
      tooltip="Delete this node"
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
