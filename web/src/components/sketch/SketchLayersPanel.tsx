/**
 * SketchLayersPanel
 *
 * Panel for managing layers: visibility, reorder, add, delete, duplicate,
 * rename, opacity, and mask designation.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useEffect, useState, useRef, useMemo } from "react";
import AddIcon from "@mui/icons-material/Add";
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
  IconButton,
  Menu,
  Slider,
  Select,
  MenuItem,
  FormControl
} from "@mui/material";
import { FlexColumn, FlexRow, Box, Tooltip, Divider, Text, MOTION, BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";
import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import TrashIconSvg from "../../icons/trash.svg?react";
const DeleteIcon = TrashIconSvg as React.FC<React.SVGProps<SVGSVGElement>>;
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
const MaskIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="currentColor"
    {...props}
  >
    <path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zm2 0v14h14V5H5zm7 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z" />
  </svg>
);
import LockIcon from "@mui/icons-material/Lock";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import {
  Layer,
  BlendMode,
  coerceBlendMode,
  summarizeLayerImageReference,
  buildLayersPanelRows,
  getDescendantIds,
  findMergeDownTargetIndex
} from "./types";
import LayerItem from "./LayerItem";
import type { DropPosition } from "./LayerItem";
import { useSketchSessionStore } from "../../stores/sketch/SketchSessionStore";
import { useSketchStore } from "./state/useSketchStore";
import HueTriangleColorPicker from "./HueTriangleColorPicker";
import { getMergeSelectedLayersPlan } from "./layerMergeSelection";
import { CreateGeneratedLayerDialog } from "./Inspector/CreateGeneratedLayerDialog";

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

/**
 * Bottom layer-ops toolbar icon: thin, muted, evenly spaced with a soft rounded
 * hover — the same language as the left tool rail, no heavy dividers. Active
 * role toggles (mask / alpha-lock) override `color` through their own sx.
 */
const OPS_ICON_SX = {
  width: 30,
  height: 30,
  padding: getSpacingPx(SPACING.xs),
  borderRadius: BORDER_RADIUS.lg,
  color: "grey.400",
  transition: `${MOTION.background}, color ${MOTION.fast}`,
  "&:hover": { backgroundColor: "grey.800", color: "grey.100" },
  "&.Mui-disabled": { color: "grey.700" }
};

/**
 * Add-row generative / structural actions (text-to-image, image-to-image, new
 * group, generate): the same flat muted icon language as the ops toolbar,
 * sized for the tighter eight-button add row.
 */
