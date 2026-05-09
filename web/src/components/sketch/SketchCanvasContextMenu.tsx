/** @jsxImportSource @emotion/react */
import React, { memo, useEffect, useState } from "react";
import { sketchToolSettingsContainerSx, SKETCH_FONT, SKETCH_TOOLTIP_DELAY_MS } from "./sketchStyles";
import { alpha, useTheme } from "@mui/material/styles";
import {
  Box,
  ButtonBase,
  Divider,
  IconButton,
  Popover,
  Stack,
  Tooltip,
  Typography
} from "@mui/material";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import InvertColorsIcon from "@mui/icons-material/InvertColors";
import DeselectIcon from "@mui/icons-material/Deselect";
import RestoreIcon from "@mui/icons-material/Restore";
import FormatColorFillIcon from "@mui/icons-material/FormatColorFill";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import NoteAddIcon from "@mui/icons-material/NoteAdd";
import TransformIcon from "@mui/icons-material/Transform";
import HighlightAltIcon from "@mui/icons-material/HighlightAlt";
import CropIcon from "@mui/icons-material/Crop";
import {
  BrushSettings,
  BlurSettings,
  CloneStampSettings,
  EraserSettings,
  FillSettings,
  GradientSettings,
  type LayerType,
  PencilSettings,
  SelectSettings,
  SegmentSettings,
  SegmentationStatus,
  ShapeSettings,
  SketchTool,
  isShapeTool
} from "./types";
import type { SamModelInfo } from "./sam";
import {
  CONTEXT_MENU_TOOL_GROUPS,
  getToolShortcutActionId,
  getToolDefinition,
  type ToolDefinition
} from "./toolDefinitions";
import { displayCombo } from "./shortcuts";
import { ToolSettingsPanel, getToolSettingsLabel } from "./ToolSettingsPanels";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        mb: 1.05,
        fontSize: SKETCH_FONT.section,
        fontWeight: 800,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "text.secondary"
      }}
    >
      {children}
    </Typography>
  );
}

function ColorPreview({ label, color }: { label: string; color: string }) {
  return (
    <Stack spacing={0.4} alignItems="center">
      <Box
        sx={{
          width: 22,
          height: 22,
          borderRadius: "7px",
          border: "1px solid",
          borderColor: "var(--gray-700)",
          background: color
        }}
      />
      <Typography sx={{ fontSize: SKETCH_FONT.xs, fontWeight: 700, color: "text.secondary" }}>
        {label}
      </Typography>
    </Stack>
  );
}

interface SelectionMenuItemProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  endAdornment?: React.ReactNode;
}

function SelectionMenuItem({
  icon,
  label,
  shortcut,
  disabled,
  onClick,
  endAdornment
}: SelectionMenuItemProps) {
  return (
    <ButtonBase
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        width: "100%",
        px: 1,
        py: 0.5,
        borderRadius: "6px",
        justifyContent: "flex-start",
        textAlign: "left",
        opacity: disabled ? 0.4 : 1,
        "&:hover": {
          backgroundColor: "action.hover"
        }
      }}
    >
      <Box sx={{ flex: "0 0 auto", display: "flex", color: "text.secondary" }}>
        {icon}
      </Box>
      <Typography sx={{ flex: 1, fontSize: SKETCH_FONT.md, fontWeight: 500, color: "text.primary" }}>
        {label}
      </Typography>
      {shortcut && (
        <Typography sx={{ fontSize: SKETCH_FONT.xs, fontWeight: 600, color: "text.secondary", whiteSpace: "nowrap" }}>
          {shortcut}
        </Typography>
      )}
      {!shortcut && endAdornment}
    </ButtonBase>
  );
}

interface ToolGridButtonProps {
  definition: ToolDefinition;
  selected: boolean;
  shortcut: string;
  onClick: () => void;
  onDoubleClick: () => void;
  /** Narrow tiles (slim tools column); keeps labels readable at smaller cell width. */
  compact?: boolean;
}

