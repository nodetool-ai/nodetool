import React, { memo, useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { Toolbar, IconButton, Tooltip } from "@mui/material";
import QueueIcon from "@mui/icons-material/Queue";
import CopyAllIcon from "@mui/icons-material/CopyAll";
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";
import GroupRemoveIcon from "@mui/icons-material/GroupRemove";
import HelpIcon from "@mui/icons-material/Help";

import { useNodeStore, NodeStore } from "../../stores/NodeStore";
import { useDuplicateNodes } from "../../hooks/useDuplicate";
import { useCopyPaste } from "../../hooks/handlers/useCopyPaste";
import { useRemoveFromGroup } from "../../hooks/nodes/useRemoveFromGroup";
import { NodeData } from "../../stores/NodeData";
import { Node } from "@xyflow/react";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { getMousePosition } from "../../utils/MousePosition";
import { isEqual } from "lodash";
interface NodeToolbarProps {
  nodeId: string | null;
}

const NodeToolButtons: React.FC<NodeToolbarProps> = ({ nodeId }) => {
  const { getNode } = useReactFlow();
  const deleteNode = useNodeStore((state: NodeStore) => state.deleteNode);
  const node = nodeId !== null ? getNode(nodeId) : null;
  const removeFromGroup = useRemoveFromGroup();
  const { handleCopy } = useCopyPaste();
  const duplicateNodes = useDuplicateNodes();
  const openDocumentation = useNodeMenuStore(
    (state) => state.openDocumentation
  );
  const handleCopyClicked = useCallback(() => {
    if (nodeId) {
      handleCopy(nodeId);
    }
  }, [handleCopy, nodeId]);

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

  const handleOpenDocumentation = useCallback(() => {
    const mousePosition = getMousePosition();
    openDocumentation(node?.type || "", {
      x: mousePosition.x,
      y: mousePosition.y
    });
  }, [node?.type, openDocumentation]);

  if (!nodeId) return null;

  return (
    <Toolbar variant="dense" className="node-toolbar">
      {node?.parentId && (
        <Tooltip title="Remove from Group">
          <IconButton
            onClick={() => removeFromGroup([node as Node<NodeData>])}
            tabIndex={-1}
          >
            <GroupRemoveIcon />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title="Duplicate (Space+D)">
        <IconButton onClick={handleDuplicateNodes} tabIndex={-1}>
          <QueueIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="Documentation">
        <IconButton onClick={handleOpenDocumentation} tabIndex={-1}>
          <HelpIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="Copy (CTRL+C | Meta+C)">
        <IconButton onClick={handleCopyClicked} tabIndex={-1}>
          <CopyAllIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="Delete (Backspace | Del)">
        <IconButton className="delete" onClick={handleDelete} tabIndex={-1}>
          <RemoveCircleIcon />
        </IconButton>
      </Tooltip>
    </Toolbar>
  );
};

export default memo(NodeToolButtons, isEqual);
