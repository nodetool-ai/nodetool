import React, { useCallback, useMemo } from "react";
import { Divider, Typography, MenuItem, Menu } from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { useCopyPaste } from "../../hooks/handlers/useCopyPaste";
import { useDuplicateNodes } from "../../hooks/useDuplicate";
import useAlignNodes from "../../hooks/useAlignNodes";
import { useSurroundWithGroup } from "../../hooks/nodes/useSurroundWithGroup";
import { useRemoveFromGroup } from "../../hooks/nodes/useRemoveFromGroup";
import { useSelectConnected } from "../../hooks/useSelectConnected";
import QueueIcon from "@mui/icons-material/Queue";
import CopyAllIcon from "@mui/icons-material/CopyAll";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";
import GroupWorkIcon from "@mui/icons-material/GroupWork";
import BlockIcon from "@mui/icons-material/Block";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import { useNodes } from "../../contexts/NodeContext";

interface SelectionContextMenuProps {
  top?: number;
  left?: number;
}

const SelectionContextMenu: React.FC<SelectionContextMenuProps> = () => {
  const { handleCopy } = useCopyPaste();
  const { deleteNode, toggleBypassSelected } = useNodes((state) => ({
    deleteNode: state.deleteNode,
    toggleBypassSelected: state.toggleBypassSelected
  }));
  const duplicateNodes = useDuplicateNodes();
  const alignNodes = useAlignNodes();
  const surroundWithGroup = useSurroundWithGroup();
  const removeFromGroup = useRemoveFromGroup();
  const selectConnectedAll = useSelectConnected({ direction: "both" });
  const selectConnectedInputs = useSelectConnected({ direction: "upstream" });
  const selectConnectedOutputs = useSelectConnected({ direction: "downstream" });
  const menuPosition = useContextMenuStore((state) => state.menuPosition);
  const closeContextMenu = useContextMenuStore(
    (state) => state.closeContextMenu
  );
  const { selectedNodes } = useNodes((state) => ({
    selectedNodes: state.getSelectedNodes()
  }));

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
      selectedNodes.forEach((node) => {
        deleteNode(node.id);
      });
    }
    closeContextMenu();
  }, [closeContextMenu, deleteNode, selectedNodes]);

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

  if (!menuPosition) {
    return null;
  }

  return (
    <Menu
      className="context-menu selection-context-menu"
      open={menuPosition !== null}
      onClose={closeContextMenu}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(e) => e.stopPropagation()}
      anchorReference="anchorPosition"
      anchorPosition={
        menuPosition ? { top: menuPosition.y, left: menuPosition.x } : undefined
      }
    >
      <MenuItem disabled>
        <Typography
          style={{
            margin: ".1em 0",
            padding: "0"
          }}
          variant="body1"
        >
          SELECTION
        </Typography>
      </MenuItem>

      <ContextMenuItem
        onClick={() => handleDuplicateNodes()}
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
        onClick={() => handleCopy()}
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
      {selectedNodes?.length > 1 && (
        <ContextMenuItem
          onClick={() => {
            alignNodes({ arrangeSpacing: false });
          }}
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
          onClick={() => {
            alignNodes({ arrangeSpacing: true });
          }}
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

      {!anyHasParent && (
        <ContextMenuItem
          onClick={() => {
            surroundWithGroup({ selectedNodes });
          }}
          label="Surrround With Group"
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

      {anyHasParent && (
        <ContextMenuItem
          onClick={() => {
            removeFromGroup(selectedNodes);
          }}
          label="Remove From Group"
          IconComponent={<GroupWorkIcon />}
          tooltip={
            <div className="tooltip-span">
              <div className="tooltip-title">Remove From Group</div>
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
        <Typography
          style={{
            margin: ".1em 0",
            padding: "0"
          }}
          variant="body1"
        >
          CONNECTED
        </Typography>
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
    </Menu>
  );
};

export default SelectionContextMenu;
