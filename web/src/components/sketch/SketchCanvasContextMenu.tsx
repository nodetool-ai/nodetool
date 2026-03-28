/** @jsxImportSource @emotion/react */
import React, { memo, useEffect } from "react";
import { sketchToolSettingsContainerSx } from "./sketchStyles";
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
import {
  BrushSettings,
  BlurSettings,
  CloneStampSettings,
  EraserSettings,
  FillSettings,
  GradientSettings,
  PencilSettings,
  SelectSettings,
  SegmentSettings,
  SegmentationStatus,
  ShapeSettings,
  SketchTool,
  isShapeTool
} from "./types";
import { CONTEXT_MENU_TOOLS, getToolDefinition, type ToolDefinition } from "./toolDefinitions";
import { ToolSettingsPanel, getToolSettingsLabel } from "./ToolSettingsPanels";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        mb: 1.05,
        fontSize: "0.72rem",
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

function ColorPreview({
  label,
  color
}: {
  label: string;
  color: string;
}) {
  return (
    <Stack spacing={0.4} alignItems="center">
      <Box
        sx={{
          width: 22,
          height: 22,
          borderRadius: "7px",
          border: "1px solid",
          borderColor: "divider",
          background: color
        }}
      />
      <Typography sx={{ fontSize: "0.62rem", fontWeight: 700, color: "text.secondary" }}>
        {label}
      </Typography>
    </Stack>
  );
}

interface ToolGridButtonProps {
  definition: ToolDefinition;
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}

