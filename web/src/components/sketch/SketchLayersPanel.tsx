/**
 * SketchLayersPanel
 *
 * Panel for managing layers: visibility, reorder, add, delete, duplicate,
 * rename, opacity, and mask designation. Also contains canvas size presets
 * and keyboard shortcuts reference.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useEffect, useState, useRef, useMemo } from "react";
import {
  sketchSliderSx,
  SKETCH_CHECKERBOARD,
  SKETCH_COLORS,
  SKETCH_FONT,
  SKETCH_SIZE,
  SKETCH_SPACING,
  SKETCH_TOOLTIP_DELAY_MS
} from "./sketchStyles";
import { alpha, useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  Button,
  IconButton,
  Menu,
  Slider,
  TextField,
  Tooltip,
  Typography,
  Divider,
  Select,
  MenuItem,
  FormControl,
  Switch
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
import {
  Layer,
  BlendMode,
  CANVAS_PRESETS,
  coerceBlendMode,
  summarizeLayerImageReference,
  buildLayersPanelRows,
  getDescendantIds
} from "./types";
import LayerItem from "./LayerItem";
import type { DropPosition } from "./LayerItem";
import HueTriangleColorPicker from "./HueTriangleColorPicker";
import { useCollapsedSections } from "./useCollapsedSections";
import { getMergeSelectedLayersPlan } from "./layerMergeSelection";
import {
  ACTION_REGISTRY,
  BINDING_CATALOG,
  displayBinding,
  type DisplayGroup,
  type SketchActionId
} from "./shortcuts";

/**
 * Layer row modifiers: `getModifierState` helps when `draggable` rows omit flags on
 * pointer events. Shift = range select; Ctrl/Cmd = toggle add/remove.
 */
function layerRowShiftHeld(e: React.MouseEvent | React.PointerEvent): boolean {
  const n = e.nativeEvent;
  if (n.shiftKey) {
    return true;
  }
  if ("getModifierState" in n && typeof n.getModifierState === "function") {
    return n.getModifierState("Shift");
  }
  return false;
}

function layerRowCtrlOrMetaHeld(
  e: React.MouseEvent | React.PointerEvent
): boolean {
  const n = e.nativeEvent;
  if (n.metaKey || n.ctrlKey) {
    return true;
  }
  if ("getModifierState" in n && typeof n.getModifierState === "function") {
    return n.getModifierState("Control") || n.getModifierState("Meta");
  }
  return false;
}

function layerRowHasMultiSelectModifier(
  e: React.MouseEvent | React.PointerEvent
): boolean {
  return layerRowShiftHeld(e) || layerRowCtrlOrMetaHeld(e);
}

const QUICK_CYCLE_BLEND_MODES: readonly BlendMode[] = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion"
];

function cycleArrayValue<T>(
  values: readonly T[],
  currentIndex: number,
  direction: -1 | 1
): T | null {
  if (values.length === 0) {
    return null;
  }
  const nextIndex =
    currentIndex >= 0
      ? Math.max(0, Math.min(values.length - 1, currentIndex + direction))
      : direction > 0
        ? 0
        : values.length - 1;
  return values[nextIndex] ?? null;
}

function quickCycleDirectionForArrowKey(key: string): -1 | 1 | null {
  if (key === "ArrowUp" || key === "ArrowLeft") {
    return -1;
  }
  if (key === "ArrowDown" || key === "ArrowRight") {
    return 1;
  }
  return null;
}

type PanelSectionKey = "canvasSize" | "shortcuts";
const SHORTCUT_DISPLAY_GROUPS: readonly DisplayGroup[] = [
  "Tools",
  "Edit",
  "Selection",
  "Canvas",
  "Color",
  "Paint",
  "Layers",
  "Mode: Transform",
  "Mode: Crop"
];
const PANEL_SHORTCUT_NOTES: Partial<Record<SketchActionId, string>> = {
  "blend-mode-prev": "Blend mode dropdown",
  "blend-mode-next": "Blend mode dropdown",
  "canvas-preset-prev": "Canvas preset dropdown",
  "canvas-preset-next": "Canvas preset dropdown"
};

function formatShortcutCombos(
  entries: typeof BINDING_CATALOG
): string {
  const digitEntries = entries
    .filter(
      (entry) =>
        entry.scope === "global" &&
        !entry.modifiers.ctrl &&
        !entry.modifiers.shift &&
        !entry.modifiers.alt &&
        /^\d$/.test(entry.key)
    )
    .map((entry) => Number(entry.key))
    .sort((a, b) => a - b);

  if (
    digitEntries.length === entries.length &&
    digitEntries.length > 1 &&
    digitEntries.every((digit, index) => digit === index)
  ) {
    return `${digitEntries[0]}–${digitEntries[digitEntries.length - 1]}`;
  }

  return [...new Set(entries.map((entry) => displayBinding(entry)))].join(" / ");
}

