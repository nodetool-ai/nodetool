import React, { useCallback, useMemo } from "react";
import { Divider, Typography, MenuItem, Menu } from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
//behaviours
import { useCopyPaste } from "../../hooks/handlers/useCopyPaste";
import { useDuplicateNodes } from "../../hooks/useDuplicate";
import useAlignNodes from "../../hooks/useAlignNodes";
import { useSurroundWithGroup } from "../../hooks/nodes/useSurroundWithGroup";
import { useRemoveFromGroup } from "../../hooks/nodes/useRemoveFromGroup";
//icons
import QueueIcon from "@mui/icons-material/Queue";
import CopyAllIcon from "@mui/icons-material/CopyAll";
// import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
// import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";
import GroupWorkIcon from "@mui/icons-material/GroupWork";
import { useNodes } from "../../contexts/NodeContext";

interface SelectionContextMenuProps {
  top?: number;
  left?: number;
}

const SelectionContextMenu: React.FC<SelectionContextMenuProps> = () => {
  const { handleCopy } = useCopyPaste();
  const { deleteNode } = useNodes((state) => ({
    deleteNode: state.deleteNode
  }));
  const duplicateNodes = useDuplicateNodes();
  const alignNodes = useAlignNodes();
  const surroundWithGroup = useSurroundWithGroup();
  const removeFromGroup = useRemoveFromGroup();
  const menuPosition = useContextMenuStore((state) => state.menuPosition);
  const closeContextMenu = useContextMenuStore(
    (state) => state.closeContextMenu
  );
  const { selectedNodes } = useNodes((state) => ({
    selectedNodes: state.getSelectedNodes()
  }));

  // any has parent
  const anyHasParent = useMemo(() => {
    return selectedNodes.some((node) => node.parentId);
  }, [selectedNodes]);

  //duplicate
  const handleDuplicateNodes = useCallback(() => {
    duplicateNodes();
  }, [duplicateNodes]);

  //delete
  const handleDelete = useCallback(() => {
    if (selectedNodes?.length) {
      selectedNodes.forEach((node) => {
        deleteNode(node.id);
      });
    }
    closeContextMenu();
  }, [closeContextMenu, deleteNode, selectedNodes]);

  //collapse
  // const handleCollapseAll = useCallback(
  //   (callAlignNodes: boolean) => {
  //     if (selectedNodeIds?.length) {
  //       selectedNodeIds.forEach((id) => {
  //         const node = findNode(id);
  //         if (node && node.data.properties) {
  //           updateNodeData(id, {
  //             properties: { ...node.data.properties },
  //             collapsed: true,
  //             workflow_id: node.data.workflow_id
  //           });
  //         }
  //       });
  //       // alignNodes
  //       if (callAlignNodes && alignNodes) {
  //         setTimeout(() => {
  //           alignNodes({ arrangeSpacing: true, collapsed: true });
  //         }, 10);
  //       }
  //     }
  //   },
  //   [selectedNodeIds, alignNodes, findNode, updateNodeData]
  // );

  //expand
  // const handleExpandAll = useCallback(
  //   (callAlignNodes: boolean) => {
  //     if (selectedNodeIds?.length) {
  //       selectedNodeIds.forEach((id) => {
  //         const node = findNode(id);
  //         if (node && node.data.properties) {
  //           updateNodeData(id, {
  //             properties: { ...node.data.properties },
  //             collapsed: false,
  //             workflow_id: node.data.workflow_id
  //           });
  //         }
  //       });
  //       // alignNodes
  //       if (callAlignNodes && alignNodes) {
  //         setTimeout(() => {
  //           alignNodes({ arrangeSpacing: true, collapsed: false });
  //         }, 10);
  //       }
  //     }
  //   },
  //   [selectedNodeIds, alignNodes, findNode, updateNodeData]
  // );

  if (!menuPosition) {return null;}
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
      {/* <ContextMenuItem
        onClick={() => handleCollapseAll(false)}
        label="Collapse"
        IconComponent={<UnfoldLessIcon />}
        tooltip=""
      />
      <ContextMenuItem
        onClick={() => handleExpandAll(false)}
        label="Expand"
        IconComponent={<UnfoldMoreIcon />}
        tooltip=""
      /> */}
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