function ToolGridButton({
  definition,
  selected,
  shortcut,
  onClick,
  onDoubleClick,
  compact = false
}: ToolGridButtonProps) {
  const theme = useTheme();
  const { Icon } = definition;
  const inactiveBg = theme.vars.palette.grey[800];
  const hoverBg = theme.vars.palette.grey[700];
  const shortcutBg = theme.vars.palette.grey[900];

  return (
    <ButtonBase
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      aria-label={definition.label}
      sx={{
        position: "relative",
        minHeight: compact ? 44 : 64,
        borderRadius: "8px",
        border: "1px solid",
        borderColor: selected ? "primary.main" : "transparent",
        backgroundColor: selected
          ? alpha(theme.palette.primary.main, 0.16)
          : inactiveBg,
        px: compact ? 0.35 : 0.75,
        py: compact ? 0.45 : 0.8,
        alignItems: "center",
        justifyContent: "center",
        display: "flex",
        flexDirection: "column",
        textAlign: "center",
        transition: "all 120ms ease",
        "&:hover": {
          backgroundColor: selected
            ? alpha(theme.palette.primary.main, 0.22)
            : hoverBg,
          borderColor: selected ? "primary.main" : "text.secondary"
        }
      }}
    >
      {shortcut ? (
        <Box
          sx={{
            position: "absolute",
            top: compact ? 4 : 8,
            right: compact ? 4 : 8,
            px: compact ? 0.35 : 0.5,
            py: compact ? 0.12 : 0.1,
            borderRadius: 1,
            backgroundColor: shortcutBg,
            fontSize: compact ? SKETCH_FONT.xs : SKETCH_FONT.sm,
            fontWeight: 700,
            lineHeight: 1.2,
            color: "text.secondary"
          }}
        >
          {shortcut}
        </Box>
      ) : null}
      <Icon
        sx={{
          fontSize: compact ? 16 : 20,
          color: selected ? "primary.light" : "text.primary"
        }}
      />
      <Typography
        sx={{
          mt: compact ? 0.35 : 0.65,
          fontSize: compact ? SKETCH_FONT.xs : SKETCH_FONT.md,
          fontWeight: 400,
          color: "text.secondary",
          lineHeight: 1.15,
          ...(compact
            ? {
                display: "-webkit-box",
                WebkitBoxOrient: "vertical" as const,
                WebkitLineClamp: 2,
                overflow: "hidden",
                wordBreak: "break-word" as const,
                px: 0.15
              }
            : {})
        }}
      >
        {definition.label}
      </Typography>
    </ButtonBase>
  );
}

export interface SketchCanvasContextMenuProps {
  /** Applied to the menu paper (e.g. `sketch-editor__context-menu`). */
  className?: string;
  open: boolean;
  position: { x: number; y: number } | null;
  activeTool: SketchTool;
  brushSettings: BrushSettings;
  pencilSettings: PencilSettings;
  eraserSettings: EraserSettings;
  shapeSettings: ShapeSettings;
  fillSettings: FillSettings;
  blurSettings: BlurSettings;
  gradientSettings: GradientSettings;
  cloneStampSettings: CloneStampSettings;
  foregroundColor: string;
  backgroundColor: string;
  canUndo: boolean;
  canRedo: boolean;
  onClose: () => void;
  onToolChange: (tool: SketchTool) => void;
  onBrushSettingsChange: (settings: Partial<BrushSettings>) => void;
  onPencilSettingsChange: (settings: Partial<PencilSettings>) => void;
  onEraserSettingsChange: (settings: Partial<EraserSettings>) => void;
  onShapeSettingsChange: (settings: Partial<ShapeSettings>) => void;
  onFillSettingsChange: (settings: Partial<FillSettings>) => void;
  onBlurSettingsChange: (settings: Partial<BlurSettings>) => void;
  onGradientSettingsChange: (settings: Partial<GradientSettings>) => void;
  onCloneStampSettingsChange: (settings: Partial<CloneStampSettings>) => void;
  selectSettings: SelectSettings;
  hasActiveSelection: boolean;
  adjustBrightness?: number;
  adjustContrast?: number;
  adjustSaturation?: number;
  onSelectSettingsChange: (settings: Partial<SelectSettings>) => void;
  onInvertSelection: () => void;
  onCropCanvasToSelection: () => void;
  onFeatherSelection: () => void;
  onSmoothSelectionBorders: () => void;
  onStrokeSelectionBorder: () => void;
  onDeselectSelection: () => void;
  onReselectSelection: () => void;
  onFillSelectionWithForeground: () => void;
  onNewLayer: (type?: Extract<LayerType, "raster" | "mask">) => void;
  onLayerViaCopy: () => void;
  onLayerViaCut: () => void;
  onFreeTransform: () => void;
  onTransformSelection?: () => void;
  onAdjustBrightnessChange?: (value: number) => void;
  onAdjustContrastChange?: (value: number) => void;
  onAdjustSaturationChange?: (value: number) => void;
  onAdjustApply?: () => void;
  onAdjustCancel?: () => void;
  transformScaleX?: number;
  transformScaleY?: number;
  transformRotation?: number;
  onTransformCommit?: () => void;
  onTransformCancel?: () => void;
  onTransformReset?: () => void;
  segmentSettings?: SegmentSettings;
  onSegmentSettingsChange?: (settings: Partial<SegmentSettings>) => void;
  segmentationStatus?: SegmentationStatus;
  segmentModelInfo?: SamModelInfo | null;
  onRunSegmentation?: () => void;
  onApplySegmentResult?: () => void;
  onDiscardSegmentResult?: () => void;
  onCancelSegmentation?: () => void;
  onClearSegmentPrompts?: () => void;
  onCheckSegmentModel?: () => void;
  onSwapColors: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearLayer: () => void;
  onExportPng: () => void;
}

