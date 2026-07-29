import React, { useCallback, useMemo, memo } from "react";

import {
  Text,
  Divider,
  ContextMenu,
  MenuItem
} from "../ui_primitives";
import ContextMenuItem from "./ContextMenuItem";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
//behaviours
import { useCopyPaste } from "../../hooks/handlers/useCopyPaste";
import { useDuplicateNodes } from "../../hooks/useDuplicate";
import useAlignNodes from "../../hooks/useAlignNodes";
import { useSurroundWithGroup } from "../../hooks/nodes/useSurroundWithGroup";
import { useRemoveFromGroup } from "../../hooks/nodes/useRemoveFromGroup";
import { useGroupIntoSubgraph } from "../../hooks/nodes/useGroupIntoSubgraph";
import { useRunSelectedNodes } from "../../hooks/nodes/useRunSelectedNodes";
import { useToggleCollapse } from "../../hooks/nodes/useToggleCollapse";
import { useSelectConnected } from "../../hooks/useSelectConnected";
//icons
import QueueIcon from "@mui/icons-material/Queue";
import CopyAllIcon from "@mui/icons-material/CopyAll";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";
import GroupWorkIcon from "@mui/icons-material/GroupWork";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import BlockIcon from "@mui/icons-material/Block";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import { useNodes } from "../../contexts/NodeContext";
import isEqual from "../../utils/isEqual";
import { shallow } from "zustand/shallow";

interface SelectionContextMenuProps {
  top?: number;
  left?: number;
}

