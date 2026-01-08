import React, { memo, useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { Toolbar, IconButton, Tooltip } from "@mui/material";
import QueueIcon from "@mui/icons-material/Queue";
import CopyAllIcon from "@mui/icons-material/CopyAll";
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";

import { useDuplicateNodes } from "../../hooks/useDuplicate";
import { useCopyPaste } from "../../hooks/handlers/useCopyPaste";
import { useRemoveFromGroup } from "../../hooks/nodes/useRemoveFromGroup";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { getMousePosition } from "../../utils/MousePosition";
import isEqual from "lodash/isEqual";
import { useNodes } from "../../contexts/NodeContext";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { getShortcutTooltip } from "../../config/shortcuts";

interface NodeToolbarProps {
  nodeId: string | null;
}

const NodeToolButtons: React.FC<NodeToolbarProps> = ({ nodeId }) => {
  const { getNode } = useReactFlow();
  const deleteNode = useNodes((state) => state.deleteNode);
  const node = nodeId !== null ? getNode(nodeId) : null;
  const _removeFromGroup = useRemoveFromGroup();
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

  const _handleOpenDocumentation = useCallback(() => {
    const mousePosition = getMousePosition();
    openDocumentation(node?.type || "", {
      x: mousePosition.x,
      y: mousePosition.y
    });
  }, [node?.type, openDocumentation]);

  if (!nodeId) {return null;}

  return (
    <Toolbar
      variant="dense"
      className="node-toolbar"
      sx={{ backgroundColor: "transparent" }}
    >
      {/* {node?.parentId && (
        <Tooltip title="Remove from Group">
          <IconButton
            onClick={() => removeFromGroup([node as Node<NodeData>])}
            tabIndex={-1}
          >
            <GroupRemoveIcon />
          </IconButton>
        </Tooltip>
      )} */}
      <Tooltip
        title={
          <div className="tooltip-span">
            <div className="tooltip-title">Duplicate</div>
            <div className="tooltip-key">
              <kbd>Space</kbd>+<kbd>D</kbd>
            </div>
          </div>
        }
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton onClick={handleDuplicateNodes} tabIndex={-1}>
          <QueueIcon />
        </IconButton>
      </Tooltip>
      <Tooltip
        title={getShortcutTooltip("copy")}
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton onClick={handleCopyClicked} tabIndex={-1}>
          <CopyAllIcon />
        </IconButton>
      </Tooltip>
      <Tooltip
        title={getShortcutTooltip("delete-node")}
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton className="delete" onClick={handleDelete} tabIndex={-1}>
          <RemoveCircleIcon />
        </IconButton>
      </Tooltip>
    </Toolbar>
  );
};

export default memo(NodeToolButtons, isEqual);
