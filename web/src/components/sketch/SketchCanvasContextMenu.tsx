/** @jsxImportSource @emotion/react */
import React, { memo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { sketchToolSettingsContainerSx } from "./sketchStyles";
import { useTheme } from "@mui/material/styles";
import {
  FlexColumn,
  FlexRow,
  Box,
  Text,
  Divider,
  ToolbarIconButton,
  MOTION,
  BORDER_RADIUS,
  ButtonBase,
  Popover,
  FONT_SIZE_SANS,
  ICON_SIZE,
  EYEBROW
} from "../ui_primitives";
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
    <Text
      sx={{
        mb: 1,
        ...EYEBROW,
        color: "text.secondary"
      }}
    >
      {children}
    </Text>
  );
}

function ColorPreview({ label, color }: { label: string; color: string }) {
  return (
    <FlexColumn align="center" gap={0.4}>
      <Box
        sx={{
          width: 22,
          height: 22,
          borderRadius: BORDER_RADIUS.lg,
          border: "1px solid",
          borderColor: "var(--gray-700)",
          background: color
        }}
      />
      <Text sx={{ fontSize: FONT_SIZE_SANS.caption, fontWeight: 600, color: "text.secondary" }}>
        {label}
      </Text>
    </FlexColumn>
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
        borderRadius: BORDER_RADIUS.lg,
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
      <Text sx={{ flex: 1, fontSize: FONT_SIZE_SANS.label, fontWeight: 500, color: "text.primary" }}>
        {label}
      </Text>
      {shortcut && (
        <Text sx={{ fontSize: FONT_SIZE_SANS.caption, fontWeight: 600, color: "text.secondary", whiteSpace: "nowrap" }}>
          {shortcut}
        </Text>
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

const ToolGridButton = memo(function ToolGridButton({
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
        borderRadius: BORDER_RADIUS.lg,
        border: "1px solid",
        borderColor: selected ? "primary.main" : "transparent",
        backgroundColor: selected
          ? `rgb(${theme.vars.palette.primary.mainChannel} / 0.16)`
          : inactiveBg,
        px: compact ? 0.35 : 0.75,
        py: compact ? 0.45 : 0.8,
        alignItems: "stretch",
        justifyContent: "flex-start",
        display: "flex",
        flexDirection: "column",
        textAlign: "center",
        transition: MOTION.all,
        width: "100%",
        "&:hover": {
          backgroundColor: selected
            ? `rgb(${theme.vars.palette.primary.mainChannel} / 0.22)`
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
});

interface SketchCanvasContextMenuProps {
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

const TOOL_LABEL_KEYS: Record<SketchTool, string> = {
  move: "i18n-next4.sketch.tool.move",
  transform: "i18n-next4.sketch.tool.transform",
  select: "i18n-next4.sketch.tool.select",
  brush: "i18n-next4.sketch.tool.brush",
  pencil: "i18n-next4.sketch.tool.pencil",
  eraser: "i18n-next4.sketch.tool.eraser",
  fill: "i18n-next4.sketch.tool.fill",
  eyedropper: "i18n-next4.sketch.tool.colorPicker",
  blur: "i18n-next4.sketch.tool.blur",
  clone_stamp: "i18n-next4.sketch.tool.cloneStamp",
  shape: "i18n-next4.sketch.tool.shape",
  gradient: "i18n-next4.sketch.tool.gradient",
  crop: "i18n-next4.sketch.tool.crop",
  adjust: "i18n-next4.sketch.tool.adjust",
  segment: "i18n-next4.sketch.tool.segment"
};

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
  const { t } = useTranslation();
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
  const getToolLabel = (definition: ToolDefinition): string =>
    t(TOOL_LABEL_KEYS[definition.tool]);
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

    // Not on the dispatcher: capture phase + stopPropagation is load-bearing —
    // this menu must swallow Escape before the editor beneath it (which still
    // listens in capture phase) sees it.
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [open, onClose]);

  const renderColorContext = () => {
    if (isShapeTool(activeTool)) {
      return (
        <FlexRow gap={1}>
          <ColorPreview label={t("i18n-next4.sketch.color.stroke")} color={shapeSettings.strokeColor} />
          <ColorPreview label={t("i18n-next4.sketch.color.fill")} color={shapeSettings.fillColor} />
        </FlexRow>
      );
    }

    if (activeTool === "gradient") {
      return (
        <FlexRow gap={1}>
          <ColorPreview label={t("i18n-next4.sketch.color.start")} color={gradientSettings.startColor} />
          <ColorPreview label={t("i18n-next4.sketch.color.end")} color={gradientSettings.endColor} />
        </FlexRow>
      );
    }

    return (
      <FlexRow gap={1} align="center">
        <ColorPreview label={t("i18n-next4.sketch.color.foregroundShort")} color={foregroundColor} />
        <ColorPreview label={t("i18n-next4.sketch.color.backgroundShort")} color={backgroundColor} />
        <ToolbarIconButton
          icon={<SwapHorizIcon sx={{ fontSize: ICON_SIZE.md }} />}
          onClick={onSwapColors}
          aria-label={t("i18n-next4.sketch.color.swapForegroundBackground")}
          sx={{
            mt: 0,
            border: "1px solid",
            borderColor: theme.vars.palette.grey[700],
            backgroundColor: surfaceSoft,
            p: 0.5,
            "&:hover": {
              backgroundColor: `rgb(${theme.vars.palette.primary.mainChannel} / 0.14)`
            }
          }}
        />
      </FlexRow>
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
            p: 1.5
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
            borderRadius: BORDER_RADIUS.lg,
            overflow: "hidden",
            "& .sketch-context-menu__header-shortcut": {
              opacity: 0,
              transition: MOTION.opacity
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
          label={getToolLabel(activeDefinition)}
          icon={<ActiveIcon sx={{ fontSize: ICON_SIZE.lg }} />}
          sx={{ flex: "0 1 auto", minWidth: 0 }}
        />
          {activeShortcut ? (
            <Box
              className="sketch-context-menu__header-shortcut"
              sx={{
                flex: "0 0 auto",
                px: 0.5,
                py: 0.5,
                borderRadius: BORDER_RADIUS.lg,
                border: "1px solid",
                borderColor: theme.vars.palette.grey[600],
                fontSize: FONT_SIZE_SANS.label,
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
              borderColor: `rgb(${theme.vars.palette.primary.mainChannel} / 0.22)`,
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
          <FlexColumn
            className="sketch-context-menu__quick"
            gap={1.1}
            sx={{
              minWidth: 0,
              minHeight: 360,
              height: "100%",
              borderRadius: BORDER_RADIUS.lg,
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

            {activeTool === "select" && (
              <Box
                className="sketch-context-menu__selection-actions"
                sx={{
                  borderRadius: BORDER_RADIUS.lg,
                  px: 0
                }}
              >
                <SectionLabel>{t("i18n-next4.sketch.selection")}</SectionLabel>
                <FlexColumn gap={0.3}>
                  <SelectionMenuItem
                    icon={<DeselectIcon sx={{ fontSize: ICON_SIZE.sm }} />}
                    label={t("i18n-next4.sketch.deselect")}
                    shortcut={displayCombo("deselect")}
                    disabled={!hasActiveSelection}
                    onClick={() => { onDeselectSelection(); onClose(); }}
                  />
                  <SelectionMenuItem
                    icon={<RestoreIcon sx={{ fontSize: ICON_SIZE.sm }} />}
                    label={t("i18n-next4.sketch.reselect")}
                    shortcut={displayCombo("reselect")}
                    onClick={() => { onReselectSelection(); onClose(); }}
                  />
                  <SelectionMenuItem
                    icon={<CropIcon sx={{ fontSize: ICON_SIZE.sm }} />}
                    label={t("i18n-next4.sketch.cropToSelection")}
                    disabled={!hasActiveSelection}
                    onClick={() => { onCropCanvasToSelection(); onClose(); }}
                  />
                  <Divider sx={{ my: 0.5, borderColor: surfaceSoft }} />
                  <SelectionMenuItem
                    icon={<ContentCopyIcon sx={{ fontSize: ICON_SIZE.sm }} />}
                    label={t("i18n-next4.sketch.layerViaCopy")}
                    shortcut={displayCombo("layer-via-copy")}
                    disabled={!hasActiveSelection}
                    onClick={() => { onLayerViaCopy(); onClose(); }}
                  />
                  <SelectionMenuItem
                    icon={<ContentCutIcon sx={{ fontSize: ICON_SIZE.sm }} />}
                    label={t("i18n-next4.sketch.layerViaCut")}
                    shortcut={displayCombo("layer-via-cut")}
                    disabled={!hasActiveSelection}
                    onClick={() => { onLayerViaCut(); onClose(); }}
                  />
                  <Divider sx={{ my: 0.5, borderColor: surfaceSoft }} />
                  <SelectionMenuItem
                    icon={<FormatColorFillIcon sx={{ fontSize: ICON_SIZE.sm }} />}
                    label={t("i18n-next4.sketch.color.fill")}
                    disabled={!hasActiveSelection}
                    onClick={() => { onFillSelectionWithForeground(); onClose(); }}
                  />
                  <SelectionMenuItem
                    icon={<HighlightAltIcon sx={{ fontSize: ICON_SIZE.sm }} />}
                    label={t("i18n-next4.sketch.color.stroke")}
                    disabled={!hasActiveSelection}
                    onClick={() => { onStrokeSelectionWithForeground(); onClose(); }}
                  />
                </FlexColumn>
              </Box>
            )}
          </FlexColumn>

          <FlexColumn
            className="sketch-context-menu__tools-column"
            sx={{
              minWidth: 0,
              alignSelf: "stretch",
              borderRadius: BORDER_RADIUS.lg,
              px: 1,
              py: 1
            }}
          >
            <SectionLabel>{t("i18n-next4.sketch.tools")}</SectionLabel>
            <FlexColumn
              gap={0.75}
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
                        definition={{ ...definition, label: getToolLabel(definition) }}
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
            </FlexColumn>
          </FlexColumn>
        </Box>
      </FlexColumn>
      </Popover>
    </>
  );
};

export default memo(SketchCanvasContextMenu);
