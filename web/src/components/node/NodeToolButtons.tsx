import React, { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { Toolbar, IconButton, Tooltip } from "@mui/material";
import CopyAllIcon from "@mui/icons-material/CopyAll";
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";

import { useDuplicateNodes } from "../../hooks/useDuplicate";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { getMousePosition } from "../../utils/MousePosition";
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
  const duplicateNodes = useDuplicateNodes();
  const openDocumentation = useNodeMenuStore(
    (state) => state.openDocumentation
  );

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
      <Tooltip
        title={
          <span>
            Duplicate{" "}
            <span className="shortcut">{getShortcutTooltip("duplicate")}</span>
          </span>
        }
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          className="nodrag"
          onClick={handleDuplicateNodes}
          tabIndex={-1}
        >
          <CopyAllIcon />
        </IconButton>
      </Tooltip>

      <Tooltip
        title={
          <span>
            Delete{" "}
            <span className="shortcut">{getShortcutTooltip("delete")}</span>
          </span>
        }
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          className="nodrag"
          onClick={handleDelete}
          tabIndex={-1}
        >
          <RemoveCircleIcon />
        </IconButton>
      </Tooltip>

    </Toolbar>
  );
};

export default NodeToolButtons;
