import React, { useCallback } from "react";
import { Divider, Typography, MenuItem, Menu } from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
import { NodeStore, useNodeStore } from "../../stores/NodeStore";
import useSessionStateStore from "../../stores/SessionStateStore";
//behaviours
import { useCopyPaste } from "../../hooks/handlers/useCopyPaste";
import { useDuplicateNodes } from "../../hooks/useDuplicate";
import useAlignNodes from "../../hooks/useAlignNodes";
import { useAddToGroup } from "../../hooks/createnodes/useAddToGroup";
//icons
import QueueIcon from "@mui/icons-material/Queue";
import CopyAllIcon from "@mui/icons-material/CopyAll";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";
import GroupWorkIcon from "@mui/icons-material/GroupWork";
import { useReactFlow } from "@xyflow/react";

interface SelectionContextMenuProps {
  top?: number;
  left?: number;
}

const SelectionContextMenu: React.FC<SelectionContextMenuProps> = () => {
  const { handleCopy } = useCopyPaste();
  const deleteNode = useNodeStore((state) => state.deleteNode);
  const updateNodeData = useNodeStore((state) => state.updateNodeData);
  const updateNode = useNodeStore((state: NodeStore) => state.updateNode);
  const { getNode } = useReactFlow();
  const findNode = useNodeStore((state) => state.findNode);
  const duplicateNodes = useDuplicateNodes();
  const alignNodes = useAlignNodes();
  const addToGroup = useAddToGroup();
  const menuPosition = useContextMenuStore((state) => state.menuPosition);
  const selectedNodeIds = useSessionStateStore(
    (state) => state.selectedNodeIds
  );

  //duplicate
  const handleDuplicateNodes = useCallback(() => {
    if (selectedNodeIds?.length) {
      duplicateNodes(selectedNodeIds);
    }
  }, [duplicateNodes, selectedNodeIds]);

  //delete
  const handleDelete = useCallback(() => {
    if (selectedNodeIds?.length) {
      selectedNodeIds.forEach((nodeId) => {
        deleteNode(nodeId);
      });
    }
  }, [deleteNode, selectedNodeIds]);

  //collapse
  const handleCollapseAll = useCallback(
    (callAlignNodes: boolean) => {
      if (selectedNodeIds?.length) {
        selectedNodeIds.forEach((id) => {
          const node = findNode(id);
          if (node && node.data.properties) {
            updateNodeData(id, {
              properties: { ...node.data.properties },
              collapsed: true,
              workflow_id: node.data.workflow_id
            });
          }
        });
        // alignNodes
        if (callAlignNodes && alignNodes) {
          setTimeout(() => {
            alignNodes({ arrangeSpacing: true, collapsed: true });
          }, 10);
        }
      }
    },
    [selectedNodeIds, alignNodes, findNode, updateNodeData]
  );

  //expand
  const handleExpandAll = useCallback(
    (callAlignNodes: boolean) => {
      if (selectedNodeIds?.length) {
        selectedNodeIds.forEach((id) => {
          const node = findNode(id);
          if (node && node.data.properties) {
            updateNodeData(id, {
              properties: { ...node.data.properties },
              collapsed: false,
              workflow_id: node.data.workflow_id
            });
          }
        });
        // alignNodes
        if (callAlignNodes && alignNodes) {
          setTimeout(() => {
            alignNodes({ arrangeSpacing: true, collapsed: false });
          }, 10);
        }
      }
    },
    [selectedNodeIds, alignNodes, findNode, updateNodeData]
  );

  // remove from group
  const removeFromGroup = useCallback(
    (selectedNodeIds: string[]) => {
      if (selectedNodeIds?.length) {
        selectedNodeIds.forEach((id) => {
          const node = findNode(id);
          if (node && node.parentId) {
            const parentNode = getNode(node.parentId);
            if (parentNode) {
              const newPosition = {
                x: (parentNode.position.x || 0) + (node.position.x - 10 || 0),
                y: (parentNode.position.y || 0) + (node.position.y - 10 || 0)
              };
              updateNode(node.id, {
                parentId: undefined,
                position: newPosition
              });
            }
          }
        });
      }
    },
    [findNode, getNode, updateNode]
  );

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
      <ContextMenuItem
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
      />
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
      <ContextMenuItem
        onClick={() => {
          addToGroup({ selectedNodeIds: selectedNodeIds });
        }}
        label="Add To Group"
        IconComponent={<GroupWorkIcon />}
        tooltip={<span className="tooltip-1">Space+G</span>}
        addButtonClassName={`action ${
          selectedNodeIds.length < 1 ? "disabled" : ""
        }`}
      />
      <ContextMenuItem
        onClick={() => {
          removeFromGroup(selectedNodeIds);
        }}
        label="Remove From Group"
        IconComponent={<GroupWorkIcon />}
        // tooltip={<span className="tooltip-1">Space+G</span>}
        tooltip={
          <span className="tooltip-1">Right Click Node or Selection</span>
        }
        addButtonClassName={`action ${
          selectedNodeIds.length < 1 ? "disabled" : ""
        }`}
      />
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