const ADD_ACTION_ICON_SX = {
  width: 26,
  height: 26,
  padding: 0,
  borderRadius: BORDER_RADIUS.lg,
  color: "grey.400",
  transition: `${MOTION.background}, color ${MOTION.fast}`,
  "&:hover": { backgroundColor: "grey.800", color: "grey.100" }
};

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1),
    padding: theme.spacing(1.5),
    backgroundColor: theme.vars.palette.background.paper,
    borderLeft: `1px solid ${theme.vars.palette.divider}`,
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
      gap: theme.spacing(1),
      /* No vertical padding — thumbnails dictate row height. Left/right are 0
         so the thumbnail and visibility cell sit flush with the row edges
         (the row's background should not extend past them). */
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
      borderRadius: BORDER_RADIUS.lg,
      cursor: "pointer",
      fontSize: SKETCH_FONT.md,
      minHeight: SKETCH_SIZE.layerItemHeight,
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[700]
      },
      /* Selected row: a restrained elevated surface with a full primary ring,
         rather than a saturated blue fill. Reads as clearly "active" while
         keeping the layer's own thumbnail and name the focus. */
      "&.active": {
        backgroundColor: theme.vars.palette.grey[700],
        boxShadow: `inset 0 0 0 1px ${alpha(theme.palette.primary.main, 0.7)}`
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
        backgroundColor: theme.vars.palette.grey[700],
        boxShadow: `inset 3px 0 0 0 ${theme.vars.palette.info.main}, inset 0 0 0 1px ${alpha(theme.palette.primary.main, 0.7)}`
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
        gap: theme.spacing(0.5),
        paddingTop: 0,
        paddingBottom: 0,
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
      borderRadius: BORDER_RADIUS.xs,
      border: `1px solid ${theme.vars.palette.grey[600]}`,
      ...SKETCH_CHECKERBOARD,
      objectFit: "contain",
      flexShrink: 0,
      imageRendering: "pixelated" as const
    },
    "& .layer-thumbnail-empty": {
      width: SKETCH_SIZE.layerThumbnail,
      height: SKETCH_SIZE.layerThumbnail,
      borderRadius: BORDER_RADIUS.xs,
      border: `1px solid ${theme.vars.palette.grey[600]}`,
      ...SKETCH_CHECKERBOARD,
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: SKETCH_FONT.xxs,
      color: theme.vars.palette.grey[500]
    },
    "& .layer-visibility-cell": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxSizing: "border-box",
      width: SKETCH_SIZE.layerThumbnail,
      minHeight: SKETCH_SIZE.layerThumbnail,
      flexShrink: 0,
      alignSelf: "center",
      backgroundColor: alpha(theme.palette.common.black, 0.42),
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      borderRadius: BORDER_RADIUS.xs,
      "& .MuiIconButton-root": {
        padding: getSpacingPx(SPACING.micro)
      }
    },
    "& .layer-item:hover:not(.active) .layer-visibility-cell": {
      borderColor: theme.vars.palette.grey[600],
      backgroundColor: alpha(theme.palette.common.black, 0.38)
    },
    "& .layer-item.active .layer-visibility-cell": {
      borderColor: alpha(theme.palette.primary.contrastText, 0.22),
      backgroundColor: alpha(theme.palette.common.black, 0.48)
    },
    "& .layer-item.selected-secondary:not(.active):not(.group-layer):hover .layer-visibility-cell":
      {
        borderColor: theme.vars.palette.grey[500]
      },
    "& .layer-item.selected-secondary:not(.active) .layer-visibility-cell": {
      borderColor: theme.vars.palette.grey[600],
      backgroundColor: alpha(theme.palette.common.black, 0.4)
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
    "& .layer-item.layer-hidden .layer-name": {
      color: theme.vars.palette.text.secondary
    },
    "& .layer-item.active.layer-hidden .layer-name": {
      color: theme.vars.palette.text.secondary
    },
    "& .layer-actions": {
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      gap: theme.spacing(1)
    },
    "& .opacity-row": {
      display: "flex",
      alignItems: "center",
      gap: SKETCH_SPACING.sm,
      padding: `0 ${SKETCH_SPACING.md}`,
      "& .MuiSlider-root": {
        flex: 1
      }
    }
  });

export interface SketchLayersPanelProps {
  foregroundColor: string;
  onForegroundColorChange: (color: string) => void;
  showColorPicker?: boolean;
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
  onRotate180: () => void;
  onMergeDown: () => void;
  onFlattenVisible: () => void;
  onTrimLayerToBounds: () => void;
  onCropCanvasToActiveLayerVisiblePixels: () => void;
  onCropCanvasToActiveLayerExtents: () => void;
  onAddGroup: (name?: string) => void;
  onToggleGroupCollapsed: (groupId: string) => void;
  onMoveLayerToGroup: (layerId: string, groupId: string | null) => void;
  onUngroupLayer: (groupId: string) => void;
  onGroupSelectedLayers: () => void;
  onMergeSelectedLayers: () => void;
  onDeleteSelectedLayers: () => void;
  onLoadLayerAsSelection?: (
    layerId: string,
    mode?: "replace" | "add"
  ) => void;
}