const CONTEXT_MENU_HEADER_HEIGHT_PX = 52;

const SketchCanvasContextMenu: React.FC<SketchCanvasContextMenuProps> = ({
  className: paperClassName,
  open,
  position,
  activeTool,
  brushSettings,
  pencilSettings,
  eraserSettings,
  shapeSettings,
  fillSettings,
  blurSettings,
  gradientSettings,
  cloneStampSettings,
  foregroundColor,
  backgroundColor,
  canUndo,
  canRedo,
  onClose,
  onToolChange,
  onBrushSettingsChange,
  onPencilSettingsChange,
  onEraserSettingsChange,
  onShapeSettingsChange,
  onFillSettingsChange,
  onBlurSettingsChange,
  onGradientSettingsChange,
  onCloneStampSettingsChange,
  selectSettings,
  hasActiveSelection,
  adjustBrightness,
  adjustContrast,
  adjustSaturation,
  onSelectSettingsChange,
  onInvertSelection,
  onCropCanvasToSelection,
  onFeatherSelection,
  onSmoothSelectionBorders,
  onStrokeSelectionBorder,
  onDeselectSelection,
  onReselectSelection,
  onFillSelectionWithForeground,
  onNewLayer,
  onLayerViaCopy,
  onLayerViaCut,
  onFreeTransform,
  onTransformSelection,
  onAdjustBrightnessChange,
  onAdjustContrastChange,
  onAdjustSaturationChange,
  onAdjustApply,
  onAdjustCancel,
  transformScaleX,
  transformScaleY,
  transformRotation,
  onTransformCommit,
  onTransformCancel,
  onTransformReset,
  segmentSettings,
  onSegmentSettingsChange,
  segmentationStatus,
  segmentModelInfo,
  onRunSegmentation,
  onApplySegmentResult,
  onDiscardSegmentResult,
  onCancelSegmentation,
  onClearSegmentPrompts,
  onCheckSegmentModel,
  onSwapColors,
  onUndo,
  onRedo,
  onClearLayer,
  onExportPng
}) => {
  const theme = useTheme();
  const activeDefinition = getToolDefinition(activeTool);
  const activeShortcutActionId = getToolShortcutActionId(
    activeDefinition.tool,
    selectSettings.mode
  );
  const activeShortcut = activeShortcutActionId
    ? displayCombo(activeShortcutActionId)
    : "";
  const surfaceSoft = theme.vars.palette.grey[800];
  const ActiveIcon = activeDefinition.Icon;
  const getToolShortcut = (tool: SketchTool): string => {
    const actionId = getToolShortcutActionId(tool, selectSettings.mode);
    return actionId ? displayCombo(actionId) : "";
  };
  const [newLayerMenuAnchor, setNewLayerMenuAnchor] =
    useState<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      setNewLayerMenuAnchor(null);
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [open, onClose]);

  const renderColorContext = () => {
    if (isShapeTool(activeTool)) {
      return (
        <Stack direction="row" spacing={1}>
          <ColorPreview label="Stroke" color={shapeSettings.strokeColor} />
          <ColorPreview label="Fill" color={shapeSettings.fillColor} />
        </Stack>
      );
    }

    if (activeTool === "gradient") {
      return (
        <Stack direction="row" spacing={1}>
          <ColorPreview label="Start" color={gradientSettings.startColor} />
          <ColorPreview label="End" color={gradientSettings.endColor} />
        </Stack>
      );
    }

    return (
      <Stack direction="row" spacing={1} alignItems="center">
        <ColorPreview label="FG" color={foregroundColor} />
        <ColorPreview label="BG" color={backgroundColor} />
        <IconButton
          size="small"
          onClick={onSwapColors}
          aria-label="Swap foreground and background colors"
          sx={{
            mt: 0,
            border: "1px solid",
            borderColor: theme.vars.palette.grey[700],
            backgroundColor: surfaceSoft,
            p: 0.5,
            "&:hover": {
              backgroundColor: alpha(theme.palette.primary.main, 0.14)
            }
          }}
        >
          <SwapHorizIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Stack>
    );
  };

  return (
    <>
      <Popover
      open={open}
      onClose={onClose}
      transitionDuration={{ enter: 90, exit: 60 }}
      anchorReference="anchorPosition"
      transformOrigin={{
        vertical: "center",
        horizontal: "center"
      }}
      anchorPosition={
        open && position ? { top: position.y, left: position.x } : undefined
      }
      disableRestoreFocus
      slotProps={{
        paper: {
          className: ["sketch-context-menu", paperClassName]
            .filter(Boolean)
            .join(" "),
          sx: {
            width: 620,
            maxWidth: "calc(100vw - 24px)",
            borderRadius: "12px",
            backgroundImage: "none",
            backgroundColor: theme.vars.palette.grey[900],
            backdropFilter: "blur(16px)",
            boxShadow: theme.shadows[12],
            p: 1.25
          }
        }
      }}
    >
      <Box
        className="sketch-context-menu__root"
        sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}
      >
        <Box
          className="sketch-context-menu__header"
          sx={{
            flex: "0 0 auto",
            height: CONTEXT_MENU_HEADER_HEIGHT_PX,
            minHeight: CONTEXT_MENU_HEADER_HEIGHT_PX,
            maxHeight: CONTEXT_MENU_HEADER_HEIGHT_PX,
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 1,
            px: 1.25,
            py: 0,
            borderRadius: "8px",
            // border: "1px solid",
            // borderColor: alpha(theme.palette.primary.main, 0.28),
            // backgroundColor: alpha(theme.palette.primary.main, 0.1),
            overflow: "hidden"
          }}
        >
          <Box
            className="sketch-context-menu__header-tool-icon"
            sx={{
              flex: "0 0 auto",
              width: 34,
              height: 34,
              borderRadius: "7px",
              display: "grid",
              placeItems: "center",
              // backgroundColor: alpha(theme.palette.primary.main, 0.18),
              color: "primary.light"
            }}
          >
            <ActiveIcon sx={{ fontSize: 22 }} />
          </Box>
          <Typography
            className="sketch-context-menu__header-tool-label"
            component="span"
            sx={{
              flex: "0 0 auto",
              fontSize: SKETCH_FONT.section,
              fontWeight: 700,
              color: "text.primary",
              whiteSpace: "nowrap"
            }}
          >
            {activeDefinition.label}
          </Typography>
          {activeShortcut ? (
            <Box
              className="sketch-context-menu__header-shortcut"
              sx={{
                flex: "0 0 auto",
                px: 0.65,
                py: 0.2,
                borderRadius: "6px",
                border: "1px solid",
                borderColor: theme.vars.palette.grey[600],
                fontSize: SKETCH_FONT.sm,
                fontWeight: 700,
                lineHeight: 1.2,
                color: "text.secondary",
                fontVariantNumeric: "tabular-nums"
              }}
            >
              {activeShortcut}
            </Box>
          ) : null}
          <Box sx={{ flex: 1, minWidth: 0 }} />
          <Divider
            orientation="vertical"
            flexItem
            sx={{
              borderColor: alpha(theme.palette.primary.main, 0.22),
              my: 0.75
            }}
          />
          <Box
            className="sketch-context-menu__header-colors"
            sx={{ flex: "0 0 auto", display: "flex", alignItems: "center" }}
          >
            {renderColorContext()}
          </Box>
        </Box>

        <Box
          className="sketch-context-menu__body"
          sx={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(128px, 152px)",
            gap: 8,
            padding: 2,
            alignItems: "stretch",
            minWidth: 0,
            backgroundColor: "var(--palette-background-paper)",
            "& > *:first-of-type": {
              position: "relative",
              "&::after": {
                content: '""',
                position: "absolute",
                top: 4,
                right: -10,
                bottom: 4,
                width: "1px"
              }
            }
          }}
        >
          <Stack
            className="sketch-context-menu__quick"
            spacing={1.1}
            sx={{
              minWidth: 0,
              minHeight: 360,
              height: "100%",
              borderRadius: "8px",
              px: 1.35,
              py: 1.2
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <SectionLabel>{getToolSettingsLabel(activeTool)}</SectionLabel>
              <Box sx={sketchToolSettingsContainerSx}>
                <ToolSettingsPanel
                  activeTool={activeTool}
                  brushSettings={brushSettings}
                  pencilSettings={pencilSettings}
                  eraserSettings={eraserSettings}
                  shapeSettings={shapeSettings}
                  fillSettings={fillSettings}
                  blurSettings={blurSettings}
                  gradientSettings={gradientSettings}
                  cloneStampSettings={cloneStampSettings}
                  selectSettings={selectSettings}
                  hasActiveSelection={hasActiveSelection}
                  adjustBrightness={adjustBrightness}
                  adjustContrast={adjustContrast}
                  adjustSaturation={adjustSaturation}
                  onBrushSettingsChange={onBrushSettingsChange}
                  onPencilSettingsChange={onPencilSettingsChange}
                  onEraserSettingsChange={onEraserSettingsChange}
                  onShapeSettingsChange={onShapeSettingsChange}
                  onFillSettingsChange={onFillSettingsChange}
                  onBlurSettingsChange={onBlurSettingsChange}
                  onGradientSettingsChange={onGradientSettingsChange}
                  onCloneStampSettingsChange={onCloneStampSettingsChange}
                  onSelectSettingsChange={onSelectSettingsChange}
                  onInvertSelection={onInvertSelection}
                  onFeatherSelection={onFeatherSelection}
                  onSmoothSelectionBorders={onSmoothSelectionBorders}
                  onStrokeSelectionBorder={onStrokeSelectionBorder}
                  onAdjustBrightnessChange={onAdjustBrightnessChange}
                  onAdjustContrastChange={onAdjustContrastChange}
                  onAdjustSaturationChange={onAdjustSaturationChange}
                  onAdjustApply={onAdjustApply}
                  onAdjustCancel={onAdjustCancel}
                  transformScaleX={transformScaleX}
                  transformScaleY={transformScaleY}
                  transformRotation={transformRotation}
                  onTransformCommit={onTransformCommit}
                  onTransformCancel={onTransformCancel}
                  onTransformReset={onTransformReset}
                  segmentSettings={segmentSettings}
                  onSegmentSettingsChange={onSegmentSettingsChange}
                  segmentationStatus={segmentationStatus}
                  segmentModelInfo={segmentModelInfo}
                  onRunSegmentation={onRunSegmentation}
                  onApplySegmentResult={onApplySegmentResult}
                  onDiscardSegmentResult={onDiscardSegmentResult}
                  onCancelSegmentation={onCancelSegmentation}
                  onClearSegmentPrompts={onClearSegmentPrompts}
                  onCheckSegmentModel={onCheckSegmentModel}
                />
              </Box>
            </Box>

            {/* Selection actions (visible when select tool is active or selection exists) */}
            {(activeTool === "select" || hasActiveSelection) && (
              <Box
                className="sketch-context-menu__selection-actions"
                sx={{
                  borderRadius: "8px",
                  px: 0
                }}
              >
                <SectionLabel>Selection</SectionLabel>
                <Stack spacing={0.3}>
                  <SelectionMenuItem
                    icon={<InvertColorsIcon sx={{ fontSize: 16 }} />}
                    label="Select Inverse"
                    shortcut={displayCombo("invert-selection")}
                    onClick={() => { onInvertSelection(); onClose(); }}
                  />
                  <SelectionMenuItem
                    icon={<DeselectIcon sx={{ fontSize: 16 }} />}
                    label="Deselect"
                    shortcut={displayCombo("deselect")}
                    disabled={!hasActiveSelection}
                    onClick={() => { onDeselectSelection(); onClose(); }}
                  />
                  <SelectionMenuItem
                    icon={<RestoreIcon sx={{ fontSize: 16 }} />}
                    label="Reselect"
                    shortcut={displayCombo("reselect")}
                    onClick={() => { onReselectSelection(); onClose(); }}
                  />
                  <SelectionMenuItem
                    icon={<CropIcon sx={{ fontSize: 16 }} />}
                    label="Crop to Selection"
                    disabled={!hasActiveSelection}
                    onClick={() => { onCropCanvasToSelection(); onClose(); }}
                  />
                  <Divider sx={{ my: 0.5, borderColor: surfaceSoft }} />
                  <SelectionMenuItem
                    icon={<ContentCopyIcon sx={{ fontSize: 16 }} />}
                    label="Layer via Copy"
                    shortcut={displayCombo("layer-via-copy")}
                    disabled={!hasActiveSelection}
                    onClick={() => { onLayerViaCopy(); onClose(); }}
                  />
                  <SelectionMenuItem
                    icon={<ContentCutIcon sx={{ fontSize: 16 }} />}
                    label="Layer via Cut"
                    shortcut={displayCombo("layer-via-cut")}
                    disabled={!hasActiveSelection}
                    onClick={() => { onLayerViaCut(); onClose(); }}
                  />
                  <SelectionMenuItem
                    icon={<NoteAddIcon sx={{ fontSize: 16 }} />}
                    label="New Layer..."
                    endAdornment={
                      <Typography
                        aria-hidden="true"
                        sx={{
                          fontSize: SKETCH_FONT.md,
                          fontWeight: 700,
                          color: "text.secondary"
                        }}
                      >
                        ›
                      </Typography>
                    }
                    onClick={(event) => {
                      setNewLayerMenuAnchor(event.currentTarget);
                    }}
                  />
                  <Divider sx={{ my: 0.5, borderColor: surfaceSoft }} />
                  <SelectionMenuItem
                    icon={<TransformIcon sx={{ fontSize: 16 }} />}
                    label="Free Transform"
                    shortcut={displayCombo("free-transform")}
                    onClick={() => { onFreeTransform(); onClose(); }}
                  />
                  <SelectionMenuItem
                    icon={<HighlightAltIcon sx={{ fontSize: 16 }} />}
                    label="Transform Selection"
                    disabled={!hasActiveSelection || !onTransformSelection}
                    onClick={() => { onTransformSelection?.(); onClose(); }}
                  />
                  <SelectionMenuItem
                    icon={<FormatColorFillIcon sx={{ fontSize: 16 }} />}
                    label="Fill"
                    disabled={!hasActiveSelection}
                    onClick={() => { onFillSelectionWithForeground(); onClose(); }}
                  />
                  <SelectionMenuItem
                    icon={<InvertColorsIcon sx={{ fontSize: 16, transform: "scaleX(-1)" }} />}
                    label="Stroke"
                    disabled={!hasActiveSelection}
                    onClick={() => { onStrokeSelectionBorder(); onClose(); }}
                  />
                </Stack>
              </Box>
            )}

            <Box
              className="sketch-context-menu__canvas-actions"
              sx={{
                borderRadius: "8px",
                px: 0,
                py: 0
              }}
            >
              <SectionLabel>Canvas</SectionLabel>
              <Stack direction="row" spacing={0.8}>
                <Tooltip title="Undo" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => {
                        onUndo();
                        onClose();
                      }}
                      disabled={!canUndo}
                      aria-label="Undo"
                      sx={{
                        borderRadius: "8px",
                        p: 0.65
                      }}
                    >
                      <UndoIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Redo" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => {
                        onRedo();
                        onClose();
                      }}
                      disabled={!canRedo}
                      aria-label="Redo"
                      sx={{
                        borderRadius: "8px",
                        p: 0.65
                      }}
                    >
                      <RedoIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Clear Layer" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
                  <IconButton
                    size="small"
                    onClick={() => {
                      onClearLayer();
                      onClose();
                    }}
                    aria-label="Clear layer"
                    sx={{
                      color: "error.main",
                      borderRadius: "8px",
                      p: 0.65
                    }}
                  >
                    <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Export PNG" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
                  <IconButton
                    size="small"
                    onClick={() => {
                      onExportPng();
                      onClose();
                    }}
                    aria-label="Export PNG"
                    sx={{
                      color: "primary.light",
                      borderRadius: "8px",
                      p: 0.65
                    }}
                  >
                    <SaveAltIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Box>
          </Stack>

          <Box
            className="sketch-context-menu__tools-column"
            sx={{
              minWidth: 0,
              alignSelf: "stretch",
              borderRadius: "8px",
              px: 1.15,
              py: 1.1,
              display: "flex",
              flexDirection: "column"
            }}
          >
            <SectionLabel>Tools</SectionLabel>
            <Stack
              spacing={0.75}
              className="sketch-context-menu__tools-groups"
              sx={{ flex: 1, alignContent: "start", width: "100%" }}
            >
              {CONTEXT_MENU_TOOL_GROUPS.map((group, groupIndex) => (
                <React.Fragment
                  key={group.map((d) => d.tool).join("-")}
                >
                  <Box
                    className="sketch-context-menu__tools-grid"
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 0.65,
                      alignContent: "start"
                    }}
                  >
                    {group.map((definition) => (
                      <ToolGridButton
                        key={definition.tool}
                        definition={definition}
                        compact
                        selected={definition.tool === activeTool}
                        shortcut={getToolShortcut(definition.tool)}
                        onClick={() => onToolChange(definition.tool)}
                        onDoubleClick={() => {
                          onToolChange(definition.tool);
                          onClose();
                        }}
                      />
                    ))}
                  </Box>
                  {groupIndex < CONTEXT_MENU_TOOL_GROUPS.length - 1 ? (
                    <Divider sx={{ borderColor: surfaceSoft, my: 0.15 }} />
                  ) : null}
                </React.Fragment>
              ))}
            </Stack>
          </Box>
        </Box>
      </Box>
      </Popover>
      <Popover
        open={Boolean(newLayerMenuAnchor)}
        anchorEl={newLayerMenuAnchor}
        onClose={() => setNewLayerMenuAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        disableRestoreFocus
      >
        <Box sx={{ minWidth: 180, p: 0.8 }}>
          <Stack spacing={0.3}>
            <SelectionMenuItem
              icon={<NoteAddIcon sx={{ fontSize: 16 }} />}
              label="Raster Layer"
              onClick={() => {
                setNewLayerMenuAnchor(null);
                onNewLayer("raster");
                onClose();
              }}
            />
            <SelectionMenuItem
              icon={<HighlightAltIcon sx={{ fontSize: 16 }} />}
              label="Mask Layer"
              onClick={() => {
                setNewLayerMenuAnchor(null);
                onNewLayer("mask");
                onClose();
              }}
            />
          </Stack>
        </Box>
      </Popover>
    </>
  );
};

export default memo(SketchCanvasContextMenu);
