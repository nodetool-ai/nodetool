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
import { sketchSliderSx, SKETCH_CHECKERBOARD, SKETCH_FONT, SKETCH_SIZE } from "./sketchStyles";
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
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import GradientIcon from "@mui/icons-material/Gradient";
import CallMergeIcon from "@mui/icons-material/CallMerge";
import LayersIcon from "@mui/icons-material/Layers";
import LockIcon from "@mui/icons-material/Lock";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import FlipCameraAndroidIcon from "@mui/icons-material/FlipCameraAndroid";
import { Layer, BlendMode, CANVAS_PRESETS, summarizeLayerImageReference, buildLayersPanelRows, getDescendantIds } from "./types";
import LayerItem from "./LayerItem";
import type { DropPosition } from "./LayerItem";
import HueTriangleColorPicker from "./HueTriangleColorPicker";
import { useCollapsedSections } from "./useCollapsedSections";

type PanelSectionKey = "canvasSize" | "shortcuts";

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
    gap: theme.spacing(1),
    padding: theme.spacing(1.5),
    backgroundColor: theme.vars.palette.grey[800],
    borderLeft: `1px solid ${theme.vars.palette.grey[700]}`,
    width: SKETCH_SIZE.panelWidth,
    minWidth: SKETCH_SIZE.panelWidth,
    maxWidth: SKETCH_SIZE.panelWidth,
    flexShrink: 0,
    overflowY: "auto",
    "& .section-label": {
      fontSize: SKETCH_FONT.md,
      fontWeight: 600,
      textTransform: "uppercase",
      color: theme.vars.palette.grey[400]
    },
    "& .layer-item": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.75),
      padding: `${theme.spacing(0.5)} ${theme.spacing(1)}`,
      borderRadius: SKETCH_SIZE.borderRadius,
      cursor: "pointer",
      fontSize: SKETCH_FONT.md,
      minHeight: SKETCH_SIZE.layerItemHeight,
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[700]
      },
      "&.active": {
        backgroundColor: theme.vars.palette.primary.dark,
        color: theme.vars.palette.primary.contrastText
      },
      "&.selected-secondary": {
        backgroundColor: theme.vars.palette.grey[700],
        boxShadow: `inset 0 0 0 1px ${theme.vars.palette.primary.light}`
      },
      "&.mask-layer": {
        outline: `2px solid ${theme.vars.palette.warning.main}`,
        outlineOffset: "-2px"
      },
      "&.isolated": {
        outline: `1px solid ${theme.vars.palette.warning.main}`,
        outlineOffset: "-1px"
      },
      "&.mask-layer.isolated": {
        outline: `2px solid ${theme.vars.palette.warning.main}`,
        outlineOffset: "-2px"
      }
    },
    "& .layer-thumbnail": {
      width: SKETCH_SIZE.layerThumbnail,
      height: SKETCH_SIZE.layerThumbnail,
      borderRadius: "2px",
      border: `1px solid ${theme.vars.palette.grey[600]}`,
      ...SKETCH_CHECKERBOARD,
      objectFit: "contain",
      flexShrink: 0,
      imageRendering: "pixelated" as const
    },
    "& .layer-thumbnail-empty": {
      width: SKETCH_SIZE.layerThumbnail,
      height: SKETCH_SIZE.layerThumbnail,
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
      flexDirection: "column",
      alignItems: "stretch",
      gap: theme.spacing(0.75)
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
  foregroundColor: string;
  onForegroundColorChange: (color: string) => void;
  layers: Layer[];
  activeLayerId: string;
  /** When length ≥ 2, rows use multi-select highlighting (Ctrl/Cmd+click). */
  selectedLayerIds: string[];
  maskLayerId: string | null;
  isolatedLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
  onToggleLayerInSelection: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onAddLayer: (fillColor?: string | null) => void;
  onRemoveLayer: (layerId: string) => void;
  onDuplicateLayer: (layerId: string) => void;
  onReorderLayers: (fromIndex: number, toIndex: number) => void;
  onSetMaskLayer: (layerId: string | null) => void;
  onToggleAlphaLock: (layerId: string) => void;
  onToggleIsolateLayer: (layerId: string) => void;
  onToggleExposedInput: (layerId: string) => void;
  onToggleExposedOutput: (layerId: string) => void;
  onLayerOpacityChange: (layerId: string, opacity: number) => void;
  onLayerBlendModeChange: (layerId: string, blendMode: BlendMode) => void;
  onRenameLayer: (layerId: string, name: string) => void;
  onClearLayer: () => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  onMergeDown: () => void;
  onFlattenVisible: () => void;
  onTrimLayerToBounds: () => void;
  canvasWidth: number;
  canvasHeight: number;
  onCanvasResize: (width: number, height: number) => void;
  onAddGroup: (name?: string) => void;
  onToggleGroupCollapsed: (groupId: string) => void;
  onMoveLayerToGroup: (layerId: string, groupId: string | null) => void;
  onUngroupLayer: (groupId: string) => void;
  onGroupSelectedLayers: () => void;
  onDeleteSelectedLayers: () => void;
}

