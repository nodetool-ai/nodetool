import React, { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { Toolbar, IconButton, Tooltip } from "@mui/material";
import QueueIcon from "@mui/icons-material/Queue";
import CopyAllIcon from "@mui/icons-material/CopyAll";
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";

import { useDuplicateNodes } from "../../hooks/useDuplicate";
import { useCopyPaste } from "../../hooks/handlers/useCopyPaste";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { getMousePosition } from "../../utils/MousePosition";
import { useNodes } from "../../contexts/NodeContext";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { getShortcutTooltip } from "../../config/shortcuts";
import { NodePresetMenu } from "./NodePresetMenu";
import { NodeData } from "../../stores/NodeData";
import useNodePresets from "../../hooks/useNodePresets";

interface NodeToolbarProps {
  nodeId: string;
  nodeType: string;
  data: NodeData;
}

const NodeToolButtons: React.FC<NodeToolbarProps> = ({ nodeId, nodeType, data }) => {
  const { getNode } = useReactFlow();
  const deleteNode = useNodes((state) => state.deleteNode);
  const updateNodeData = useNodes((state) => state.updateNodeData);
  const node = getNode(nodeId);
  const { handleCopy } = useCopyPaste();
  const duplicateNodes = useDuplicateNodes();
  const openDocumentation = useNodeMenuStore(
    (state) => state.openDocumentation
  );

  const {
    presets,
    savePreset,
    _applyPreset,
    hasPresets
  } = useNodePresets({
    nodeType,
    nodeId,
    currentProperties: data.properties || {}
  });

  const [presetAnchorEl, setPresetAnchorEl] = React.useState<HTMLElement | null>(null);

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

  const handleOpenPresetMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setPresetAnchorEl(event.currentTarget);
  }, []);

  const handleClosePresetMenu = useCallback(() => {
    setPresetAnchorEl(null);
  }, []);

  const handleApplyPreset = useCallback((properties: Record<string, unknown>) => {
    updateNodeData(nodeId, {
      ...data,
      properties: {
        ...data.properties,
        ...properties
      }
    });
  }, [nodeId, data, updateNodeData]);

  const handleSavePreset = useCallback((name: string, description?: string) => {
    savePreset(name, description);
  }, [savePreset]);

  if (!nodeId) {return null;}

  return (
    <>
      <Toolbar
        variant="dense"
        className="node-toolbar"
        sx={{ backgroundColor: "transparent" }}
      >
        <Tooltip
          title={
            <span>
              Presets <span className="shortcut">({presets.length} saved)</span>
            </span>
          }
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <IconButton
            className="nodrag"
            onClick={handleOpenPresetMenu}
            tabIndex={-1}
            sx={{
              color: hasPresets
                ? "warning.main"
                : "text.secondary"
            }}
          >
            {hasPresets ? <StarIcon /> : <StarBorderIcon />}
          </IconButton>
        </Tooltip>

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

        <Tooltip
          title={
            <span>
              Add Node{" "}
              <span className="shortcut">{getShortcutTooltip("add-node")}</span>
            </span>
          }
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <IconButton className="nodrag" onClick={handleCopyClicked} tabIndex={-1}>
            <QueueIcon />
          </IconButton>
        </Tooltip>

      </Toolbar>

      <NodePresetMenu
        nodeType={nodeType}
        anchorEl={presetAnchorEl}
        open={Boolean(presetAnchorEl)}
        onClose={handleClosePresetMenu}
        onApplyPreset={handleApplyPreset}
        onSavePreset={handleSavePreset}
        hasCurrentPresets={hasPresets}
      />
    </>
  );
};

export default NodeToolButtons;
