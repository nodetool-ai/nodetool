import React, { useCallback, useMemo } from "react";
import { Divider, Typography, MenuItem, Menu } from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
import { useNodeStore } from "../../stores/NodeStore";
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

interface SelectionContextMenuProps {
  top?: number;
  left?: number;
}

const SelectionContextMenu: React.FC<SelectionContextMenuProps> = () => {
  const { handleCopy } = useCopyPaste();
  const deleteNode = useNodeStore((state) => state.deleteNode);
  // const updateNodeData = useNodeStore((state) => state.updateNodeData);
  const findNode = useNodeStore((state) => state.findNode);
  const duplicateNodes = useDuplicateNodes();
  const alignNodes = useAlignNodes();
  const surroundWithGroup = useSurroundWithGroup();
  const removeFromGroup = useRemoveFromGroup();
  const menuPosition = useContextMenuStore((state) => state.menuPosition);
  const selectedNodes = useNodeStore((state) => state.getSelectedNodes());
  const selectedNodeIds = useNodeStore((state) =>
    state.getSelectedNodes().map((node) => node.id)
  );

  // any has parent
  const anyHasParent = useMemo(() => {
    return selectedNodeIds.some((id: string) => findNode(id)?.parentId);
  }, [selectedNodeIds, findNode]);

  //duplicate
  const handleDuplicateNodes = useCallback(() => {
    duplicateNodes();
  }, [duplicateNodes]);

  //delete
  const handleDelete = useCallback(() => {
    if (selectedNodeIds?.length) {
      selectedNodeIds.forEach((nodeId) => {
        deleteNode(nodeId);
      });
    }
  }, [deleteNode, selectedNodeIds]);

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

  if (!menuPosition) return null;
  return (
    <Menu
      className="context-menu selection-context-menu"
      open={menuPosition !== null}
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
        tooltip={<span className="tooltip-1">Space+D</span>}
      />
      <ContextMenuItem
        onClick={() => handleCopy()}
        label="Copy"
        IconComponent={<CopyAllIcon />}
        tooltip="CTRL+C | Meta+C"
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
      <ContextMenuItem
        onClick={() => {
          alignNodes({ arrangeSpacing: false });
        }}
        label="Align"
        IconComponent={<FormatAlignLeftIcon />}
        tooltip={<span className="tooltip-1">A</span>}
        addButtonClassName={`action ${
          (selectedNodeIds?.length || 0) <= 1 ? "disabled" : ""
        }`}
      />
      <ContextMenuItem
        onClick={() => {
          alignNodes({ arrangeSpacing: true });
        }}
        label="Arrange"
        IconComponent={<FormatAlignLeftIcon />}
        tooltip={<span className="tooltip-1">Space+A</span>}
        addButtonClassName={`action ${
          (selectedNodeIds?.length || 0) <= 1 ? "disabled" : ""
        }`}
      />

      {!anyHasParent && (
        <ContextMenuItem
          onClick={() => {
            surroundWithGroup({ selectedNodeIds: selectedNodeIds });
          }}
          label="Surrround With Group"
          IconComponent={<GroupWorkIcon />}
          tooltip={<span className="tooltip-1">Space+G</span>}
          addButtonClassName={`action ${
            selectedNodeIds.length < 1 ? "disabled" : ""
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
            <span className="tooltip-1">Right Click Node or Selection</span>
          }
          addButtonClassName={`action ${
            selectedNodeIds.length < 1 ? "disabled" : ""
          }`}
        />
      )}
      <Divider />
      <ContextMenuItem
        onClick={() => handleDelete()}
        label="Delete"
        IconComponent={<RemoveCircleIcon />}
        tooltip={<span className="tooltip-1">Backspace | Del</span>}
        addButtonClassName="delete"
      />
    </Menu>
  );
};

export default SelectionContextMenu;
