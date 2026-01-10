import React from "react";
import { Menu, Divider } from "@mui/material";
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
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { isDevelopment } from "../../stores/ApiClient";
import { useRemoveFromGroup } from "../../hooks/nodes/useRemoveFromGroup";

const NodeContextMenu: React.FC = () => {
  const {
    menuPosition,
    closeContextMenu,
    node,
    handlers,
    conditions
  } = useNodeContextMenu();
  const removeFromGroup = useRemoveFromGroup();

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
      label={conditions.hasComment ? "Remove Comment" : "Add Comment"}
      IconComponent={<EditIcon />}
      tooltip={
        conditions.hasComment
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

export default NodeContextMenu;
