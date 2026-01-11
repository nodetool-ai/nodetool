/** @jsxImportSource @emotion/react */
import { useState, useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import { NodePresetMenu } from "./NodePresetMenu";
import useNodePresets from "../../hooks/useNodePresets";

interface NodePresetButtonProps {
  nodeType: string;
  nodeId: string;
  currentProperties: Record<string, unknown>;
  onApplyPreset: (properties: Record<string, unknown>) => void;
}

export const NodePresetButton: React.FC<NodePresetButtonProps> = ({
  nodeType,
  nodeId,
  currentProperties,
  onApplyPreset
}) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const {
    presets,
    savePreset,
    _applyPreset,
    _deletePreset,
    _duplicatePreset,
    hasPresets
  } = useNodePresets({
    nodeType,
    nodeId,
    currentProperties
  });

  const handleOpenMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget as HTMLElement);
  }, []);

  const handleCloseMenu = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleApplyPreset = useCallback(
    (properties: Record<string, unknown>) => {
      onApplyPreset(properties);
    },
    [onApplyPreset]
  );

  const handleSavePreset = useCallback(
    (name: string, description?: string) => {
      savePreset(name, description);
    },
    [savePreset]
  );

  return (
    <>
      <Tooltip title={`Presets (${presets.length} saved)`}>
        <IconButton
          size="small"
          onClick={handleOpenMenu}
          sx={{
            color: hasPresets
              ? theme.vars.palette.warning.main
              : theme.vars.palette.text.secondary
          }}
        >
          {hasPresets ? <StarIcon /> : <StarBorderIcon />}
        </IconButton>
      </Tooltip>

      <NodePresetMenu
        nodeType={nodeType}
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleCloseMenu}
        onApplyPreset={handleApplyPreset}
        onSavePreset={handleSavePreset}
        hasCurrentPresets={hasPresets}
      />
    </>
  );
};

export default NodePresetButton;