const SelectionContextMenu: React.FC<SelectionContextMenuProps> = () => {
  const { handleCopy, handleCut } = useCopyPaste();
  const { deleteNodes, toggleBypassSelected } = useNodes((state) => ({
    deleteNodes: state.deleteNodes,
    toggleBypassSelected: state.toggleBypassSelected
  }), shallow);
  const duplicateNodes = useDuplicateNodes();
  const alignNodes = useAlignNodes();
  const surroundWithGroup = useSurroundWithGroup();
  const removeFromGroup = useRemoveFromGroup();
  const groupIntoSubgraph = useGroupIntoSubgraph();
  const { runSelectedNodes } = useRunSelectedNodes();
  const toggleCollapse = useToggleCollapse();
  const selectConnectedAll = useSelectConnected({ direction: "both" });
  const selectConnectedInputs = useSelectConnected({ direction: "upstream" });
  const selectConnectedOutputs = useSelectConnected({ direction: "downstream" });
  const menuPosition = useContextMenuStore((state) => state.menuPosition);
  const closeContextMenu = useContextMenuStore(
    (state) => state.closeContextMenu
  );
  // Use simplified selector with custom equality to avoid re-renders during drag operations.
  // Only extract the properties needed by this component and its hooks:
  // - id, parentId, data for context menu logic and hooks
  // - position, measured for useSurroundWithGroup and useRemoveFromGroup hooks
  // This prevents unnecessary re-renders when other node properties change.
  // Note: data reference is stable during position updates, so this is efficient.
  const selectedNodes = useNodes(
    (state) =>
      state.nodes
        .filter((node) => node.selected)
        .map((node) => ({
          id: node.id,
          parentId: node.parentId,
          data: node.data,
          position: node.position,
          measured: node.measured
        })),
    isEqual
  );

  const anyHasParent = useMemo(() => {
    return selectedNodes.some((node) => node.parentId);
  }, [selectedNodes]);

  const majorityBypassed = useMemo(() => {
    if (selectedNodes.length === 0) {
      return false;
    }
    const bypassedCount = selectedNodes.filter((n) => n.data.bypassed).length;
    return bypassedCount >= selectedNodes.length / 2;
  }, [selectedNodes]);

  const handleToggleBypass = useCallback(() => {
    toggleBypassSelected();
    closeContextMenu();
  }, [toggleBypassSelected, closeContextMenu]);

  const handleDuplicateNodes = useCallback(() => {
    duplicateNodes();
  }, [duplicateNodes]);

  const handleDelete = useCallback(() => {
    if (selectedNodes?.length) {
      // [PERF] Use batch deletion (deleteNodes) instead of iterating deleteNode(node.id) to avoid O(N) re-renders
      deleteNodes(selectedNodes.map((node) => node.id));
    }
    closeContextMenu();
  }, [closeContextMenu, deleteNodes, selectedNodes]);

  const handleSelectConnectedAll = useCallback(() => {
    selectConnectedAll.selectConnected();
    closeContextMenu();
  }, [selectConnectedAll, closeContextMenu]);

  const handleSelectConnectedInputs = useCallback(() => {
    selectConnectedInputs.selectConnected();
    closeContextMenu();
  }, [selectConnectedInputs, closeContextMenu]);

  const handleSelectConnectedOutputs = useCallback(() => {
    selectConnectedOutputs.selectConnected();
    closeContextMenu();
  }, [selectConnectedOutputs, closeContextMenu]);

  const handleAlignNodes = useCallback(
    (arrangeSpacing: boolean) => {
      alignNodes({ arrangeSpacing });
    },
    [alignNodes]
  );

  const handleSurroundWithGroup = useCallback(() => {
    surroundWithGroup({ selectedNodes });
  }, [surroundWithGroup, selectedNodes]);

  const handleRemoveFromGroup = useCallback(() => {
    removeFromGroup(selectedNodes);
  }, [removeFromGroup, selectedNodes]);

  const handleCopyNodes = useCallback(() => {
    handleCopy();
    closeContextMenu();
  }, [handleCopy, closeContextMenu]);

  const handleCutNodes = useCallback(() => {
    void handleCut();
    closeContextMenu();
  }, [handleCut, closeContextMenu]);

  const handleRunSelected = useCallback(() => {
    void runSelectedNodes();
    closeContextMenu();
  }, [runSelectedNodes, closeContextMenu]);

  const handleGroupIntoSubgraph = useCallback(() => {
    const ids = selectedNodes.map((node) => node.id);
    if (ids.length === 0) {
      return;
    }
    groupIntoSubgraph(ids);
    closeContextMenu();
  }, [groupIntoSubgraph, selectedNodes, closeContextMenu]);

  const handleToggleCollapsed = useCallback(() => {
    toggleCollapse(selectedNodes.map((node) => node.id));
    closeContextMenu();
  }, [toggleCollapse, selectedNodes, closeContextMenu]);

  const handleAlignNodesFalse = useCallback(() => {
    handleAlignNodes(false);
  }, [handleAlignNodes]);

  const handleAlignNodesTrue = useCallback(() => {
    handleAlignNodes(true);
  }, [handleAlignNodes]);

  if (!menuPosition) {
    return null;
  }
  return (
    <ContextMenu
      className="context-menu selection-context-menu"
      open={menuPosition !== null}
      onClose={closeContextMenu}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(e) => e.stopPropagation()}
      position={menuPosition}
    >
      <MenuItem disabled>
        <Text
          style={{
            margin: ".1em 0",
            padding: "0"
          }}
        >
          SELECTION
        </Text>
      </MenuItem>

      <ContextMenuItem
        onClick={handleDuplicateNodes}
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
      />
      <ContextMenuItem
        onClick={handleCopyNodes}
        label="Copy"
        IconComponent={<CopyAllIcon />}
        tooltip={
          <div className="tooltip-span">
            <div className="tooltip-title">Copy</div>
            <div className="tooltip-key">
              <kbd>CTRL</kbd>+<kbd>C</kbd> / <kbd>⌘</kbd>+<kbd>C</kbd>
            </div>
          </div>
        }
      />
      <ContextMenuItem
        onClick={handleCutNodes}
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
      />
      <ContextMenuItem
        onClick={handleRunSelected}
        label="Run Selected"
        IconComponent={<PlayArrowIcon />}
        tooltip="Run the selected nodes as their own job"
      />
      {selectedNodes?.length > 1 && (
        <ContextMenuItem
          onClick={handleAlignNodesFalse}
          label="Align"
          IconComponent={<FormatAlignLeftIcon />}
          tooltip={
            <div className="tooltip-span">
              <div className="tooltip-title">Align</div>
              <div className="tooltip-key">
                <kbd>A</kbd>
              </div>
            </div>
          }
        />
      )}
      {selectedNodes?.length > 1 && (
        <ContextMenuItem
          onClick={handleAlignNodesTrue}
          label="Arrange"
          IconComponent={<FormatAlignLeftIcon />}
          tooltip={
            <div className="tooltip-span">
              <div className="tooltip-title">Arrange</div>
              <div className="tooltip-key">
                <kbd>SHIFT</kbd>+<kbd>A</kbd>
              </div>
            </div>
          }
        />
      )}

      <ContextMenuItem
        onClick={handleToggleBypass}
        label={majorityBypassed ? "Enable All" : "Bypass All"}
        IconComponent={<BlockIcon />}
        tooltip={
          <div className="tooltip-span">
            <div className="tooltip-title">
              {majorityBypassed ? "Enable Nodes" : "Bypass Nodes"}
            </div>
            <div className="tooltip-key">
              <kbd>B</kbd>
            </div>
          </div>
        }
      />

      <ContextMenuItem
        onClick={handleToggleCollapsed}
        label="Collapse / Expand"
        IconComponent={<UnfoldLessIcon />}
        tooltip={
          <div className="tooltip-span">
            <div className="tooltip-title">Collapse / Expand</div>
            <div className="tooltip-key">
              <kbd>C</kbd>
            </div>
          </div>
        }
      />

      {!anyHasParent && (
        <ContextMenuItem
          onClick={handleSurroundWithGroup}
          label="Surround With Group"
          IconComponent={<GroupWorkIcon />}
          tooltip={
            <div className="tooltip-span">
              <div className="tooltip-title">Surround With Group</div>
              <div className="tooltip-key">
                <kbd>CTRL</kbd>/<kbd>⌘</kbd>+<kbd>G</kbd>
              </div>
            </div>
          }
          addButtonClassName={`action ${
            selectedNodes.length < 1 ? "disabled" : ""
          }`}
        />
      )}

      <ContextMenuItem
        onClick={handleGroupIntoSubgraph}
        label="Group into Subgraph"
        IconComponent={<AccountTreeIcon />}
        tooltip="Move the selected nodes into a new subgraph node"
        addButtonClassName={`action ${
          selectedNodes.length < 1 ? "disabled" : ""
        }`}
      />

      {anyHasParent && (
        <ContextMenuItem
          onClick={handleRemoveFromGroup}
          label="Remove from Group"
          IconComponent={<GroupWorkIcon />}
          tooltip={
            <div className="tooltip-span">
              <div className="tooltip-title">Remove from Group</div>
              <div className="tooltip-key">
                <kbd>Right-Click</kbd>
              </div>
            </div>
          }
          addButtonClassName={`action ${
            selectedNodes.length < 1 ? "disabled" : ""
          }`}
        />
      )}

      <Divider />

      <MenuItem disabled>
        <Text
          style={{
            margin: ".1em 0",
            padding: "0"
          }}
        >
          CONNECTED
        </Text>
      </MenuItem>

      <ContextMenuItem
        onClick={handleSelectConnectedAll}
        label="Select All Connected"
        IconComponent={<CallSplitIcon />}
        tooltip={
          <div className="tooltip-span">
            <div className="tooltip-title">Select All Connected</div>
            <div className="tooltip-key">
              <kbd>SHIFT</kbd>+<kbd>C</kbd>
            </div>
          </div>
        }
        addButtonClassName={`action ${
          selectedNodes.length < 1 ? "disabled" : ""
        }`}
      />
      <ContextMenuItem
        onClick={handleSelectConnectedInputs}
        label="Select Inputs"
        IconComponent={<ArrowBackIcon />}
        tooltip={
          <div className="tooltip-span">
            <div className="tooltip-title">Select Inputs</div>
            <div className="tooltip-key">
              <kbd>SHIFT</kbd>+<kbd>I</kbd>
            </div>
          </div>
        }
        addButtonClassName={`action ${
          selectedNodes.length < 1 ? "disabled" : ""
        }`}
      />
      <ContextMenuItem
        onClick={handleSelectConnectedOutputs}
        label="Select Outputs"
        IconComponent={<ArrowForwardIcon />}
        tooltip={
          <div className="tooltip-span">
            <div className="tooltip-title">Select Outputs</div>
            <div className="tooltip-key">
              <kbd>SHIFT</kbd>+<kbd>O</kbd>
            </div>
          </div>
        }
        addButtonClassName={`action ${
          selectedNodes.length < 1 ? "disabled" : ""
        }`}
      />

      <Divider />
      <ContextMenuItem
        onClick={handleDelete}
        label="Delete"
        IconComponent={<RemoveCircleIcon />}
        tooltip={
          <div className="tooltip-span">
            <div className="tooltip-title">Delete</div>
            <div className="tooltip-key">
              <kbd>Backspace</kbd> / <kbd>Del</kbd>
            </div>
          </div>
        }
        addButtonClassName="delete"
      />
    </ContextMenu>
  );
};

export default memo(SelectionContextMenu);