function ToolGridButton({
  definition,
  selected,
  onClick,
  onDoubleClick
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
        minHeight: 64,
        borderRadius: "8px",
        border: "1px solid",
        borderColor: selected ? "primary.main" : theme.vars.palette.grey[700],
        backgroundColor: selected
          ? alpha(theme.palette.primary.main, 0.16)
          : inactiveBg,
        px: 0.75,
        py: 0.8,
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
      {definition.shortcut && (
        <Box
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            px: 0.45,
            py: 0.1,
            borderRadius: 1,
            backgroundColor: shortcutBg,
            fontSize: "0.56rem",
            fontWeight: 700,
            lineHeight: 1.2,
            color: "text.secondary"
          }}
        >
          {definition.shortcut}
        </Box>
      )}
      <Icon
        sx={{
          fontSize: 20,
          color: selected ? "primary.light" : "text.primary"
        }}
      />
      <Typography
        sx={{
          mt: 0.65,
          fontSize: "0.78rem",
          fontWeight: 400,
          color: "text.secondary"
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
  onFeatherSelection: () => void;
  onSmoothSelectionBorders: () => void;
  onStrokeSelectionBorder: () => void;
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
  onRunSegmentation?: () => void;
  onApplySegmentResult?: () => void;
  onDiscardSegmentResult?: () => void;
  onCancelSegmentation?: () => void;
  onClearSegmentPrompts?: () => void;
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
  onFeatherSelection,
  onSmoothSelectionBorders,
  onStrokeSelectionBorder,
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
  onRunSegmentation,
  onApplySegmentResult,
  onDiscardSegmentResult,
  onCancelSegmentation,
  onClearSegmentPrompts,
  onSwapColors,
  onUndo,
  onRedo,
  onClearLayer,
  onExportPng
}) => {
  const theme = useTheme();
  const activeDefinition = getToolDefinition(activeTool);
  const surfaceSoft = theme.vars.palette.grey[800];
  const ActiveIcon = activeDefinition.Icon;

  useEffect(() => {
    if (!open) {
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
          className: ["sketch-context-menu", paperClassName].filter(Boolean).join(" "),
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
      <Box className="sketch-context-menu__root" sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
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
            border: "1px solid",
            borderColor: alpha(theme.palette.primary.main, 0.28),
            backgroundColor: alpha(theme.palette.primary.main, 0.1),
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
              backgroundColor: alpha(theme.palette.primary.main, 0.18),
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
              fontSize: "0.92rem",
              fontWeight: 700,
              color: "text.primary",
              whiteSpace: "nowrap"
            }}
          >
            {activeDefinition.label}
          </Typography>
          {activeDefinition.shortcut ? (
            <Box
              className="sketch-context-menu__header-shortcut"
              sx={{
                flex: "0 0 auto",
                px: 0.65,
                py: 0.2,
                borderRadius: "6px",
                border: "1px solid",
                borderColor: theme.vars.palette.grey[600],
                fontSize: "0.68rem",
                fontWeight: 700,
                lineHeight: 1.2,
                color: "text.secondary",
                fontVariantNumeric: "tabular-nums"
              }}
            >
              {activeDefinition.shortcut}
            </Box>
          ) : null}
          <Box sx={{ flex: 1, minWidth: 0 }} />
          <Divider
            orientation="vertical"
            flexItem
            sx={{ borderColor: alpha(theme.palette.primary.main, 0.22), my: 0.75 }}
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
            gridTemplateColumns: "minmax(0, 1fr) 220px",
            gap: 1.25,
            alignItems: "stretch",
            minWidth: 0,
            "& > *:first-of-type": {
              position: "relative",
              "&::after": {
                content: '""',
                position: "absolute",
                top: 4,
                right: -10,
                bottom: 4,
                width: "1px",
                backgroundColor: theme.vars.palette.grey[800]
              }
            }
          }}
        >
        <Box
          className="sketch-context-menu__quick"
          sx={{
            minWidth: 0,
            minHeight: 360,
            height: "100%",
            borderRadius: "8px",
            border: "1px solid",
            borderColor: theme.vars.palette.grey[700],
            backgroundColor: theme.vars.palette.grey[800],
            px: 1.35,
            py: 1.2
          }}
        >
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
              onRunSegmentation={onRunSegmentation}
              onApplySegmentResult={onApplySegmentResult}
              onDiscardSegmentResult={onDiscardSegmentResult}
              onCancelSegmentation={onCancelSegmentation}
              onClearSegmentPrompts={onClearSegmentPrompts}
            />
          </Box>
        </Box>

        <Stack className="sketch-context-menu__sidebar" spacing={1.1} sx={{ minWidth: 0 }}>
          <Box
            className="sketch-context-menu__tools"
            sx={{
              borderRadius: "8px",
              border: "1px solid",
              borderColor: theme.vars.palette.grey[700],
              backgroundColor: theme.vars.palette.grey[800],
              px: 1.15,
              py: 1.1
            }}
          >
            <SectionLabel>Tools</SectionLabel>
            <Box
              className="sketch-context-menu__tools-grid"
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 0.7
              }}
            >
              {CONTEXT_MENU_TOOLS.map((definition) => (
                <ToolGridButton
                  key={definition.tool}
                  definition={definition}
                  selected={definition.tool === activeTool}
                  onClick={() => onToolChange(definition.tool)}
                  onDoubleClick={() => {
                    onToolChange(definition.tool);
                    onClose();
                  }}
                />
              ))}
            </Box>
          </Box>

          <Box
            className="sketch-context-menu__canvas-actions"
            sx={{
              borderRadius: "8px",
              border: "1px solid",
              borderColor: theme.vars.palette.grey[700],
              backgroundColor: theme.vars.palette.grey[800],
              px: 1.15,
              py: 1.1
            }}
          >
            <SectionLabel>Canvas</SectionLabel>
            <Stack direction="row" spacing={0.8}>
              <Tooltip title="Undo">
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
                      border: "1px solid",
                      borderColor: theme.vars.palette.grey[700],
                      borderRadius: "8px",
                      p: 0.65
                    }}
                  >
                    <UndoIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Redo">
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
                      border: "1px solid",
                      borderColor: theme.vars.palette.grey[700],
                      borderRadius: "8px",
                      p: 0.65
                    }}
                  >
                    <RedoIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Clear Layer">
                <IconButton
                  size="small"
                  onClick={() => {
                    onClearLayer();
                    onClose();
                  }}
                  aria-label="Clear layer"
                  sx={{
                    border: "1px solid",
                    borderColor: alpha(theme.palette.error.main, 0.45),
                    color: "error.main",
                    borderRadius: "8px",
                    p: 0.65
                  }}
                >
                  <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Export PNG">
                <IconButton
                  size="small"
                  onClick={() => {
                    onExportPng();
                    onClose();
                  }}
                  aria-label="Export PNG"
                  sx={{
                    border: "1px solid",
                    borderColor: alpha(theme.palette.primary.main, 0.45),
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
        </Box>
      </Box>
    </Popover>
  );
};

export default memo(SketchCanvasContextMenu);