const ShortcutReference = memo(function ShortcutReference() {
  const groups = SHORTCUT_DISPLAY_GROUPS.map((displayGroup) => {
    const rows = ACTION_REGISTRY.flatMap((action) => {
      if (action.displayGroup !== displayGroup) {
        return [];
      }

      const entries = BINDING_CATALOG.filter((entry) => entry.actionId === action.id);
      if (entries.length === 0) {
        return [];
      }

      return [{
        actionId: action.id,
        combo: formatShortcutCombos(entries),
        label: action.label,
        note: PANEL_SHORTCUT_NOTES[action.id]
      }];
    });

    return {
      displayGroup,
      rows
    };
  }).filter((group) => group.rows.length > 0);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {groups.map((group) => (
        <Box key={group.displayGroup}>
          <Typography
            sx={{
              mb: 0.5,
              fontSize: SKETCH_FONT.xs,
              fontWeight: 700,
              color: "grey.400",
              textTransform: "uppercase",
              letterSpacing: "0.04em"
            }}
          >
            {group.displayGroup}
          </Typography>
          <Box
            component="dl"
            sx={{
              fontSize: SKETCH_FONT.section,
              color: SKETCH_COLORS.textMuted,
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "1px 6px",
              m: 0,
              "& dt": { fontWeight: 700, color: "grey.300", textAlign: "right" },
              "& dd": { m: 0 }
            }}
          >
            {group.rows.map((row) => (
              <React.Fragment key={row.actionId}>
                <dt>{row.combo}</dt>
                <dd>
                  {row.label}
                  {row.note ? ` — ${row.note}` : ""}
                </dd>
              </React.Fragment>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
});

// ─── Collapsible PanelSection component ───────────────────────────────────

interface PanelSectionProps {
  title: string;
  sectionKey: PanelSectionKey;
  collapsed: boolean;
  onToggle: (key: PanelSectionKey) => void;
  children: React.ReactNode;
  /** Optional control on the right (e.g. toggle); click does not collapse the section. */
  titleEndAdornment?: React.ReactNode;
}

const PanelSection = memo(function PanelSection({
  title,
  sectionKey,
  collapsed,
  onToggle,
  children,
  titleEndAdornment
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
          width: "100%",
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
        <Typography className="section-label" sx={{ flex: 1 }}>
          {title}
        </Typography>
        {titleEndAdornment ? (
          <Box
            onClick={(ev) => {
              ev.stopPropagation();
            }}
            sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}
          >
            {titleEndAdornment}
          </Box>
        ) : null}
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
    minHeight: 0,
    maxHeight: "100%",
    overflowY: "auto",
    "& .section-label": {
      fontSize: SKETCH_FONT.md,
      fontWeight: 600,
      textTransform: "uppercase",
      color: theme.vars.palette.grey[300]
    },
    "& .layer-item": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.75),
      /* Vertical + right only; left padding comes from LayerItem sx (depth indent). */
      paddingTop: theme.spacing(0.5),
      paddingBottom: theme.spacing(0.5),
      paddingRight: theme.spacing(1),
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
      },
      /* Matches Lock Transparency toolbar control (IconButton color=info when on). */
      "&.alpha-lock": {
        boxShadow: `inset 3px 0 0 0 ${theme.vars.palette.info.main}`,
        backgroundColor: alpha(theme.palette.info.main, 0.1)
      },
      "&.alpha-lock:hover": {
        backgroundColor: alpha(theme.palette.info.main, 0.18)
      },
      "&.alpha-lock.active": {
        backgroundColor: theme.vars.palette.primary.dark,
        boxShadow: `inset 3px 0 0 0 ${theme.vars.palette.info.main}`
      },
      "&.alpha-lock.selected-secondary": {
        backgroundColor: theme.vars.palette.grey[700],
        boxShadow: `inset 3px 0 0 0 ${theme.vars.palette.info.main}, inset 0 0 0 1px ${theme.vars.palette.primary.light}`
      },
      "&.alpha-lock.selected-secondary:hover": {
        backgroundColor: theme.vars.palette.grey[600]
      },
      "&.group-layer": {
        /* Shorter than raster rows: parent `.layer-item` min-height cleared here. */
        minHeight: "unset",
        gap: theme.spacing(0.375),
        paddingTop: theme.spacing(0.125),
        paddingBottom: theme.spacing(0.125),
        backgroundColor: alpha(theme.palette.common.white, 0.04),
        borderLeft: `2px solid ${theme.vars.palette.grey[600]}`,
        "&:hover": {
          backgroundColor: alpha(theme.palette.common.white, 0.075)
        },
        "&.active": {
          borderLeftColor: theme.vars.palette.primary.light
        }
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
      ...SKETCH_CHECKERBOARD,
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: SKETCH_FONT.xxs,
      color: theme.vars.palette.grey[500]
    },
    "& .layer-name": {
      flex: 1,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    "& .layer-item.group-layer .layer-name": {
      fontSize: SKETCH_FONT.sm,
      fontWeight: 600,
      letterSpacing: "0.02em",
      color: theme.vars.palette.grey[400]
    },
    "& .layer-item.group-layer.active .layer-name": {
      color: "inherit"
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
      gap: SKETCH_SPACING.sm,
      padding: `0 ${SKETCH_SPACING.md}`,
      "& .MuiSlider-root": {
        flex: 1
      }
    },
    "& .hex-input": {
      "& .MuiInputBase-root": {
        fontSize: SKETCH_FONT.md,
        height: "28px"
      },
      "& .MuiInputBase-input": {
        padding: `${SKETCH_SPACING.sm} ${SKETCH_SPACING.lg}`
      }
    }
  });

export interface SketchLayersPanelProps {
  foregroundColor: string;
  onForegroundColorChange: (color: string) => void;
  layers: Layer[];
  activeLayerId: string;
  /** When length ≥ 2, rows use multi-select highlighting (Ctrl/Cmd toggle; Shift range). */
  selectedLayerIds: string[];
  maskLayerId: string | null;
  isolatedLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
  onToggleLayerInSelection: (layerId: string) => void;
  onSelectLayerRangeInPanelOrder: (layerId: string) => void;
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
  onCropCanvasToActiveLayerVisiblePixels: () => void;
  onCropCanvasToActiveLayerExtents: () => void;
  canvasWidth: number;
  canvasHeight: number;
  onCanvasResize: (width: number, height: number) => void;
  /** Edge resize handles on the canvas (persisted via parent). */
  canvasResizeHandlesEnabled: boolean;
  onCanvasResizeHandlesEnabledChange: (enabled: boolean) => void;
  onAddGroup: (name?: string) => void;
  onToggleGroupCollapsed: (groupId: string) => void;
  onMoveLayerToGroup: (layerId: string, groupId: string | null) => void;
  onUngroupLayer: (groupId: string) => void;
  onGroupSelectedLayers: () => void;
  onMergeSelectedLayers: () => void;
  onDeleteSelectedLayers: () => void;
  onLoadLayerAsSelection?: (layerId: string) => void;
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
  onSelectLayerRangeInPanelOrder,
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
  onCropCanvasToActiveLayerVisiblePixels,
  onCropCanvasToActiveLayerExtents,
  canvasWidth,
  canvasHeight,
  onCanvasResize,
  canvasResizeHandlesEnabled,
  onCanvasResizeHandlesEnabledChange,
  onAddGroup,
  onToggleGroupCollapsed,
  onMoveLayerToGroup,
  onUngroupLayer,
  onGroupSelectedLayers,
  onMergeSelectedLayers,
  onDeleteSelectedLayers,
  onLoadLayerAsSelection
}) => {
  const theme = useTheme();
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const layerById = useMemo(
    () => new Map(layers.map((layer) => [layer.id, layer])),
    [layers]
  );
  const [dropTarget, setDropTarget] = useState<{
    realIdx: number;
    position: DropPosition;
  } | null>(null);
  /** Latest drag-over target; state alone is cleared by row dragLeave and drops then no-op. */
  const dropTargetRef = useRef<{
    realIdx: number;
    position: DropPosition;
  } | null>(null);
  const dragSourceIndex = useRef<number | null>(null);

  // ─── Collapsible section state (persisted in localStorage) ────────
  const [collapsedSections, handleToggleSection] =
    useCollapsedSections<PanelSectionKey>(
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

  /**
   * `draggable` rows: handle modifier intent on `pointerdown` and suppress the paired
   * `click` so we do not double-apply. Shift+click uses range select; Ctrl/Cmd toggles.
   */
  const suppressNextLayerRowClickRef = useRef<string | null>(null);
  const visibilityDragStateRef = useRef<{
    desiredVisible: boolean;
    toggledLayerIds: Set<string>;
  } | null>(null);
  const suppressVisibilityButtonClickRef = useRef<string | null>(null);

  const clearVisibilityDragState = useCallback(() => {
    // Intentionally depends only on refs so the window-level mouseup listener
    // stays stable across renders while still clearing the current drag session.
    visibilityDragStateRef.current = null;

    // `click` fires after `mouseup`, so keep the suppression flag alive until
    // the queued click has had a chance to observe it and avoid double-toggling.
    window.setTimeout(() => {
      suppressVisibilityButtonClickRef.current = null;
    }, 0);
  }, []);

  useEffect(() => {
    // `clearVisibilityDragState` is stable by design, so this listener only
    // needs to mount once while still clearing the latest drag state via refs.
    const handleWindowMouseUp = () => {
      clearVisibilityDragState();
    };
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [clearVisibilityDragState]);

  const applyVisibilityDragToLayer = useCallback(
    (layerId: string, desiredVisible: boolean) => {
      const dragState = visibilityDragStateRef.current;
      if (!dragState || dragState.toggledLayerIds.has(layerId)) {
        return;
      }
      const layer = layerById.get(layerId);
      if (!layer) {
        return;
      }
      dragState.toggledLayerIds.add(layerId);
      if (layer.visible !== desiredVisible) {
        onToggleVisibility(layerId);
      }
    },
    [layerById, onToggleVisibility]
  );

  const handleLayerRowPointerDown = useCallback(
    (e: React.PointerEvent, layerId: string) => {
      const t = e.target as HTMLElement;
      if (!layerRowHasMultiSelectModifier(e)) {
        return;
      }
      if (t.closest("button, input")) {
        return;
      }
      e.preventDefault();
      suppressNextLayerRowClickRef.current = layerId;
      if (layerRowShiftHeld(e)) {
        onSelectLayerRangeInPanelOrder(layerId);
      } else {
        onToggleLayerInSelection(layerId);
      }
      window.setTimeout(() => {
        if (suppressNextLayerRowClickRef.current === layerId) {
          suppressNextLayerRowClickRef.current = null;
        }
      }, 0);
    },
    [onSelectLayerRangeInPanelOrder, onToggleLayerInSelection]
  );

  const handleLayerRowClick = useCallback(
    (e: React.MouseEvent, layerId: string) => {
      if (suppressNextLayerRowClickRef.current === layerId) {
        suppressNextLayerRowClickRef.current = null;
        return;
      }
      if (layerRowShiftHeld(e)) {
        suppressNextLayerRowClickRef.current = null;
        onSelectLayerRangeInPanelOrder(layerId);
        return;
      }
      if (layerRowCtrlOrMetaHeld(e)) {
        suppressNextLayerRowClickRef.current = null;
        onToggleLayerInSelection(layerId);
        return;
      }
      suppressNextLayerRowClickRef.current = null;
      onSelectLayer(layerId);
    },
    [onSelectLayer, onSelectLayerRangeInPanelOrder, onToggleLayerInSelection]
  );

  const handleVisibilityButtonMouseDown = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, layerId: string) => {
      if (e.button !== 0) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const layer = layerById.get(layerId);
      if (!layer) {
        return;
      }
      visibilityDragStateRef.current = {
        desiredVisible: !layer.visible,
        toggledLayerIds: new Set()
      };
      suppressVisibilityButtonClickRef.current = layerId;
      applyVisibilityDragToLayer(layerId, !layer.visible);
    },
    [applyVisibilityDragToLayer, layerById]
  );

  const handleVisibilityButtonMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, layerId: string) => {
      const dragState = visibilityDragStateRef.current;
      if (!dragState || (e.buttons & 1) !== 1) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      applyVisibilityDragToLayer(layerId, dragState.desiredVisible);
    },
    [applyVisibilityDragToLayer]
  );

  const handleVisibilityButtonClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, layerId: string) => {
      e.stopPropagation();
      if (suppressVisibilityButtonClickRef.current === layerId) {
        suppressVisibilityButtonClickRef.current = null;
        return;
      }
      onToggleVisibility(layerId);
    },
    [onToggleVisibility]
  );

  // ─── Drag-and-drop layer reordering (tree-aware) ───────────────
  const handleDragStart = useCallback(
    (e: React.DragEvent, realIdx: number) => {
      dragSourceIndex.current = realIdx;
      dropTargetRef.current = null;
      try {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", layers[realIdx]?.id ?? "");
      } catch {
        // Some browsers restrict setData in dragstart; reorder still works.
      }
    },
    [layers]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, realIdx: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
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

      const payload = { realIdx, position };
      dropTargetRef.current = payload;
      setDropTarget(payload);
    },
    [layers]
  );

  // Do not clear on row dragLeave: leaving the row to enter a child (or a gap)
  // drops React state and the drop handler used to see null — preview lied.

  const handleDrop = useCallback(
    (_realIdx: number, e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const from = dragSourceIndex.current;
      const pending = dropTargetRef.current;
      if (from === null || !pending) {
        dragSourceIndex.current = null;
        dropTargetRef.current = null;
        setDropTarget(null);
        return;
      }

      const targetIdx = pending.realIdx;
      const { position } = pending;

      const draggedLayer = layers[from];
      const targetLayer = layers[targetIdx];
      if (!draggedLayer || !targetLayer) {
        dragSourceIndex.current = null;
        dropTargetRef.current = null;
        setDropTarget(null);
        return;
      }

      if (
        from === targetIdx ||
        (position === "into" && draggedLayer.id === targetLayer.id)
      ) {
        dragSourceIndex.current = null;
        dropTargetRef.current = null;
        setDropTarget(null);
        return;
      }

      // Prevent dropping a group into itself or its descendants
      if (draggedLayer.type === "group") {
        const descendantIds = getDescendantIds(layers, draggedLayer.id);
        if (descendantIds.includes(targetLayer.id)) {
          dragSourceIndex.current = null;
          dropTargetRef.current = null;
          setDropTarget(null);
          return;
        }
      }

      if (position === "into" && targetLayer.type === "group") {
        // Drop INTO a group: reparent the dragged layer
        onMoveLayerToGroup(draggedLayer.id, targetLayer.id);
      } else {
        // Drop BEFORE or AFTER: reparent to the same parent as the target, then reorder
        const targetParentId = targetLayer.parentId ?? null;
        if ((draggedLayer.parentId ?? null) !== targetParentId) {
          onMoveLayerToGroup(draggedLayer.id, targetParentId);
        }
        // The panel renders layers in REVERSE array order (last array item = top of panel).
        // "before" in panel (above target) → place dragged item at a HIGHER array index.
        // "after"  in panel (below target) → place dragged item at a LOWER  array index.
        //
        // Derivation: when removing `from` then inserting at `toIndex`, the item
        // ends up at `toIndex` in the final array. Accounting for the array-vs-panel
        // reversal:
        //   before: toIndex = from < targetIdx ? targetIdx : targetIdx + 1
        //   after:  toIndex = from < targetIdx ? targetIdx - 1 : targetIdx
        let toIndex: number;
        if (position === "before") {
          toIndex = from < targetIdx ? targetIdx : targetIdx + 1;
        } else {
          toIndex = from < targetIdx ? targetIdx - 1 : targetIdx;
        }
        if (toIndex !== from) {
          onReorderLayers(from, toIndex);
        }
      }

      dragSourceIndex.current = null;
      dropTargetRef.current = null;
      setDropTarget(null);
    },
    [layers, onReorderLayers, onMoveLayerToGroup]
  );

  const handleDragEnd = useCallback(() => {
    dragSourceIndex.current = null;
    dropTargetRef.current = null;
    setDropTarget(null);
  }, []);

  // ─── Layer context menu ───────────────────────────────────────
  const [layerCtxMenu, setLayerCtxMenu] = useState<{
    position: { top: number; left: number };
    layerId: string;
  } | null>(null);

  const handleLayerContextMenu = useCallback(
    (e: React.MouseEvent, layerId: string) => {
      e.preventDefault();
      setLayerCtxMenu({
        position: { top: e.clientY, left: e.clientX },
        layerId
      });
    },
    []
  );

  const handleLayerCtxClose = useCallback(() => setLayerCtxMenu(null), []);

  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const activeLayerFlatIndex = activeLayer ? layers.indexOf(activeLayer) : -1;
  const canMergeDown = activeLayerFlatIndex > 0;
  const pixelLayerCanvasActionsDisabled =
    !activeLayer || activeLayer.locked || activeLayer.type === "group";

  const hasMultiLayerSelection = selectedLayerIds.length >= 2;
  const canMergeSelectedLayers =
    getMergeSelectedLayersPlan(layers, selectedLayerIds) !== null;
  const layerIdsInDoc = new Set(layers.map((l) => l.id));
  const selectedLayersPresentCount = selectedLayerIds.filter((id) =>
    layerIdsInDoc.has(id)
  ).length;
  const canDeleteToolbarLayer = hasMultiLayerSelection
    ? layers.length - selectedLayersPresentCount >= 1
    : layers.length > 1;

  const cycleBlendMode = useCallback((direction: -1 | 1) => {
    if (!activeLayer) {
      return;
    }
    const current = coerceBlendMode(activeLayer.blendMode);
    const currentIndex = QUICK_CYCLE_BLEND_MODES.indexOf(current);
    const next = cycleArrayValue(
      QUICK_CYCLE_BLEND_MODES,
      currentIndex,
      direction
    );
    if (next && next !== current) {
      onLayerBlendModeChange(activeLayer.id, next);
    }
  }, [activeLayer, onLayerBlendModeChange]);

  const handleBlendModeQuickCycleKeyDownCapture = useCallback((
    e: React.KeyboardEvent
  ) => {
    if (e.altKey || e.ctrlKey || e.metaKey) {
      return;
    }
    const direction = quickCycleDirectionForArrowKey(e.key);
    if (direction === null) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    cycleBlendMode(direction);
  }, [cycleBlendMode]);

  const handleBlendModeQuickCycleWheelCapture = useCallback((
    e: React.WheelEvent
  ) => {
    if (e.deltaY === 0) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    cycleBlendMode(e.deltaY > 0 ? 1 : -1);
  }, [cycleBlendMode]);

  const cycleCanvasPreset = useCallback((direction: -1 | 1) => {
    const currentIndex = CANVAS_PRESETS.findIndex(
      (preset) => preset.width === canvasWidth && preset.height === canvasHeight
    );
    const next = cycleArrayValue(CANVAS_PRESETS, currentIndex, direction);
    if (next) {
      onCanvasResize(next.width, next.height);
    }
  }, [canvasWidth, canvasHeight, onCanvasResize]);

  const handleCanvasPresetQuickCycleKeyDownCapture = useCallback((
    e: React.KeyboardEvent
  ) => {
    if (e.altKey || e.ctrlKey || e.metaKey) {
      return;
    }
    const direction = quickCycleDirectionForArrowKey(e.key);
    if (direction === null) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    cycleCanvasPreset(direction);
  }, [cycleCanvasPreset]);

  const handleCanvasPresetQuickCycleWheelCapture = useCallback((
    e: React.WheelEvent
  ) => {
    if (e.deltaY === 0) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    cycleCanvasPreset(e.deltaY > 0 ? 1 : -1);
  }, [cycleCanvasPreset]);

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
          <Tooltip title="Add Transparent Layer" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
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
              <AddIcon
                sx={{ fontSize: "14px", color: theme.vars.palette.grey[400] }}
              />
            </IconButton>
          </Tooltip>
          <Tooltip title="Add Black Layer" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
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
                "&:hover": {
                  borderColor: theme.vars.palette.grey[300],
                  backgroundColor: "#111111"
                }
              }}
            >
              <AddIcon
                sx={{ fontSize: "14px", color: theme.vars.palette.grey[500] }}
              />
            </IconButton>
          </Tooltip>
          <Tooltip title="Add White Layer" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
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
                "&:hover": {
                  borderColor: theme.vars.palette.grey[300],
                  backgroundColor: "#eeeeee"
                }
              }}
            >
              <AddIcon
                sx={{ fontSize: "14px", color: theme.vars.palette.grey[600] }}
              />
            </IconButton>
          </Tooltip>
          <Tooltip title="Add Gray Layer" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
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
                "&:hover": {
                  borderColor: theme.vars.palette.grey[300],
                  backgroundColor: "#999999"
                }
              }}
            >
              <AddIcon
                sx={{ fontSize: "14px", color: theme.vars.palette.grey[300] }}
              />
            </IconButton>
          </Tooltip>
          <Tooltip title="New empty layer group (folder)" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
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
                "&:hover": {
                  borderColor: theme.vars.palette.grey[300],
                  backgroundColor: theme.vars.palette.grey[600]
                }
              }}
            >
              <CreateNewFolderIcon
                sx={{ fontSize: "14px", color: theme.vars.palette.grey[400] }}
              />
            </IconButton>
          </Tooltip>
        </Box>
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
          <Tooltip title="Duplicate Layer" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
            <IconButton
              size="small"
              onClick={() => onDuplicateLayer(activeLayerId)}
            >
              <ContentCopyIcon sx={{ fontSize: "1.125rem" }} />
            </IconButton>
          </Tooltip>
          <Tooltip
            title={
              hasMultiLayerSelection ? "Delete selected layers" : "Delete Layer"
            }
            enterDelay={SKETCH_TOOLTIP_DELAY_MS}
            enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}
          >
            <span>
              <IconButton
                size="small"
                onClick={() =>
                  hasMultiLayerSelection
                    ? onDeleteSelectedLayers()
                    : onRemoveLayer(activeLayerId)
                }
                disabled={!canDeleteToolbarLayer}
              >
                <DeleteIcon sx={{ fontSize: "1.125rem" }} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Flatten Visible" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
            <IconButton size="small" onClick={onFlattenVisible}>
              <LayersIcon sx={{ fontSize: "1.125rem" }} />
            </IconButton>
          </Tooltip>
          <Tooltip
            title={
              maskLayerId === activeLayerId
                ? "Remove Mask Designation"
                : "Set as Mask Layer"
            }
            enterDelay={SKETCH_TOOLTIP_DELAY_MS}
            enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}
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
            enterDelay={SKETCH_TOOLTIP_DELAY_MS}
            enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}
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
          <Tooltip title="Trim Active Layer To Bounds" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
            <IconButton
              size="small"
              onClick={onTrimLayerToBounds}
              disabled={
                !activeLayer ||
                activeLayer.locked ||
                activeLayer.type === "group" ||
                activeLayer.type === "mask"
              }
            >
              <FitScreenIcon sx={{ fontSize: "1.125rem" }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Divider />

      {/* Layer list: cap height (~half viewport) so many layers scroll without stretching the panel */}
      <Box
        className="sketch-layers-panel__layer-list-scroll"
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          minHeight: 0,
          maxHeight: "50vh",
          overflowY: "auto"
        }}
      >
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
              dropPosition={
                dropTarget?.realIdx === realIdx ? dropTarget.position : null
              }
              editingLayerId={editingLayerId}
              editName={editName}
              onLayerRowPointerDown={handleLayerRowPointerDown}
              onLayerRowClick={handleLayerRowClick}
              onVisibilityButtonMouseDown={handleVisibilityButtonMouseDown}
              onVisibilityButtonMouseEnter={handleVisibilityButtonMouseEnter}
              onVisibilityButtonClick={handleVisibilityButtonClick}
              onToggleIsolateLayer={onToggleIsolateLayer}
              onToggleExposedInput={onToggleExposedInput}
              onToggleExposedOutput={onToggleExposedOutput}
              onContextMenu={handleLayerContextMenu}
              onThumbnailCtrlClick={onLoadLayerAsSelection}
              onStartRename={handleStartRename}
              onFinishRename={handleFinishRename}
              onEditNameChange={handleEditNameChange}
              onCancelRename={handleCancelRename}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
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
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.25,
            minHeight: 30
          }}
        >
          {selectedLayerIds.length >= 2 ? (
            <>
              <Tooltip title="Group selected layers (adjacent siblings, same parent)" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
                <IconButton size="small" onClick={onGroupSelectedLayers}>
                  <CreateNewFolderIcon sx={{ fontSize: "1.125rem" }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Merge selected layers (contiguous siblings)" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
                <span>
                  <IconButton
                    size="small"
                    aria-label="Merge Selected Layers"
                    onClick={onMergeSelectedLayers}
                    disabled={!canMergeSelectedLayers}
                  >
                    <CallMergeIcon sx={{ fontSize: "1.125rem" }} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Delete selected layers" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
                <IconButton
                  size="small"
                  color="error"
                  onClick={onDeleteSelectedLayers}
                >
                  <DeleteIcon sx={{ fontSize: "1.125rem" }} />
                </IconButton>
              </Tooltip>
            </>
          ) : null}
        </Box>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.25,
            minHeight: 30
          }}
        >
          {activeLayer?.type === "group" ? (
            <Tooltip title="Ungroup" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
              <IconButton
                size="small"
                onClick={() => onUngroupLayer(activeLayerId)}
              >
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
        <Tooltip title="Clear Layer (Delete)" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
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
        <Tooltip title="Flip Layer Horizontal" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
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
        <Tooltip title="Flip Layer Vertical" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
          <span>
            <IconButton
              size="small"
              onClick={onFlipVertical}
              disabled={pixelLayerCanvasActionsDisabled}
            >
              <FlipCameraAndroidIcon
                sx={{ fontSize: "1.125rem", transform: "rotate(90deg)" }}
              />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Merge Down" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
          <span>
            <IconButton
              size="small"
              onClick={onMergeDown}
              disabled={!canMergeDown}
            >
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
            <Typography sx={{ fontSize: SKETCH_FONT.md, color: SKETCH_COLORS.textMuted }}>
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
            <Typography
              sx={{ fontSize: SKETCH_FONT.md, minWidth: "30px", textAlign: "right" }}
            >
              {Math.round(activeLayer.opacity * 100)}%
            </Typography>
          </Box>
          <FormControl size="small" sx={{ px: "6px" }}>
            <Select
              value={coerceBlendMode(activeLayer.blendMode)}
              onChange={(e) =>
                onLayerBlendModeChange(
                  activeLayerId,
                  e.target.value as BlendMode
                )
              }
              onKeyDownCapture={handleBlendModeQuickCycleKeyDownCapture}
              onWheelCapture={handleBlendModeQuickCycleWheelCapture}
              sx={{ fontSize: SKETCH_FONT.md, height: "28px" }}
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
                  fontSize: SKETCH_FONT.xs,
                  color: SKETCH_COLORS.textFaint,
                  lineHeight: 1.35,
                  wordBreak: "break-all",
                  fontFamily: "monospace"
                }}
              >
                {summarizeLayerImageReference(activeLayer.imageReference)}
              </Typography>
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
        titleEndAdornment={
          <Tooltip
            title={
              canvasResizeHandlesEnabled
                ? "Hide resize handles on canvas"
                : "Show resize handles on canvas"
            }
            placement="left"
            enterDelay={SKETCH_TOOLTIP_DELAY_MS}
            enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}
          >
            <Switch
              size="small"
              checked={canvasResizeHandlesEnabled}
              onChange={(_, checked) => onCanvasResizeHandlesEnabledChange(checked)}
              inputProps={{
                "aria-label": "Toggle canvas resize handles"
              }}
            />
          </Tooltip>
        }
      >
        <Select
          size="small"
          displayEmpty
          value=""
          onChange={(e) => {
            const preset = CANVAS_PRESETS.find(
              (p) => p.label === e.target.value
            );
            if (preset) {
              onCanvasResize(preset.width, preset.height);
            }
          }}
          onKeyDownCapture={handleCanvasPresetQuickCycleKeyDownCapture}
          onWheelCapture={handleCanvasPresetQuickCycleWheelCapture}
          sx={{
            width: "100%",
            fontSize: SKETCH_FONT.sm,
            "& .MuiSelect-select": { padding: "3px 8px" }
          }}
          renderValue={() => {
            const match = CANVAS_PRESETS.find(
              (p) => p.width === canvasWidth && p.height === canvasHeight
            );
            return (
              <Typography
                sx={{
                  fontSize: SKETCH_FONT.sm,
                  color: match ? "grey.200" : SKETCH_COLORS.textFaint
                }}
              >
                {match ? match.label : "Presets…"}
              </Typography>
            );
          }}
        >
          {CANVAS_PRESETS.map((preset) => (
            <MenuItem
              key={preset.label}
              value={preset.label}
              sx={{ fontSize: SKETCH_FONT.sm }}
            >
              {preset.label} — {preset.width}×{preset.height}
            </MenuItem>
          ))}
        </Select>
        <Box
          sx={{ display: "flex", gap: "4px", mt: "6px", alignItems: "center" }}
        >
          <TextField
            className="hex-input"
            size="small"
            label="W"
            type="number"
            value={customWidth}
            onChange={(e) => setCustomWidth(e.target.value)}
            inputProps={{ min: 1, max: 4096, step: 1 }}
            sx={{ flex: 1, "& .MuiInputLabel-root": { fontSize: SKETCH_FONT.sm } }}
          />
          <Typography sx={{ fontSize: SKETCH_FONT.md, color: SKETCH_COLORS.textFaint }}>
            ×
          </Typography>
          <TextField
            className="hex-input"
            size="small"
            label="H"
            type="number"
            value={customHeight}
            onChange={(e) => setCustomHeight(e.target.value)}
            inputProps={{ min: 1, max: 4096, step: 1 }}
            sx={{ flex: 1, "& .MuiInputLabel-root": { fontSize: SKETCH_FONT.sm } }}
          />
        </Box>
        <Button
          size="small"
          variant="contained"
          fullWidth
          onClick={handleApplyCustomSize}
          sx={{ mt: "4px", fontSize: SKETCH_FONT.md, py: "2px" }}
        >
          Apply
        </Button>
      </PanelSection>

      {/* ── Layer context menu ──────────────────────────────────── */}
      {(() => {
        const ctxLayer = layerCtxMenu
          ? (layers.find((l) => l.id === layerCtxMenu.layerId) ?? null)
          : null;
        // Determine which layer IDs are targeted: if the right-clicked layer is part of
        // a multi-selection, apply to all selected layers; otherwise single layer only.
        const isMulti =
          layerCtxMenu !== null &&
          selectedLayerIds.length >= 2 &&
          selectedLayerIds.includes(layerCtxMenu.layerId);
        const targetIds: string[] = isMulti
          ? selectedLayerIds
          : layerCtxMenu
            ? [layerCtxMenu.layerId]
            : [];

        const ctxIsGroup = ctxLayer?.type === "group";
        const ctxCanMergeDown =
          ctxLayer && !isMulti && layers.indexOf(ctxLayer) > 0;
        const ctxPixelActionsDisabled =
          !ctxLayer || ctxLayer.locked || ctxLayer.type === "group";

        const allInputHidden = targetIds.every(
          (id) => layers.find((l) => l.id === id)?.exposedAsInput === false
        );
        const allOutputHidden = targetIds.every(
          (id) => layers.find((l) => l.id === id)?.exposedAsOutput === false
        );

        const handleCtxToggleInput = () => {
          targetIds.forEach((id) => onToggleExposedInput(id));
          handleLayerCtxClose();
        };
        const handleCtxToggleOutput = () => {
          targetIds.forEach((id) => onToggleExposedOutput(id));
          handleLayerCtxClose();
        };
        const handleCtxDuplicate = () => {
          if (ctxLayer) {
            onDuplicateLayer(ctxLayer.id);
          }
          handleLayerCtxClose();
        };
        const handleCtxDelete = () => {
          if (isMulti) {
            onDeleteSelectedLayers();
          } else if (ctxLayer) {
            onRemoveLayer(ctxLayer.id);
          }
          handleLayerCtxClose();
        };
        const handleCtxRename = () => {
          if (ctxLayer) {
            handleStartRename(ctxLayer.id, ctxLayer.name);
          }
          handleLayerCtxClose();
        };
        const handleCtxClear = () => {
          onClearLayer();
          handleLayerCtxClose();
        };
        const handleCtxFlipH = () => {
          onFlipHorizontal();
          handleLayerCtxClose();
        };
        const handleCtxFlipV = () => {
          onFlipVertical();
          handleLayerCtxClose();
        };
        const handleCtxMergeDown = () => {
          onMergeDown();
          handleLayerCtxClose();
        };
        const handleCtxFlatten = () => {
          onFlattenVisible();
          handleLayerCtxClose();
        };
        const handleCtxMask = () => {
          if (ctxLayer) {
            onSetMaskLayer(maskLayerId === ctxLayer.id ? null : ctxLayer.id);
          }
          handleLayerCtxClose();
        };
        const handleCtxAlphaLock = () => {
          if (ctxLayer) {
            onToggleAlphaLock(ctxLayer.id);
          }
          handleLayerCtxClose();
        };
        const handleCtxTrim = () => {
          onTrimLayerToBounds();
          handleLayerCtxClose();
        };
        const handleCtxCropToVisible = () => {
          onCropCanvasToActiveLayerVisiblePixels();
          handleLayerCtxClose();
        };
        const handleCtxCropToExtents = () => {
          onCropCanvasToActiveLayerExtents();
          handleLayerCtxClose();
        };
        const handleCtxUngroup = () => {
          if (ctxLayer) {
            onUngroupLayer(ctxLayer.id);
          }
          handleLayerCtxClose();
        };
        const handleCtxGroup = () => {
          onGroupSelectedLayers();
          handleLayerCtxClose();
        };
        const handleCtxMergeSelected = () => {
          onMergeSelectedLayers();
          handleLayerCtxClose();
        };
        const handleCtxVisibility = () => {
          if (ctxLayer) {
            onToggleVisibility(ctxLayer.id);
          }
          handleLayerCtxClose();
        };

        const menuItemSx = { fontSize: "0.8rem", py: "4px", minHeight: 0 };

        return (
          <Menu
            open={layerCtxMenu !== null}
            onClose={handleLayerCtxClose}
            anchorReference="anchorPosition"
            anchorPosition={layerCtxMenu?.position}
            slotProps={{ paper: { sx: { minWidth: 180 } } }}
          >
            <MenuItem sx={menuItemSx} onClick={handleCtxToggleInput}>
              {allInputHidden ? "Show Input" : "Hide Input"}
            </MenuItem>
            <MenuItem sx={menuItemSx} onClick={handleCtxToggleOutput}>
              {allOutputHidden ? "Show Output" : "Hide Output"}
            </MenuItem>

            <Divider sx={{ my: "4px" }} />

            <MenuItem sx={menuItemSx} onClick={handleCtxVisibility}>
              {ctxLayer?.visible === false ? "Show Layer" : "Hide Layer"}
            </MenuItem>
            <MenuItem
              sx={menuItemSx}
              onClick={handleCtxRename}
              disabled={isMulti || !ctxLayer}
            >
              Rename
            </MenuItem>
            <MenuItem
              sx={menuItemSx}
              onClick={handleCtxDuplicate}
              disabled={!ctxLayer || isMulti}
            >
              Duplicate
            </MenuItem>
            <MenuItem sx={menuItemSx} onClick={handleCtxDelete}>
              Delete
            </MenuItem>

            <Divider sx={{ my: "4px" }} />

            <MenuItem
              sx={menuItemSx}
              onClick={handleCtxClear}
              disabled={ctxPixelActionsDisabled || isMulti}
            >
              Clear Layer
            </MenuItem>
            <MenuItem
              sx={menuItemSx}
              onClick={handleCtxFlipH}
              disabled={ctxPixelActionsDisabled || isMulti}
            >
              Flip Horizontal
            </MenuItem>
            <MenuItem
              sx={menuItemSx}
              onClick={handleCtxFlipV}
              disabled={ctxPixelActionsDisabled || isMulti}
            >
              Flip Vertical
            </MenuItem>
            <MenuItem
              sx={menuItemSx}
              onClick={handleCtxMergeDown}
              disabled={!ctxCanMergeDown}
            >
              Merge Down
            </MenuItem>
            <MenuItem sx={menuItemSx} onClick={handleCtxFlatten}>
              Flatten Visible
            </MenuItem>

            <Divider sx={{ my: "4px" }} />

            <MenuItem
              sx={menuItemSx}
              onClick={handleCtxAlphaLock}
              disabled={ctxIsGroup || isMulti}
            >
              {ctxLayer?.alphaLock
                ? "Unlock Transparency"
                : "Lock Transparency"}
            </MenuItem>
            <MenuItem
              sx={menuItemSx}
              onClick={handleCtxMask}
              disabled={ctxIsGroup || isMulti}
            >
              {ctxLayer && maskLayerId === ctxLayer.id
                ? "Remove Mask"
                : "Set as Mask"}
            </MenuItem>
            <MenuItem
              sx={menuItemSx}
              onClick={handleCtxTrim}
              disabled={ctxPixelActionsDisabled || isMulti}
            >
              Trim to Bounds
            </MenuItem>
            <MenuItem
              sx={menuItemSx}
              onClick={handleCtxCropToVisible}
              disabled={ctxIsGroup || isMulti || ctxLayer?.type === "mask"}
            >
              Crop Canvas to Visible Pixels
            </MenuItem>
            <MenuItem
              sx={menuItemSx}
              onClick={handleCtxCropToExtents}
              disabled={ctxIsGroup || isMulti || ctxLayer?.type === "mask"}
            >
              Crop Canvas to Layer Extents
            </MenuItem>

            {ctxIsGroup && !isMulti && (
              <MenuItem sx={menuItemSx} onClick={handleCtxUngroup}>
                Ungroup
              </MenuItem>
            )}
            {isMulti ? (
              <MenuItem sx={menuItemSx} onClick={handleCtxGroup}>
                Group Selected
              </MenuItem>
            ) : null}
            {isMulti ? (
              <MenuItem
                sx={menuItemSx}
                onClick={handleCtxMergeSelected}
                disabled={getMergeSelectedLayersPlan(layers, targetIds) === null}
              >
                Merge Selected
              </MenuItem>
            ) : null}
          </Menu>
        );
      })()}

      <Divider />

      {/* ── Shortcuts reference (collapsible, collapsed by default) ─ */}
      <PanelSection
        title="Shortcuts"
        sectionKey="shortcuts"
        collapsed={collapsedSections.shortcuts}
        onToggle={handleToggleSection}
      >
        <ShortcutReference />
      </PanelSection>
    </Box>
  );
};

export default memo(SketchLayersPanel);
