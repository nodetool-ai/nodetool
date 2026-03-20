/**
 * SketchLayersPanel
 *
 * Panel for managing layers: visibility, reorder, add, delete, duplicate,
 * rename, opacity, and mask designation.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  IconButton,
  Slider,
  Tooltip,
  Typography,
  Divider,
  Select,
  MenuItem,
  FormControl
} from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import MasksIcon from "@mui/icons-material/Masks";
import CallMergeIcon from "@mui/icons-material/CallMerge";
import LayersIcon from "@mui/icons-material/Layers";
import { Layer, BlendMode } from "./types";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "8px",
    backgroundColor: theme.vars.palette.grey[800],
    borderLeft: `1px solid ${theme.vars.palette.grey[700]}`,
    minWidth: "180px",
    maxWidth: "180px",
    overflowY: "auto",
    "& .section-label": {
      fontSize: "0.7rem",
      fontWeight: 600,
      textTransform: "uppercase",
      color: theme.vars.palette.grey[400]
    },
    "& .layer-item": {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      padding: "4px 6px",
      borderRadius: "4px",
      cursor: "pointer",
      fontSize: "0.75rem",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[700]
      },
      "&.active": {
        backgroundColor: theme.vars.palette.primary.dark,
        color: theme.vars.palette.primary.contrastText
      },
      "&.mask-layer": {
        borderLeft: `2px solid ${theme.vars.palette.warning.main}`
      }
    },
    "& .layer-name": {
      flex: 1,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    "& .layer-actions": {
      display: "flex",
      gap: "2px",
      flexWrap: "wrap",
      justifyContent: "center"
    },
    "& .opacity-row": {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      padding: "0 6px",
      "& .MuiSlider-root": {
        flex: 1
      }
    }
  });

export interface SketchLayersPanelProps {
  layers: Layer[];
  activeLayerId: string;
  maskLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onAddLayer: () => void;
  onRemoveLayer: (layerId: string) => void;
  onDuplicateLayer: (layerId: string) => void;
  onMoveLayerUp: (index: number) => void;
  onMoveLayerDown: (index: number) => void;
  onSetMaskLayer: (layerId: string | null) => void;
  onLayerOpacityChange: (layerId: string, opacity: number) => void;
  onLayerBlendModeChange: (layerId: string, blendMode: BlendMode) => void;
  onRenameLayer: (layerId: string, name: string) => void;
  onMergeDown: () => void;
  onFlattenVisible: () => void;
}

const SketchLayersPanel: React.FC<SketchLayersPanelProps> = ({
  layers,
  activeLayerId,
  maskLayerId,
  onSelectLayer,
  onToggleVisibility,
  onAddLayer,
  onRemoveLayer,
  onDuplicateLayer,
  onMoveLayerUp,
  onMoveLayerDown,
  onSetMaskLayer,
  onLayerOpacityChange,
  onLayerBlendModeChange,
  onRenameLayer,
  onMergeDown,
  onFlattenVisible
}) => {
  const theme = useTheme();
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleStartRename = useCallback(
    (layerId: string, currentName: string) => {
      setEditingLayerId(layerId);
      setEditName(currentName);
    },
    []
  );

  const handleFinishRename = useCallback(
    (layerId: string) => {
      if (editName.trim()) {
        onRenameLayer(layerId, editName.trim());
      }
      setEditingLayerId(null);
    },
    [editName, onRenameLayer]
  );

  const activeLayer = layers.find((l) => l.id === activeLayerId);

  return (
    <Box css={styles(theme)}>
      <Typography className="section-label">Layers</Typography>

      {/* Layer actions */}
      <Box className="layer-actions">
        <Tooltip title="Add Layer">
          <IconButton size="small" onClick={onAddLayer}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete Layer">
          <span>
            <IconButton
              size="small"
              onClick={() => onRemoveLayer(activeLayerId)}
              disabled={layers.length <= 1}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Duplicate Layer">
          <IconButton
            size="small"
            onClick={() => onDuplicateLayer(activeLayerId)}
          >
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip
          title={
            maskLayerId === activeLayerId
              ? "Remove Mask Designation"
              : "Set as Mask Layer"
          }
        >
          <IconButton
            size="small"
            onClick={() =>
              onSetMaskLayer(
                maskLayerId === activeLayerId ? null : activeLayerId
              )
            }
            color={maskLayerId === activeLayerId ? "warning" : "default"}
          >
            <MasksIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Merge Down">
          <IconButton size="small" onClick={onMergeDown}>
            <CallMergeIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Flatten Visible">
          <IconButton size="small" onClick={onFlattenVisible}>
            <LayersIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Divider />

      {/* Layer list (rendered top to bottom = last to first in array) */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {[...layers].reverse().map((layer, reverseIdx) => {
          const realIdx = layers.length - 1 - reverseIdx;
          const isActive = layer.id === activeLayerId;
          const isMask = layer.id === maskLayerId;

          return (
            <Box key={layer.id}>
              <Box
                className={`layer-item${isActive ? " active" : ""}${isMask ? " mask-layer" : ""}`}
                onClick={() => onSelectLayer(layer.id)}
              >
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleVisibility(layer.id);
                  }}
                  sx={{ padding: "2px" }}
                >
                  {layer.visible ? (
                    <VisibilityIcon sx={{ fontSize: "14px" }} />
                  ) : (
                    <VisibilityOffIcon sx={{ fontSize: "14px" }} />
                  )}
                </IconButton>

                {editingLayerId === layer.id ? (
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => handleFinishRename(layer.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleFinishRename(layer.id);
                      }
                      if (e.key === "Escape") {
                        setEditingLayerId(null);
                      }
                    }}
                    autoFocus
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "none",
                      color: "inherit",
                      fontSize: "inherit",
                      outline: "none",
                      padding: "0 2px"
                    }}
                  />
                ) : (
                  <Typography
                    className="layer-name"
                    onDoubleClick={() =>
                      handleStartRename(layer.id, layer.name)
                    }
                  >
                    {layer.name}
                    {isMask && " 🎭"}
                  </Typography>
                )}

                <Box sx={{ display: "flex", gap: 0 }}>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveLayerUp(realIdx);
                    }}
                    disabled={realIdx >= layers.length - 1}
                    sx={{ padding: "2px" }}
                  >
                    <ArrowUpwardIcon sx={{ fontSize: "12px" }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveLayerDown(realIdx);
                    }}
                    disabled={realIdx <= 0}
                    sx={{ padding: "2px" }}
                  >
                    <ArrowDownwardIcon sx={{ fontSize: "12px" }} />
                  </IconButton>
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>

      <Divider />

      {/* Active layer opacity & blend mode */}
      {activeLayer && (
        <>
          <Box className="opacity-row">
            <Typography sx={{ fontSize: "0.7rem", color: "grey.400" }}>
              Opacity
            </Typography>
            <Slider
              size="small"
              min={0}
              max={1}
              step={0.01}
              value={activeLayer.opacity}
              onChange={(_, v) =>
                onLayerOpacityChange(activeLayerId, v as number)
              }
            />
            <Typography sx={{ fontSize: "0.7rem", minWidth: "30px", textAlign: "right" }}>
              {Math.round(activeLayer.opacity * 100)}%
            </Typography>
          </Box>
          <FormControl size="small" sx={{ px: "6px" }}>
            <Select
              value={activeLayer.blendMode || "normal"}
              onChange={(e) =>
                onLayerBlendModeChange(activeLayerId, e.target.value as BlendMode)
              }
              sx={{ fontSize: "0.7rem", height: "28px" }}
            >
              <MenuItem value="normal">Normal</MenuItem>
              <MenuItem value="multiply">Multiply</MenuItem>
              <MenuItem value="screen">Screen</MenuItem>
              <MenuItem value="overlay">Overlay</MenuItem>
              <MenuItem value="darken">Darken</MenuItem>
              <MenuItem value="lighten">Lighten</MenuItem>
              <MenuItem value="color-dodge">Color Dodge</MenuItem>
              <MenuItem value="color-burn">Color Burn</MenuItem>
              <MenuItem value="hard-light">Hard Light</MenuItem>
              <MenuItem value="soft-light">Soft Light</MenuItem>
              <MenuItem value="difference">Difference</MenuItem>
              <MenuItem value="exclusion">Exclusion</MenuItem>
            </Select>
          </FormControl>
        </>
      )}
    </Box>
  );
};

export default memo(SketchLayersPanel);