const SketchLayersPanel: React.FC<SketchLayersPanelProps> = ({
  foregroundColor,
  onForegroundColorChange,
  showColorPicker = true,
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
  onRotate180,
  onMergeDown,
  onFlattenVisible,
  onTrimLayerToBounds,
  onCropCanvasToActiveLayerVisiblePixels,
  onCropCanvasToActiveLayerExtents,
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
  const panelStyles = useMemo(() => styles(theme), [theme]);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const layerById = useMemo(
    () => new Map(layers.map((layer) => [layer.id, layer])),
    [layers]
  );
  const layerRows = useMemo(
    () => buildLayersPanelRows(layers),
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

  // ─── Per-layer generation status (for status badges) ──────────────
  // Subscribe to the bindings dictionary so each row picks up status flips
  // (draft → stale → generated → failed) without manual prop drilling.
  const layerBindings = useSketchSessionStore((s) => s.bindings);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);

  // ─── Direct-generation layers (text-to-image, image-to-image) ─────
  const upsertBinding = useSketchSessionStore((s) => s.upsertBinding);
  const addDirectGenLayer = useCallback(
    (kind: "text-to-image" | "image-to-image") => {
      const baseName =
        kind === "text-to-image" ? "Text-to-Image" : "Image-to-Image";
      const existingNames = new Set(layers.map((l) => l.name));
      let name = baseName;
      let n = 2;
      while (existingNames.has(name)) {
        name = `${baseName} ${n}`;
        n++;
      }
      const layerId = useSketchStore.getState().addLayer(name);
      // Seed provider/model from the most recent direct-gen binding in this
      // document, so the user doesn't pick a model from scratch every time.
      const existingBindings = Object.values(
        useSketchSessionStore.getState().bindings
      );
      const lastDirectGen = existingBindings
        .filter(
          (b) => b.kind === "text-to-image" || b.kind === "image-to-image"
        )
        .pop();
      const sourceLayerId =
        kind === "image-to-image"
          ? layers.find((l) => l.id !== layerId)?.id ?? null
          : null;
      upsertBinding({
        layerId,
        kind,
        prompt: "",
        provider: lastDirectGen?.provider ?? "",
        model: lastDirectGen?.model ?? "",
        sourceLayerId,
        status: "draft",
        versions: []
      });
    },
    [layers, upsertBinding]
  );

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
      // Ctrl/Cmd+click on the layer thumbnail loads the layer's alpha as
      // a selection mask — that is a dedicated gesture handled by the
      // thumbnail's own click handler. Without this bail-out, the row's
      // pointerdown would also fire `toggleLayerInSelection`, mutating
      // selectedLayerIds and causing a re-render that swallowed the
      // thumbnail click before the selection mask could be loaded.
      if (t.closest(".layer-thumbnail")) {
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
    (e: React.PointerEvent<HTMLButtonElement>, layerId: string) => {
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
    (e: React.PointerEvent<HTMLButtonElement>, layerId: string) => {
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

  const activeLayer = useMemo(
    () => layers.find((l) => l.id === activeLayerId),
    [layers, activeLayerId]
  );
  const activeLayerFlatIndex = activeLayer ? layers.indexOf(activeLayer) : -1;

  const hasMultiLayerSelection = selectedLayerIds.length >= 2;
  const layerIdsInDoc = useMemo(
    () => new Set(layers.map((l) => l.id)),
    [layers]
  );
  const selectedLayersPresentCount = useMemo(
    () => selectedLayerIds.filter((id) => layerIdsInDoc.has(id)).length,
    [selectedLayerIds, layerIdsInDoc]
  );
  const canDeleteToolbarLayer = hasMultiLayerSelection
    ? selectedLayersPresentCount > 0
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

  return (
    <Box
      className="sketch-layers-panel sketch-panel-right"
      css={panelStyles}
    >
      {/* ── Color Selector ── */}
      {showColorPicker && (
        <Box className="sketch-layers-panel__color-picker">
          <HueTriangleColorPicker
            color={foregroundColor}
            onColorChange={onForegroundColorChange}
          />
        </Box>
      )}

      {/* Add layers (row 1) + layer ops (row 2), left-aligned for predictable icon positions */}
      <Box className="layer-actions sketch-layers-panel__layer-toolbar">
        <FlexRow
          className="sketch-layers-panel__add-layers-row"
          align="center"
          wrap
          gap={0.5}
          sx={{
            rowGap: 0.5
          }}
        >
          <Tooltip title="Add Transparent Layer" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
            <IconButton
              aria-label="Add Transparent Layer"
              size="small"
              onClick={() => onAddLayer(null)}
              sx={{
                width: 26,
                height: 26,
                padding: 0,
                borderRadius: BORDER_RADIUS.lg,
                border: `1px solid ${theme.vars.palette.grey[500]}`,
                background: `repeating-conic-gradient(${theme.vars.palette.grey[600]} 0% 25%, ${theme.vars.palette.grey[800]} 0% 50%) 50% / 8px 8px`,
                "&:hover": { borderColor: theme.vars.palette.grey[300] }
              }}
            >
              <AddIcon
                sx={{ fontSize: "var(--fontSizeNormal)", color: theme.vars.palette.grey[400] }}
              />
            </IconButton>
          </Tooltip>
          <Tooltip title="Add Black Layer" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
            <IconButton
              aria-label="Add Black Layer"
              size="small"
              onClick={() => onAddLayer("#000000")}
              sx={{
                width: 26,
                height: 26,
                padding: 0,
                borderRadius: BORDER_RADIUS.lg,
                border: `1px solid ${theme.vars.palette.grey[500]}`,
                backgroundColor: "#000000",
                "&:hover": {
                  borderColor: theme.vars.palette.grey[300],
                  backgroundColor: "#111111"
                }
              }}
            >
              <AddIcon
                sx={{ fontSize: "var(--fontSizeNormal)", color: theme.vars.palette.grey[500] }}
              />
            </IconButton>
          </Tooltip>
          <Tooltip title="Add White Layer" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
            <IconButton
              aria-label="Add White Layer"
              size="small"
              onClick={() => onAddLayer("#ffffff")}
              sx={{
                width: 26,
                height: 26,
                padding: 0,
                borderRadius: BORDER_RADIUS.lg,
                border: `1px solid ${theme.vars.palette.grey[500]}`,
                backgroundColor: "#ffffff",
                "&:hover": {
                  borderColor: theme.vars.palette.grey[300],
                  backgroundColor: "#eeeeee"
                }
              }}
            >
              <AddIcon
                sx={{ fontSize: "var(--fontSizeNormal)", color: theme.vars.palette.grey[600] }}
              />
            </IconButton>
          </Tooltip>
          <Tooltip title="Add Gray Layer" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
            <IconButton
              aria-label="Add Gray Layer"
              size="small"
              onClick={() => onAddLayer("#808080")}
              sx={{
                width: 26,
                height: 26,
                padding: 0,
                borderRadius: BORDER_RADIUS.lg,
                border: `1px solid ${theme.vars.palette.grey[500]}`,
                backgroundColor: "#808080",
                "&:hover": {
                  borderColor: theme.vars.palette.grey[300],
                  backgroundColor: "#999999"
                }
              }}
            >
              <AddIcon
                sx={{ fontSize: "var(--fontSizeNormal)", color: theme.vars.palette.grey[300] }}
              />
            </IconButton>
          </Tooltip>
          <Tooltip
            title="Add Text-to-Image Layer"
            enterDelay={SKETCH_TOOLTIP_DELAY_MS}
            enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}
          >
            <IconButton
              aria-label="Add Text-to-Image Layer"
              size="small"
              onClick={() => addDirectGenLayer("text-to-image")}
              data-testid="layers-panel-add-text-to-image"
              sx={{
                ...ADD_ACTION_ICON_SX,
                color: "secondary.main",
                "&:hover": {
                  backgroundColor: "grey.800",
                  color: "secondary.light"
                }
              }}
            >
              <AutoAwesomeIcon sx={{ fontSize: "var(--fontSizeNormal)" }} />
            </IconButton>
          </Tooltip>
          <Tooltip
            title="Add Image-to-Image Layer"
            enterDelay={SKETCH_TOOLTIP_DELAY_MS}
            enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}
          >
            <IconButton
              aria-label="Add Image-to-Image Layer"
              size="small"
              onClick={() => addDirectGenLayer("image-to-image")}
              data-testid="layers-panel-add-image-to-image"
              sx={ADD_ACTION_ICON_SX}
            >
              <AutoFixHighIcon sx={{ fontSize: "var(--fontSizeNormal)" }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="New empty layer group (folder)" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
            <IconButton
              aria-label="New empty layer group (folder)"
              size="small"
              onClick={() => onAddGroup()}
              sx={ADD_ACTION_ICON_SX}
            >
              <CreateNewFolderIcon sx={{ fontSize: "var(--fontSizeNormal)" }} />
            </IconButton>
          </Tooltip>
          <Tooltip
            title="Generate Layer from any workflow with image output"
            enterDelay={SKETCH_TOOLTIP_DELAY_MS}
            enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}
          >
            <IconButton
              aria-label="Generate Layer (Text-to-Image)"
              size="small"
              onClick={() => setGenerateDialogOpen(true)}
              data-testid="layers-panel-generate-layer"
              sx={ADD_ACTION_ICON_SX}
            >
              <AddPhotoAlternateIcon sx={{ fontSize: "var(--fontSizeNormal)" }} />
            </IconButton>
          </Tooltip>
        </FlexRow>
      </Box>

      <Divider />

      {/* Layer list: cap height (~half viewport) so many layers scroll without stretching the panel */}
      <FlexColumn
        className="sketch-layers-panel__layer-list-scroll"
        sx={{
          gap: getSpacingPx(SPACING.xs),
          minHeight: 0,
          maxHeight: "50vh",
          overflowY: "auto"
        }}
      >
        {layerRows.map(({ layer, depth }) => {
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
              bindingStatus={layerBindings[layer.id]?.status}
            />
          );
        })}
      </FlexColumn>

      <Divider />

      {/* Layer-ops toolbar: clean, evenly-spaced muted icons (no dividers).
          Role / combine / transform ops sit on the left; the lifecycle pair
          (duplicate · delete) is pushed to the right edge. Every action here
          is also available in the layer right-click menu. */}
      <FlexRow
        className="sketch-layers-panel__layer-ops"
        align="center"
        wrap
        gap={0.5}
        sx={{ rowGap: 0.5, minHeight: 30, py: 0.5 }}
      >
        {/* Mask */}
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
            aria-label={
              maskLayerId === activeLayerId
                ? "Remove Mask Designation"
                : "Set as Mask Layer"
            }
            size="small"
            onClick={() =>
              onSetMaskLayer(
                maskLayerId === activeLayerId ? null : activeLayerId
              )
            }
            sx={{
              ...OPS_ICON_SX,
              ...(maskLayerId === activeLayerId ? { color: "warning.main" } : {})
            }}
          >
            <MaskIcon style={{ width: "1.125rem", height: "1.125rem" }} />
          </IconButton>
        </Tooltip>

        {/* Alpha Lock */}
        <Tooltip
          title={
            activeLayer?.alphaLock ? "Unlock Transparency" : "Lock Transparency"
          }
          enterDelay={SKETCH_TOOLTIP_DELAY_MS}
          enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}
        >
          <IconButton
            aria-label={
              activeLayer?.alphaLock ? "Unlock Transparency" : "Lock Transparency"
            }
            size="small"
            onClick={() => onToggleAlphaLock(activeLayerId)}
            sx={{
              ...OPS_ICON_SX,
              ...(activeLayer?.alphaLock ? { color: "info.main" } : {})
            }}
          >
            <LockIcon sx={{ fontSize: "var(--fontSizeBig)" }} />
          </IconButton>
        </Tooltip>

        {/* Group selected */}
        <Tooltip
          title="Group selected layers"
          enterDelay={SKETCH_TOOLTIP_DELAY_MS}
          enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}
        >
          <span>
            <IconButton
              aria-label="Group selected layers"
              size="small"
              onClick={onGroupSelectedLayers}
              disabled={!hasMultiLayerSelection}
              sx={OPS_ICON_SX}
            >
              <CreateNewFolderIcon sx={{ fontSize: "var(--fontSizeBig)" }} />
            </IconButton>
          </span>
        </Tooltip>

        {/* Lifecycle, right-aligned: Duplicate · Delete */}
        <FlexRow align="center" gap={0.5} sx={{ ml: "auto" }}>
          <Tooltip
            title="Duplicate Layer"
            enterDelay={SKETCH_TOOLTIP_DELAY_MS}
            enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}
          >
            <IconButton
              aria-label="Duplicate Layer"
              size="small"
              onClick={() => onDuplicateLayer(activeLayerId)}
              sx={OPS_ICON_SX}
            >
              <ContentCopyIcon sx={{ fontSize: "var(--fontSizeBig)" }} />
            </IconButton>
          </Tooltip>
          <Tooltip
            title={
              hasMultiLayerSelection ? "Remove selected layers" : "Remove Layer"
            }
            enterDelay={SKETCH_TOOLTIP_DELAY_MS}
            enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}
          >
            <span>
              <IconButton
                aria-label="Remove active layer"
                size="small"
                onClick={() =>
                  hasMultiLayerSelection
                    ? onDeleteSelectedLayers()
                    : onRemoveLayer(activeLayerId)
                }
                disabled={!canDeleteToolbarLayer}
                sx={OPS_ICON_SX}
              >
                <DeleteIcon width={18} height={18} />
              </IconButton>
            </span>
          </Tooltip>
        </FlexRow>
      </FlexRow>

      <Divider />

      {/* Active layer opacity & blend mode */}
      {activeLayer && (
        <>
          <Box className="opacity-row sketch-layers-panel__opacity-row">
            <Text sx={{ fontSize: SKETCH_FONT.md, color: SKETCH_COLORS.textMuted }}>
              Opacity
            </Text>
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
            <Text
              sx={{ fontSize: SKETCH_FONT.md, minWidth: "30px", textAlign: "right" }}
            >
              {Math.round(activeLayer.opacity * 100)}%
            </Text>
          </Box>
          <FormControl
            className="sketch-layers-panel__blend-mode"
            size="small"
            sx={{ px: getSpacingPx(SPACING.sm) }}
          >
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
            <Box
              className="sketch-layers-panel__active-layer-ref"
              sx={{ px: getSpacingPx(SPACING.sm), pt: getSpacingPx(SPACING.xs) }}
            >
              <Text
                sx={{
                  fontSize: SKETCH_FONT.xs,
                  color: SKETCH_COLORS.textFaint,
                  lineHeight: 1.35,
                  wordBreak: "break-all",
                  fontFamily: "monospace"
                }}
              >
                {summarizeLayerImageReference(activeLayer.imageReference)}
              </Text>
            </Box>
          ) : null}
        </>
      )}

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
          ctxLayer != null &&
          !isMulti &&
          findMergeDownTargetIndex(layers, ctxLayer.id) !== -1;
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
        const handleCtxRotate180 = () => {
          onRotate180();
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

        const menuItemSx = { fontSize: "var(--fontSizeSmall)", py: getSpacingPx(SPACING.xs), minHeight: 0 };

        return (
          <Menu
            className="sketch-layers-panel__context-menu"
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

            <Divider sx={{ my: getSpacingPx(SPACING.xs) }} />

            <MenuItem sx={menuItemSx} onClick={handleCtxVisibility}>
              {ctxLayer?.visible === false ? "Show Layer" : "Hide Layer"}
            </MenuItem>
            <MenuItem
              sx={menuItemSx}
              onClick={handleCtxDuplicate}
              disabled={!ctxLayer}
            >
              {isMulti ? "Duplicate Layers" : "Duplicate"}
            </MenuItem>
            <MenuItem sx={menuItemSx} onClick={handleCtxDelete}>
              Remove
            </MenuItem>

            <Divider sx={{ my: getSpacingPx(SPACING.xs) }} />

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
              onClick={handleCtxRotate180}
              disabled={ctxPixelActionsDisabled || isMulti}
            >
              Rotate 180°
            </MenuItem>
            {!isMulti && (
              <MenuItem
                sx={menuItemSx}
                onClick={handleCtxMergeDown}
                disabled={!ctxCanMergeDown}
              >
                Merge Down
              </MenuItem>
            )}
            <MenuItem sx={menuItemSx} onClick={handleCtxFlatten}>
              Flatten Visible
            </MenuItem>

            <Divider sx={{ my: getSpacingPx(SPACING.xs) }} />

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

      <CreateGeneratedLayerDialog
        open={generateDialogOpen}
        onClose={() => setGenerateDialogOpen(false)}
      />
    </Box>
  );
};

export default memo(SketchLayersPanel);