const SketchLayersPanel: React.FC<SketchLayersPanelProps> = ({
  foregroundColor,
  onForegroundColorChange,
  layers,
  activeLayerId,
  selectedLayerIds,
  maskLayerId,
  isolatedLayerId,
  onSelectLayer,
  onToggleLayerInSelection,
  onToggleVisibility,
  onAddLayer,
  onRemoveLayer,
  onDuplicateLayer,
  onReorderLayers,
  onSetMaskLayer,
  onToggleAlphaLock,
  onToggleIsolateLayer,
  onToggleExposedInput,
  onToggleExposedOutput,
  onLayerOpacityChange,
  onLayerBlendModeChange,
  onRenameLayer,
  onClearLayer,
  onFlipHorizontal,
  onFlipVertical,
  onMergeDown,
  onFlattenVisible,
  onTrimLayerToBounds,
  canvasWidth,
  canvasHeight,
  onCanvasResize,
  onAddGroup,
  onToggleGroupCollapsed,
  onMoveLayerToGroup,
  onUngroupLayer,
  onGroupSelectedLayers,
  onDeleteSelectedLayers
}) => {
  const theme = useTheme();
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [dropTarget, setDropTarget] = useState<{
    realIdx: number;
    position: DropPosition;
  } | null>(null);
  const dragSourceIndex = useRef<number | null>(null);

  // ─── Collapsible section state (persisted in localStorage) ────────
  const [collapsedSections, handleToggleSection] = useCollapsedSections<PanelSectionKey>(
    "nodetool-sketch-layers-panel-collapsed",
    { canvasSize: true, shortcuts: true }
  );

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

  const handleEditNameChange = useCallback((value: string) => {
    setEditName(value);
  }, []);

  const handleCancelRename = useCallback(() => {
    setEditingLayerId(null);
  }, []);

  const handleLayerRowClick = useCallback(
    (e: React.MouseEvent, layerId: string) => {
      if (e.metaKey || e.ctrlKey) {
        onToggleLayerInSelection(layerId);
      } else {
        onSelectLayer(layerId);
      }
    },
    [onSelectLayer, onToggleLayerInSelection]
  );

  // ─── Drag-and-drop layer reordering (tree-aware) ───────────────
  const handleDragStart = useCallback(
    (realIdx: number) => {
      dragSourceIndex.current = realIdx;
    },
    []
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, realIdx: number) => {
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const y = e.clientY - rect.top;
      const height = rect.height;
      const targetLayer = layers[realIdx];
      let position: DropPosition;

      if (targetLayer && targetLayer.type === "group") {
        // For groups: top 25% = before, middle 50% = into, bottom 25% = after
        if (y < height * 0.25) {
          position = "before";
        } else if (y > height * 0.75) {
          position = "after";
        } else {
          position = "into";
        }
      } else {
        // For non-groups: top half = before, bottom half = after
        position = y < height * 0.5 ? "before" : "after";
      }

      setDropTarget({ realIdx, position });
    },
    [layers]
  );

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback(
    (realIdx: number) => {
      const from = dragSourceIndex.current;
      if (from === null || !dropTarget) {
        dragSourceIndex.current = null;
        setDropTarget(null);
        return;
      }

      const draggedLayer = layers[from];
      const targetLayer = layers[realIdx];
      if (!draggedLayer || !targetLayer || from === realIdx) {
        dragSourceIndex.current = null;
        setDropTarget(null);
        return;
      }

      // Prevent dropping a group into itself or its descendants
      if (draggedLayer.type === "group") {
        const descendantIds = getDescendantIds(layers, draggedLayer.id);
        if (descendantIds.includes(targetLayer.id)) {
          dragSourceIndex.current = null;
          setDropTarget(null);
          return;
        }
      }

      const { position } = dropTarget;

      if (position === "into" && targetLayer.type === "group") {
        // Drop INTO a group: reparent the dragged layer
        onMoveLayerToGroup(draggedLayer.id, targetLayer.id);
      } else {
        // Drop BEFORE or AFTER: reparent to the same parent as the target, then reorder
        const targetParentId = targetLayer.parentId ?? null;
        if ((draggedLayer.parentId ?? null) !== targetParentId) {
          onMoveLayerToGroup(draggedLayer.id, targetParentId);
        }
        // Calculate the target insertion index in the flat array.
        // "after" inserts one position later; "before" inserts at the target's index.
        const insertIdx = position === "after" ? realIdx + 1 : realIdx;
        // After reparenting, the array order hasn't changed; recalculate the
        // source index. Skip the reorder when the layer is already at the
        // target position (currentFrom === insertIdx) or directly before it
        // (currentFrom + 1 === insertIdx), since splice-based reorder would
        // be a no-op in those cases.
        const currentFrom = layers.indexOf(draggedLayer);
        if (currentFrom !== -1 && currentFrom !== insertIdx && currentFrom + 1 !== insertIdx) {
          onReorderLayers(currentFrom, insertIdx > currentFrom ? insertIdx - 1 : insertIdx);
        }
      }

      dragSourceIndex.current = null;
      setDropTarget(null);
    },
    [layers, dropTarget, onReorderLayers, onMoveLayerToGroup]
  );

  const handleDragEnd = useCallback(() => {
    dragSourceIndex.current = null;
    setDropTarget(null);
  }, []);

  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const activeLayerFlatIndex = activeLayer ? layers.indexOf(activeLayer) : -1;
  const canMergeDown = activeLayerFlatIndex > 0;
  const pixelLayerCanvasActionsDisabled =
    !activeLayer || activeLayer.locked || activeLayer.type === "group";

  return (
    <Box className="sketch-layers-panel" css={styles(theme)}>
      {/* ── Color Selector ── */}
      <HueTriangleColorPicker
        color={foregroundColor}
        onColorChange={onForegroundColorChange}
      />

      <Typography className="section-label sketch-layers-panel__title">
        Layers
      </Typography>
      <Typography
        sx={{
          fontSize: "0.62rem",
          color: "grey.500",
          lineHeight: 1.35,
          mb: 0.5
        }}
      >
        Ctrl+click (⌘+click) layers to multi-select. Wrap as group only works for adjacent
        layers with the same parent. Pixel grid appears from 200% zoom.
      </Typography>

      {/* Add layers (row 1) + layer ops (row 2), left-aligned for predictable icon positions */}
      <Box className="layer-actions">
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 0.5,
            rowGap: 0.5
          }}
        >
          <Tooltip title="Add Transparent Layer">
            <IconButton
              size="small"
              onClick={() => onAddLayer(null)}
              sx={{
                width: 26,
                height: 26,
                padding: 0,
                borderRadius: "3px",
                border: `1px solid ${theme.vars.palette.grey[500]}`,
                background: `repeating-conic-gradient(${theme.vars.palette.grey[600]} 0% 25%, ${theme.vars.palette.grey[800]} 0% 50%) 50% / 8px 8px`,
                "&:hover": { borderColor: theme.vars.palette.grey[300] }
              }}
            >
              <AddIcon sx={{ fontSize: "14px", color: theme.vars.palette.grey[400] }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Add Black Layer">
            <IconButton
              size="small"
              onClick={() => onAddLayer("#000000")}
              sx={{
                width: 26,
                height: 26,
                padding: 0,
                borderRadius: "3px",
                border: `1px solid ${theme.vars.palette.grey[500]}`,
                backgroundColor: "#000000",
                "&:hover": { borderColor: theme.vars.palette.grey[300], backgroundColor: "#111111" }
              }}
            >
              <AddIcon sx={{ fontSize: "14px", color: theme.vars.palette.grey[500] }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Add White Layer">
            <IconButton
              size="small"
              onClick={() => onAddLayer("#ffffff")}
              sx={{
                width: 26,
                height: 26,
                padding: 0,
                borderRadius: "3px",
                border: `1px solid ${theme.vars.palette.grey[500]}`,
                backgroundColor: "#ffffff",
                "&:hover": { borderColor: theme.vars.palette.grey[300], backgroundColor: "#eeeeee" }
              }}
            >
              <AddIcon sx={{ fontSize: "14px", color: theme.vars.palette.grey[600] }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Add Gray Layer">
            <IconButton
              size="small"
              onClick={() => onAddLayer("#808080")}
              sx={{
                width: 26,
                height: 26,
                padding: 0,
                borderRadius: "3px",
                border: `1px solid ${theme.vars.palette.grey[500]}`,
                backgroundColor: "#808080",
                "&:hover": { borderColor: theme.vars.palette.grey[300], backgroundColor: "#999999" }
              }}
            >
              <AddIcon sx={{ fontSize: "14px", color: theme.vars.palette.grey[300] }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="New empty layer group (folder)">
            <IconButton
              size="small"
              onClick={() => onAddGroup()}
              sx={{
                width: 26,
                height: 26,
                padding: 0,
                borderRadius: "3px",
                border: `1px solid ${theme.vars.palette.grey[500]}`,
                backgroundColor: theme.vars.palette.grey[700],
                "&:hover": { borderColor: theme.vars.palette.grey[300], backgroundColor: theme.vars.palette.grey[600] }
              }}
            >
              <CreateNewFolderIcon sx={{ fontSize: "14px", color: theme.vars.palette.grey[400] }} />
            </IconButton>
          </Tooltip>
        </Box>
        <Button
          size="small"
          variant="text"
          onClick={() => onAddGroup()}
          sx={{
            fontSize: "0.65rem",
            py: 0.25,
            px: 0.5,
            minHeight: 0,
            color: "grey.400",
            justifyContent: "flex-start",
            textTransform: "none",
            "&:hover": { color: "grey.200", bgcolor: "grey.800" }
          }}
        >
          + New empty group
        </Button>
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 0.25,
            rowGap: 0.25,
            "& .MuiIconButton-root": {
              width: 30,
              height: 30,
              padding: theme.spacing(0.25)
            }
          }}
        >
          <Tooltip title="Duplicate Layer">
            <IconButton size="small" onClick={() => onDuplicateLayer(activeLayerId)}>
              <ContentCopyIcon sx={{ fontSize: "1.125rem" }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete Layer">
            <span>
              <IconButton
                size="small"
                onClick={() => onRemoveLayer(activeLayerId)}
                disabled={layers.length <= 1}
              >
                <DeleteIcon sx={{ fontSize: "1.125rem" }} />
              </IconButton>
            </span>
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
              <GradientIcon sx={{ fontSize: "1.125rem" }} />
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
              <LockIcon sx={{ fontSize: "1.125rem" }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Trim Active Layer To Bounds">
            <IconButton
              size="small"
              onClick={onTrimLayerToBounds}
              disabled={!activeLayer || activeLayer.locked}
            >
              <FitScreenIcon sx={{ fontSize: "1.125rem" }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Flatten Visible">
            <IconButton size="small" onClick={onFlattenVisible}>
              <LayersIcon sx={{ fontSize: "1.125rem" }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Divider />

      {/* Layer list (rendered top to bottom = last to first in array, tree-aware) */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {buildLayersPanelRows(layers).map(({ layer, depth }) => {
          const realIdx = layers.indexOf(layer);
          const isPaintTarget = layer.id === activeLayerId;
          const isRowSelected =
            selectedLayerIds.length >= 2
              ? selectedLayerIds.includes(layer.id)
              : layer.id === activeLayerId;
          return (
            <LayerItem
              key={layer.id}
              layer={layer}
              realIdx={realIdx}
              depth={depth}
              isPaintTarget={isPaintTarget}
              isRowSelected={isRowSelected}
              isMask={layer.id === maskLayerId}
              isIsolated={layer.id === isolatedLayerId}
              dropPosition={dropTarget?.realIdx === realIdx ? dropTarget.position : null}
              editingLayerId={editingLayerId}
              editName={editName}
              onLayerRowClick={handleLayerRowClick}
              onToggleVisibility={onToggleVisibility}
              onToggleIsolateLayer={onToggleIsolateLayer}
              onToggleExposedInput={onToggleExposedInput}
              onToggleExposedOutput={onToggleExposedOutput}
              onStartRename={handleStartRename}
              onFinishRename={handleFinishRename}
              onEditNameChange={handleEditNameChange}
              onCancelRename={handleCancelRename}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              onToggleGroupCollapsed={onToggleGroupCollapsed}
            />
          );
        })}
      </Box>

      <Divider />

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 0.5,
          minHeight: 30,
          py: 0.25
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, minHeight: 30 }}>
          {selectedLayerIds.length >= 2 ? (
            <>
              <Tooltip title="Group selected layers (adjacent siblings, same parent)">
                <IconButton size="small" onClick={onGroupSelectedLayers}>
                  <CreateNewFolderIcon sx={{ fontSize: "1.125rem" }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete selected layers">
                <IconButton size="small" color="error" onClick={onDeleteSelectedLayers}>
                  <DeleteIcon sx={{ fontSize: "1.125rem" }} />
                </IconButton>
              </Tooltip>
            </>
          ) : null}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, minHeight: 30 }}>
          {activeLayer?.type === "group" ? (
            <Tooltip title="Ungroup">
              <IconButton size="small" onClick={() => onUngroupLayer(activeLayerId)}>
                <FolderOpenIcon sx={{ fontSize: "1.125rem" }} />
              </IconButton>
            </Tooltip>
          ) : null}
        </Box>
      </Box>

      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 0.25,
          minHeight: 30,
          py: 0.25,
          "& .MuiIconButton-root": { width: 30, height: 30 }
        }}
      >
        <Tooltip title="Clear Layer (Delete)">
          <span>
            <IconButton
              size="small"
              onClick={onClearLayer}
              disabled={pixelLayerCanvasActionsDisabled}
            >
              <DeleteOutlineIcon sx={{ fontSize: "1.125rem" }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Flip Layer Horizontal">
          <span>
            <IconButton
              size="small"
              onClick={onFlipHorizontal}
              disabled={pixelLayerCanvasActionsDisabled}
            >
              <FlipCameraAndroidIcon sx={{ fontSize: "1.125rem" }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Flip Layer Vertical">
          <span>
            <IconButton
              size="small"
              onClick={onFlipVertical}
              disabled={pixelLayerCanvasActionsDisabled}
            >
              <FlipCameraAndroidIcon sx={{ fontSize: "1.125rem", transform: "rotate(90deg)" }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Merge Down">
          <span>
            <IconButton size="small" onClick={onMergeDown} disabled={!canMergeDown}>
              <CallMergeIcon sx={{ fontSize: "1.125rem" }} />
            </IconButton>
          </span>
        </Tooltip>
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
              sx={sketchSliderSx}
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
          {activeLayer.imageReference ? (
            <Box sx={{ px: "6px", pt: "4px" }}>
              <Typography
                sx={{
                  fontSize: "0.6rem",
                  color: "grey.500",
                  lineHeight: 1.35,
                  wordBreak: "break-all",
                  fontFamily: "monospace"
                }}
              >
                {summarizeLayerImageReference(activeLayer.imageReference)}
              </Typography>
              {activeLayer.locked ? (
                <Typography sx={{ fontSize: "0.58rem", color: "grey.600", mt: "4px" }}>
                  Reference layer: pixels locked; move and nudge still apply transform.
                </Typography>
              ) : null}
            </Box>
          ) : null}
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
        <Select
          size="small"
          displayEmpty
          value=""
          onChange={(e) => {
            const preset = CANVAS_PRESETS.find((p) => p.label === e.target.value);
            if (preset) {
              onCanvasResize(preset.width, preset.height);
            }
          }}
          sx={{
            width: "100%",
            fontSize: "0.65rem",
            "& .MuiSelect-select": { padding: "3px 8px" }
          }}
          renderValue={() => {
            const match = CANVAS_PRESETS.find(
              (p) => p.width === canvasWidth && p.height === canvasHeight
            );
            return (
              <Typography sx={{ fontSize: "0.65rem", color: match ? "grey.200" : "grey.500" }}>
                {match ? match.label : "Presets…"}
              </Typography>
            );
          }}
        >
          {CANVAS_PRESETS.map((preset) => (
            <MenuItem key={preset.label} value={preset.label} sx={{ fontSize: "0.65rem" }}>
              {preset.label} — {preset.width}×{preset.height}
            </MenuItem>
          ))}
        </Select>
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
