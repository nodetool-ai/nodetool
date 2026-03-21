/**
 * SketchLayersPanel
 *
 * Panel for managing layers: visibility, reorder, add, delete, duplicate,
 * rename, opacity, and mask designation. Also contains canvas size presets
 * and keyboard shortcuts reference.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useEffect, useState, useRef } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  Button,
  IconButton,
  Slider,
  TextField,
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
import GradientIcon from "@mui/icons-material/Gradient";
import CallMergeIcon from "@mui/icons-material/CallMerge";
import LayersIcon from "@mui/icons-material/Layers";
import LockIcon from "@mui/icons-material/Lock";
import FilterNoneIcon from "@mui/icons-material/FilterNone";
import InputIcon from "@mui/icons-material/Input";
import OutputIcon from "@mui/icons-material/Output";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { Layer, BlendMode, CANVAS_PRESETS } from "./types";

// ─── Collapsible section persistence for right panel ──────────────────────
const COLLAPSED_SECTIONS_KEY = "nodetool-sketch-layers-panel-collapsed";

type PanelSectionKey = "canvasSize" | "shortcuts";

function loadCollapsedSections(): Record<PanelSectionKey, boolean> {
  try {
    const stored = localStorage.getItem(COLLAPSED_SECTIONS_KEY);
    if (stored) {
      return JSON.parse(stored) as Record<PanelSectionKey, boolean>;
    }
  } catch {
    // localStorage parse failed, use defaults
  }
  return { canvasSize: true, shortcuts: true };
}

function saveCollapsedSections(state: Record<PanelSectionKey, boolean>): void {
  try {
    localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify(state));
  } catch {
    // localStorage write failed, ignore
  }
}

// ─── Collapsible PanelSection component ───────────────────────────────────

interface PanelSectionProps {
  title: string;
  sectionKey: PanelSectionKey;
  collapsed: boolean;
  onToggle: (key: PanelSectionKey) => void;
  children: React.ReactNode;
}

const PanelSection = memo(function PanelSection({
  title,
  sectionKey,
  collapsed,
  onToggle,
  children
}: PanelSectionProps) {
  const handleClick = useCallback(() => {
    onToggle(sectionKey);
  }, [sectionKey, onToggle]);

  return (
    <>
      <Box
        onClick={handleClick}
        sx={{
          display: "flex",
          alignItems: "center",
          cursor: "pointer",
          userSelect: "none",
          mt: "2px",
          "&:hover": {
            "& .section-label": { color: "grey.200" },
            "& .collapse-icon": { color: "grey.200" }
          }
        }}
      >
        {collapsed ? (
          <ChevronRightIcon
            className="collapse-icon"
            sx={{ fontSize: "0.85rem", color: "grey.500", mr: "2px" }}
          />
        ) : (
          <ExpandMoreIcon
            className="collapse-icon"
            sx={{ fontSize: "0.85rem", color: "grey.500", mr: "2px" }}
          />
        )}
        <Typography className="section-label">{title}</Typography>
      </Box>
      {!collapsed && children}
    </>
  );
});

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
      minHeight: "36px",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[700]
      },
      "&.active": {
        backgroundColor: theme.vars.palette.primary.dark,
        color: theme.vars.palette.primary.contrastText
      },
      "&.mask-layer": {
        borderLeft: `2px solid ${theme.vars.palette.warning.main}`
      },
      "&.isolated": {
        outline: `1px solid ${theme.vars.palette.warning.main}`,
        outlineOffset: "-1px"
      }
    },
    "& .layer-thumbnail": {
      width: "28px",
      height: "28px",
      borderRadius: "2px",
      border: `1px solid ${theme.vars.palette.grey[600]}`,
      backgroundColor: theme.vars.palette.grey[900],
      objectFit: "contain",
      flexShrink: 0,
      imageRendering: "pixelated" as const
    },
    "& .layer-thumbnail-empty": {
      width: "28px",
      height: "28px",
      borderRadius: "2px",
      border: `1px solid ${theme.vars.palette.grey[600]}`,
      backgroundColor: theme.vars.palette.grey[900],
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "0.5rem",
      color: theme.vars.palette.grey[500]
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
    },
    "& .hex-input": {
      "& .MuiInputBase-root": {
        fontSize: "0.7rem",
        height: "28px"
      },
      "& .MuiInputBase-input": {
        padding: "4px 8px"
      }
    }
  });

export interface SketchLayersPanelProps {
  layers: Layer[];
  activeLayerId: string;
  maskLayerId: string | null;
  isolatedLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onAddLayer: (fillColor?: string | null) => void;
  onRemoveLayer: (layerId: string) => void;
  onDuplicateLayer: (layerId: string) => void;
  onMoveLayerUp: (index: number) => void;
  onMoveLayerDown: (index: number) => void;
  onReorderLayers: (fromIndex: number, toIndex: number) => void;
  onSetMaskLayer: (layerId: string | null) => void;
  onToggleAlphaLock: (layerId: string) => void;
  onToggleIsolateLayer: (layerId: string) => void;
  onToggleExposedInput: (layerId: string) => void;
  onToggleExposedOutput: (layerId: string) => void;
  onLayerOpacityChange: (layerId: string, opacity: number) => void;
  onLayerBlendModeChange: (layerId: string, blendMode: BlendMode) => void;
  onRenameLayer: (layerId: string, name: string) => void;
  onMergeDown: () => void;
  onFlattenVisible: () => void;
  canvasWidth: number;
  canvasHeight: number;
  onCanvasResize: (width: number, height: number) => void;
}

const SketchLayersPanel: React.FC<SketchLayersPanelProps> = ({
  layers,
  activeLayerId,
  maskLayerId,
  isolatedLayerId,
  onSelectLayer,
  onToggleVisibility,
  onAddLayer,
  onRemoveLayer,
  onDuplicateLayer,
  onMoveLayerUp,
  onMoveLayerDown,
  onReorderLayers,
  onSetMaskLayer,
  onToggleAlphaLock,
  onToggleIsolateLayer,
  onToggleExposedInput,
  onToggleExposedOutput,
  onLayerOpacityChange,
  onLayerBlendModeChange,
  onRenameLayer,
  onMergeDown,
  onFlattenVisible,
  canvasWidth,
  canvasHeight,
  onCanvasResize
}) => {
  const theme = useTheme();
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragSourceIndex = useRef<number | null>(null);

  // ─── Collapsible section state (persisted in localStorage) ────────
  const [collapsedSections, setCollapsedSections] = useState<Record<PanelSectionKey, boolean>>(
    loadCollapsedSections
  );

  const handleToggleSection = useCallback((key: PanelSectionKey) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveCollapsedSections(next);
      return next;
    });
  }, []);

  // ─── Custom canvas size state ─────────────────────────────────────
  const [customWidth, setCustomWidth] = useState(String(canvasWidth));
  const [customHeight, setCustomHeight] = useState(String(canvasHeight));

  useEffect(() => {
    setCustomWidth(String(canvasWidth));
    setCustomHeight(String(canvasHeight));
  }, [canvasWidth, canvasHeight]);

  const handleApplyCustomSize = useCallback(() => {
    const w = parseInt(customWidth, 10);
    const h = parseInt(customHeight, 10);
    if (w > 0 && h > 0 && w <= 4096 && h <= 4096) {
      onCanvasResize(w, h);
    }
  }, [customWidth, customHeight, onCanvasResize]);

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

  // ─── Drag-and-drop layer reordering ─────────────────────────────
  const handleDragStart = useCallback(
    (realIdx: number) => {
      dragSourceIndex.current = realIdx;
    },
    []
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, realIdx: number) => {
      e.preventDefault();
      setDragOverIndex(realIdx);
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback(
    (realIdx: number) => {
      const from = dragSourceIndex.current;
      if (from !== null && from !== realIdx) {
        onReorderLayers(from, realIdx);
      }
      dragSourceIndex.current = null;
      setDragOverIndex(null);
    },
    [onReorderLayers]
  );

  const handleDragEnd = useCallback(() => {
    dragSourceIndex.current = null;
    setDragOverIndex(null);
  }, []);

  const activeLayer = layers.find((l) => l.id === activeLayerId);

  return (
    <Box css={styles(theme)}>
      <Typography className="section-label">Layers</Typography>

      {/* Add layer with color presets */}
      <Box className="layer-actions" sx={{ gap: "3px !important" }}>
        <Tooltip title="Add Transparent Layer">
          <IconButton
            size="small"
            onClick={() => onAddLayer(null)}
            sx={{
              width: 22,
              height: 22,
              padding: 0,
              borderRadius: "3px",
              border: `1px solid ${theme.vars.palette.grey[500]}`,
              background: `repeating-conic-gradient(${theme.vars.palette.grey[600]} 0% 25%, ${theme.vars.palette.grey[800]} 0% 50%) 50% / 8px 8px`,
              "&:hover": { borderColor: theme.vars.palette.grey[300] }
            }}
          >
            <AddIcon sx={{ fontSize: "12px", color: theme.vars.palette.grey[400] }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Add Black Layer">
          <IconButton
            size="small"
            onClick={() => onAddLayer("#000000")}
            sx={{
              width: 22,
              height: 22,
              padding: 0,
              borderRadius: "3px",
              border: `1px solid ${theme.vars.palette.grey[500]}`,
              backgroundColor: "#000000",
              "&:hover": { borderColor: theme.vars.palette.grey[300], backgroundColor: "#111111" }
            }}
          >
            <AddIcon sx={{ fontSize: "12px", color: theme.vars.palette.grey[500] }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Add White Layer">
          <IconButton
            size="small"
            onClick={() => onAddLayer("#ffffff")}
            sx={{
              width: 22,
              height: 22,
              padding: 0,
              borderRadius: "3px",
              border: `1px solid ${theme.vars.palette.grey[500]}`,
              backgroundColor: "#ffffff",
              "&:hover": { borderColor: theme.vars.palette.grey[300], backgroundColor: "#eeeeee" }
            }}
          >
            <AddIcon sx={{ fontSize: "12px", color: theme.vars.palette.grey[600] }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Add Gray Layer">
          <IconButton
            size="small"
            onClick={() => onAddLayer("#808080")}
            sx={{
              width: 22,
              height: 22,
              padding: 0,
              borderRadius: "3px",
              border: `1px solid ${theme.vars.palette.grey[500]}`,
              backgroundColor: "#808080",
              "&:hover": { borderColor: theme.vars.palette.grey[300], backgroundColor: "#999999" }
            }}
          >
            <AddIcon sx={{ fontSize: "12px", color: theme.vars.palette.grey[300] }} />
          </IconButton>
        </Tooltip>
        <Box sx={{ width: "4px" }} />
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
            <GradientIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip
          title={
            layers.find((l) => l.id === activeLayerId)?.alphaLock
              ? "Unlock Transparency"
              : "Lock Transparency"
          }
        >
          <IconButton
            size="small"
            onClick={() => onToggleAlphaLock(activeLayerId)}
            color={
              layers.find((l) => l.id === activeLayerId)?.alphaLock
                ? "info"
                : "default"
            }
          >
            <LockIcon fontSize="small" />
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
          const isIsolated = layer.id === isolatedLayerId;
          const isDragOver = dragOverIndex === realIdx;

          return (
            <Box key={layer.id}>
              <Box
                className={`layer-item${isActive ? " active" : ""}${isMask ? " mask-layer" : ""}${isIsolated ? " isolated" : ""}`}
                draggable
                onDragStart={() => handleDragStart(realIdx)}
                onDragOver={(e) => handleDragOver(e, realIdx)}
                onDragLeave={handleDragLeave}
                onDrop={() => handleDrop(realIdx)}
                onDragEnd={handleDragEnd}
                onClick={() => onSelectLayer(layer.id)}
                sx={isDragOver ? {
                  borderTop: "2px solid",
                  borderTopColor: "primary.main"
                } : undefined}
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

                <Tooltip title={isIsolated ? "Show all layers" : "Solo this layer"} placement="top">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleIsolateLayer(layer.id);
                    }}
                    sx={{
                      padding: "2px",
                      color: isIsolated ? "warning.main" : undefined,
                      opacity: isIsolated ? 1 : 0.4,
                      "&:hover": { opacity: 1 }
                    }}
                  >
                    <FilterNoneIcon sx={{ fontSize: "12px" }} />
                  </IconButton>
                </Tooltip>

                {/* Layer thumbnail preview */}
                {layer.data ? (
                  <img
                    className="layer-thumbnail"
                    src={layer.data}
                    alt={layer.name}
                    draggable={false}
                  />
                ) : (
                  <Box className="layer-thumbnail-empty" />
                )}

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
                    {layer.alphaLock && " 🔒"}
                  </Typography>
                )}

                <Box sx={{ display: "flex", gap: 0, ml: "auto" }}>
                  <Tooltip title={layer.exposedAsInput ? "Remove input handle" : "Expose as input"}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleExposedInput(layer.id);
                      }}
                      sx={{
                        padding: "1px",
                        color: layer.exposedAsInput ? "info.main" : "grey.600",
                        opacity: layer.exposedAsInput ? 1 : 0.5,
                        "&:hover": { opacity: 1 }
                      }}
                    >
                      <InputIcon sx={{ fontSize: "11px" }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={layer.exposedAsOutput ? "Remove output handle" : "Expose as output"}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleExposedOutput(layer.id);
                      }}
                      sx={{
                        padding: "1px",
                        color: layer.exposedAsOutput ? "success.main" : "grey.600",
                        opacity: layer.exposedAsOutput ? 1 : 0.5,
                        "&:hover": { opacity: 1 }
                      }}
                    >
                      <OutputIcon sx={{ fontSize: "11px" }} />
                    </IconButton>
                  </Tooltip>
                </Box>

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

      {/* Push bottom sections down */}
      <Box sx={{ marginTop: "auto" }} />

      <Divider />

      {/* ── Canvas Size (collapsible, collapsed by default) ────────── */}
      <PanelSection
        title="Canvas Size"
        sectionKey="canvasSize"
        collapsed={collapsedSections.canvasSize}
        onToggle={handleToggleSection}
      >
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
          {CANVAS_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              size="small"
              variant={canvasWidth === preset.width && canvasHeight === preset.height ? "contained" : "outlined"}
              onClick={() => onCanvasResize(preset.width, preset.height)}
              sx={{
                fontSize: "0.6rem",
                py: "2px",
                px: "6px",
                minWidth: 0,
                color: canvasWidth === preset.width && canvasHeight === preset.height ? undefined : "grey.400",
                borderColor: "grey.600"
              }}
            >
              {preset.label}
            </Button>
          ))}
        </Box>
        <Box sx={{ display: "flex", gap: "4px", mt: "6px", alignItems: "center" }}>
          <TextField
            className="hex-input"
            size="small"
            label="W"
            type="number"
            value={customWidth}
            onChange={(e) => setCustomWidth(e.target.value)}
            inputProps={{ min: 1, max: 4096, step: 1 }}
            sx={{ flex: 1, "& .MuiInputLabel-root": { fontSize: "0.65rem" } }}
          />
          <Typography sx={{ fontSize: "0.7rem", color: "grey.500" }}>×</Typography>
          <TextField
            className="hex-input"
            size="small"
            label="H"
            type="number"
            value={customHeight}
            onChange={(e) => setCustomHeight(e.target.value)}
            inputProps={{ min: 1, max: 4096, step: 1 }}
            sx={{ flex: 1, "& .MuiInputLabel-root": { fontSize: "0.65rem" } }}
          />
        </Box>
        <Button
          size="small"
          variant="contained"
          fullWidth
          onClick={handleApplyCustomSize}
          sx={{ mt: "4px", fontSize: "0.7rem", py: "2px" }}
        >
          Apply
        </Button>
      </PanelSection>

      <Divider />

      {/* ── Shortcuts reference (collapsible, collapsed by default) ─ */}
      <PanelSection
        title="Shortcuts"
        sectionKey="shortcuts"
        collapsed={collapsedSections.shortcuts}
        onToggle={handleToggleSection}
      >
        <Box
          component="dl"
          sx={{
            fontSize: "0.72rem",
            color: "grey.400",
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "1px 6px",
            m: 0,
            "& dt": { fontWeight: 700, color: "grey.300", textAlign: "right" },
            "& dd": { m: 0 }
          }}
        >
          <dt>V</dt><dd>Move</dd>
          <dt>B</dt><dd>Brush</dd>
          <dt>P</dt><dd>Pencil</dd>
          <dt>E</dt><dd>Eraser</dd>
          <dt>G</dt><dd>Fill</dd>
          <dt>I</dt><dd>Eyedropper</dd>
          <dt>Q</dt><dd>Blur</dd>
          <dt>L</dt><dd>Line</dd>
          <dt>R</dt><dd>Rect</dd>
          <dt>O</dt><dd>Ellipse</dd>
          <dt>A</dt><dd>Arrow</dd>
          <dt>T</dt><dd>Gradient</dd>
          <dt>C</dt><dd>Crop</dd>
          <dt>M</dt><dd>Mirror H</dd>
          <dt>Shift+M</dt><dd>Mirror V</dd>
          <dt>X</dt><dd>Swap colors</dd>
          <dt>D</dt><dd>Reset colors</dd>
          <dt>Tab</dt><dd>Toggle UI</dd>
          <dt>[ / ]</dt><dd>Brush size</dd>
          <dt>Shift+[/]</dt><dd>Hardness</dd>
          <dt>0–9</dt><dd>Opacity</dd>
          <dt>Alt+Click</dt><dd>Pick color</dd>
          <dt>Alt+⌫</dt><dd>Fill FG</dd>
          <dt>Ctrl+⌫</dt><dd>Fill BG</dd>
          <dt>Shift</dt><dd>Constrain</dd>
          <dt>Space</dt><dd>Pan</dd>
          <dt>+ / −</dt><dd>Zoom</dd>
          <dt>Ctrl+0</dt><dd>Reset view</dd>
          <dt>Del</dt><dd>Clear layer</dd>
          <dt>Ctrl+S</dt><dd>Export</dd>
        </Box>
      </PanelSection>
    </Box>
  );
};

export default memo(SketchLayersPanel);
