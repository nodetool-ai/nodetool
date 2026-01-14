/** @jsxImportSource @emotion/react */
import React, { memo, useCallback } from "react";
import {
  Box,
  Popover,
  Tooltip,
  Typography,
  Divider
} from "@mui/material";
import { useNodes } from "../../contexts/NodeContext";

export const NODE_COLORS = [
  { label: "Default", value: "" },
  { label: "Red", value: "#EF4444" },
  { label: "Orange", value: "#F97316" },
  { label: "Amber", value: "#F59E0B" },
  { label: "Yellow", value: "#EAB308" },
  { label: "Lime", value: "#84CC16" },
  { label: "Green", value: "#22C55E" },
  { label: "Emerald", value: "#10B981" },
  { label: "Teal", value: "#14B8A6" },
  { label: "Cyan", value: "#06B6D4" },
  { label: "Sky", value: "#0EA5E9" },
  { label: "Blue", value: "#3B82F6" },
  { label: "Indigo", value: "#6366F1" },
  { label: "Violet", value: "#8B5CF6" },
  { label: "Purple", value: "#A855F7" },
  { label: "Fuchsia", value: "#D946EF" },
  { label: "Pink", value: "#EC4899" },
  { label: "Rose", value: "#F43F5E" },
] as const;

export type NodeColor = typeof NODE_COLORS[number]["value"];

interface NodeColorPickerProps {
  nodeId: string;
  currentColor: string;
  anchorEl?: HTMLElement | null;
  onClose: () => void;
}

const NodeColorPicker: React.FC<NodeColorPickerProps> = memo(({
  nodeId,
  currentColor,
  anchorEl,
  onClose
}) => {
  const updateNodeData = useNodes((state) => state.updateNodeData);

  const handleColorSelect = useCallback((color: NodeColor) => {
    if (nodeId) {
      updateNodeData(nodeId, { color });
    }
    onClose();
  }, [nodeId, updateNodeData, onClose]);

  const open = Boolean(anchorEl);

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{
        vertical: "bottom",
        horizontal: "left",
      }}
      transformOrigin={{
        vertical: "top",
        horizontal: "left",
      }}
      PaperProps={{
        sx: {
          p: 1,
          bgcolor: "background.paper",
          borderRadius: 2,
          boxShadow: 3
        }
      }}
    >
      <Typography variant="caption" sx={{ display: "block", mb: 1, fontWeight: 600 }}>
        Node Color
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 0.5,
          mb: 1
        }}
      >
        {NODE_COLORS.map((colorOption) => (
          <Tooltip key={colorOption.value} title={colorOption.label} arrow>
            <Box
              onClick={() => handleColorSelect(colorOption.value)}
              sx={{
                width: 28,
                height: 28,
                borderRadius: 1,
                bgcolor: colorOption.value || "grey.300",
                border: currentColor === colorOption.value
                  ? "2px solid"
                  : "1px solid",
                borderColor: currentColor === colorOption.value
                  ? "primary.main"
                  : "divider",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s ease",
                "&:hover": {
                  transform: "scale(1.1)",
                  boxShadow: 1
                }
              }}
            >
              {colorOption.value === "" && (
                <Typography variant="caption" sx={{ fontSize: "10px", color: "text.secondary" }}>
                  ∅
                </Typography>
              )}
            </Box>
          </Tooltip>
        ))}
      </Box>
      <Divider sx={{ my: 1 }} />
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        Click to apply color
      </Typography>
    </Popover>
  );
});

NodeColorPicker.displayName = "NodeColorPicker";

interface ColorIndicatorProps {
  color: string;
  size?: "small" | "medium" | "large";
}

export const ColorIndicator: React.FC<ColorIndicatorProps> = memo(({
  color,
  size = "small"
}) => {
  const sizeMap = {
    small: 12,
    medium: 16,
    large: 20
  };

  if (!color) {
    return null;
  }

  return (
    <Box
      sx={{
        width: sizeMap[size],
        height: sizeMap[size],
        borderRadius: 0.5,
        bgcolor: color,
        border: "1px solid",
        borderColor: "rgba(255,255,255,0.3)",
        flexShrink: 0
      }}
    />
  );
});

ColorIndicator.displayName = "ColorIndicator";

export default NodeColorPicker;
