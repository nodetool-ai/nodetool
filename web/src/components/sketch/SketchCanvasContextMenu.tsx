/** @jsxImportSource @emotion/react */
import React, { memo, useEffect } from "react";
import { sketchToolSettingsContainerSx, SKETCH_FONT } from "./sketchStyles";
import { alpha, useTheme } from "@mui/material/styles";
import {
  ButtonBase,
  Divider,
  IconButton,
  Popover,
  Stack,
  Typography
} from "@mui/material";
import { FlexColumn, FlexRow, Box } from "../ui_primitives";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import DeselectIcon from "@mui/icons-material/Deselect";
import RestoreIcon from "@mui/icons-material/Restore";
import FormatColorFillIcon from "@mui/icons-material/FormatColorFill";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import HighlightAltIcon from "@mui/icons-material/HighlightAlt";
import CropIcon from "@mui/icons-material/Crop";
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
import type { SamModelInfo } from "./sam";
import {
  CONTEXT_MENU_TOOL_GROUPS,
  getToolShortcutActionId,
  getToolDefinition,
  type ToolDefinition
} from "./toolDefinitions";
import { displayCombo } from "./shortcuts";
import SketchToolIconLabel from "./SketchToolIconLabel";
import { ToolSettingsPanel } from "./ToolSettingsPanels";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        mb: 1,
        fontSize: SKETCH_FONT.section,
        fontWeight: 600,
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
      <Typography sx={{ fontSize: SKETCH_FONT.xs, fontWeight: 600, color: "text.secondary" }}>
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
      <FlexRow sx={{ flex: "0 0 auto", color: "text.secondary" }}>
        {icon}
      </FlexRow>
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
        alignItems: "stretch",
        justifyContent: "flex-start",
        display: "flex",
        flexDirection: "column",
        textAlign: "center",
        transition: "all 120ms ease",
        width: "100%",
        "&:hover": {
          backgroundColor: selected
            ? alpha(theme.palette.primary.main, 0.22)
            : hoverBg,
          borderColor: selected ? "primary.main" : "text.secondary"
        },
        ...(!selected && {
          "&:hover .sketch-tool-icon-label__shortcut, &:focus-visible .sketch-tool-icon-label__shortcut":
            {
              opacity: 1
            }
        })
      }}
    >
      <SketchToolIconLabel
        direction="column"
        compact={compact}
        selected={selected}
        shortcut={shortcut || undefined}
        label={definition.label}
        icon={
          <Icon
            sx={{
              fontSize: compact ? 16 : 20,
              flexShrink: 0,
              color: selected ? "primary.light" : "text.primary"
            }}
          />
        }
      />
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
  onConvertSelectionToBorder: () => void;
  onDeselectSelection: () => void;
  onReselectSelection: () => void;
  onFillSelectionWithForeground: () => void;
  /**
   * Paint a colored ring of pixels OUTSIDE the selection with the
   * foreground color. Width comes from `selectSettings.borderWidth`.
   * Pairs with Fill for a filled shape with an outer outline.
   */
  onStrokeSelectionWithForeground: () => void;
  onLayerViaCopy: () => void;
  onLayerViaCut: () => void;
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
  onConvertSelectionToBorder,
  onDeselectSelection,
  onReselectSelection,
  onFillSelectionWithForeground,
  onStrokeSelectionWithForeground,
  onLayerViaCopy,
  onLayerViaCut,
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
  onSwapColors
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
      <FlexColumn
        className="sketch-context-menu__root"
        gap={1.25}
      >
        <FlexRow
          className="sketch-context-menu__header"
          align="center"
          gap={1}
          sx={{
            flex: "0 0 auto",
            minHeight: CONTEXT_MENU_HEADER_HEIGHT_PX,
            boxSizing: "border-box",
            px: 1,
            py: 0.5,
            borderRadius: "8px",
            // border: "1px solid",
            // borderColor: alpha(theme.palette.primary.main, 0.28),
            // backgroundColor: alpha(theme.palette.primary.main, 0.1),
            overflow: "hidden",
            "& .sketch-context-menu__header-shortcut": {
              opacity: 0,
              transition: "opacity 120ms ease"
            },
            "&:hover .sketch-context-menu__header-shortcut, &:focus-within .sketch-context-menu__header-shortcut":
              {
                opacity: 1
              }
          }}
        >
        <SketchToolIconLabel
          className="sketch-context-menu__header-tool"
          direction="row"
          label={activeDefinition.label}
          icon={<ActiveIcon sx={{ fontSize: 22 }} />}
          sx={{ flex: "0 1 auto", minWidth: 0 }}
        />
          {activeShortcut ? (
            <Box
              className="sketch-context-menu__header-shortcut"
              sx={{
                flex: "0 0 auto",
                px: 0.5,
                py: 0.5,
                borderRadius: "6px",
                border: "1px solid",
                borderColor: theme.vars.palette.grey[600],
                fontSize: SKETCH_FONT.sm,
                fontWeight: 600,
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
              my: 1
            }}
          />
          <FlexRow
            className="sketch-context-menu__header-colors"
            align="center"
            sx={{ flex: "0 0 auto" }}
          >
            {renderColorContext()}
          </FlexRow>
        </FlexRow>

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
              px: 1,
              py: 1
            }}
          >
            <Box sx={{ minWidth: 0 }}>
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
                  onConvertSelectionToBorder={onConvertSelectionToBorder}
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

            {/* Selection actions: only when the select tool is active */}
            {activeTool === "select" && (
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
                  <Divider sx={{ my: 0.5, borderColor: surfaceSoft }} />
                  <SelectionMenuItem
                    icon={<FormatColorFillIcon sx={{ fontSize: 16 }} />}
                    label="Fill"
                    disabled={!hasActiveSelection}
                    onClick={() => { onFillSelectionWithForeground(); onClose(); }}
                  />
                  <SelectionMenuItem
                    icon={<HighlightAltIcon sx={{ fontSize: 16 }} />}
                    label="Stroke"
                    disabled={!hasActiveSelection}
                    onClick={() => { onStrokeSelectionWithForeground(); onClose(); }}
                  />
                </Stack>
              </Box>
            )}
          </Stack>

          <FlexColumn
            className="sketch-context-menu__tools-column"
            sx={{
              minWidth: 0,
              alignSelf: "stretch",
              borderRadius: "8px",
              px: 1,
              py: 1
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
                      gap: 0.5,
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
                    <Divider sx={{ borderColor: surfaceSoft, my: 0.5 }} />
                  ) : null}
                </React.Fragment>
              ))}
            </Stack>
          </FlexColumn>
        </Box>
      </FlexColumn>
      </Popover>
    </>
  );
};

export default memo(SketchCanvasContextMenu);
