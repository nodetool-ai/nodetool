/**
 * SketchCanvasSizePanel — canvas preset picker, custom W×H, apply control,
 * and edge resize-handle toggle (formerly embedded in SketchLayersPanel).
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import { useTranslation } from "react-i18next";

import CheckIcon from "@mui/icons-material/Check";
import AspectRatioIcon from "@mui/icons-material/CropOriginal";
import ResolutionIcon from "@mui/icons-material/Tv";
import { CANVAS_PRESETS } from "./types";
import { sketchFieldSx, SKETCH_COLORS } from "./sketchStyles";
import {
  FlexColumn,
  FlexRow,
  StateIconButton,
  Text,
  Tooltip,
  SelectField,
  Box,
  Switch,
  NumberField,
  FONT_SIZE_SANS,
  SPACING,
  getSpacingPx,
  ICON_SIZE
} from "../ui_primitives";
import MediaControlChip from "../chat/composer/MediaControlChip";
import MediaOptionMenu, {
  type MediaOption
} from "../chat/composer/MediaOptionMenu";
import MediaAspectRatioMenu from "../chat/composer/MediaAspectRatioMenu";
import {
  deriveImageSizePreset,
  IMAGE_ASPECT_RATIOS,
  IMAGE_RESOLUTIONS,
  resolveImageSize,
  type ImageResolution
} from "../../stores/MediaGenerationStore";

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

const dimensionFieldSx = {
  flex: 1,
  minWidth: 0,
  "& .MuiInputBase-root": {
    ...sketchFieldSx,
    fontSize: FONT_SIZE_SANS.label,
    height: "28px"
  },
  "& .MuiInputBase-input": {
    padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)}`
  },
  "& .MuiInputLabel-root": { fontSize: FONT_SIZE_SANS.label }
} as const;

interface SketchCanvasSizePanelProps {
  canvasWidth: number;
  canvasHeight: number;
  onCanvasResize: (width: number, height: number) => void;
  canvasResizeHandlesEnabled: boolean;
  onCanvasResizeHandlesEnabledChange: (enabled: boolean) => void;
}

const SketchCanvasSizePanel: React.FC<SketchCanvasSizePanelProps> = ({
  canvasWidth,
  canvasHeight,
  onCanvasResize,
  canvasResizeHandlesEnabled,
  onCanvasResizeHandlesEnabledChange
}) => {
  const { t } = useTranslation();
  const [customWidth, setCustomWidth] = useState(String(canvasWidth));
  const [customHeight, setCustomHeight] = useState(String(canvasHeight));

  useEffect(() => {
    setCustomWidth(String(canvasWidth));
    setCustomHeight(String(canvasHeight));
  }, [canvasWidth, canvasHeight]);

  const canvasCustomSizeApply = useMemo(() => {
    const w = parseInt(customWidth, 10);
    const h = parseInt(customHeight, 10);
    const valid =
      Number.isFinite(w) &&
      Number.isFinite(h) &&
      w > 0 &&
      h > 0 &&
      w <= 4096 &&
      h <= 4096;
    const dirty = valid && (w !== canvasWidth || h !== canvasHeight);
    return { valid, dirty, w, h };
  }, [customWidth, customHeight, canvasWidth, canvasHeight]);

  const handleApplyCustomSize = useCallback(() => {
    const { valid, dirty, w, h } = canvasCustomSizeApply;
    if (!valid || !dirty) {
      return;
    }
    onCanvasResize(w, h);
  }, [canvasCustomSizeApply, onCanvasResize]);

  // Aspect ratio + resolution → canvas size. Derived from the current canvas so
  // the controls reflect the artboard; picking either resizes it. Presented with
  // the same chip + menu the generation header uses, for a consistent look.
  const { aspectRatio: aspectId, resolution: resolutionId } =
    deriveImageSizePreset(canvasWidth, canvasHeight);
  const resolutionOptions = useMemo<MediaOption<ImageResolution>[]>(
    () => IMAGE_RESOLUTIONS.map((r) => ({ id: r, label: r })),
    []
  );

  const [aspectAnchor, setAspectAnchor] = useState<HTMLElement | null>(null);
  const [resolutionAnchor, setResolutionAnchor] = useState<HTMLElement | null>(
    null
  );

  const handleAspectResize = useCallback(
    (aspect: string) => {
      const { width, height } = resolveImageSize(resolutionId, aspect);
      onCanvasResize(width, height);
      setAspectAnchor(null);
    },
    [resolutionId, onCanvasResize]
  );

  const handleResolutionResize = useCallback(
    (resolution: ImageResolution) => {
      const { width, height } = resolveImageSize(resolution, aspectId);
      onCanvasResize(width, height);
      setResolutionAnchor(null);
    },
    [aspectId, onCanvasResize]
  );

  const cycleCanvasPreset = useCallback(
    (direction: -1 | 1) => {
      const currentIndex = CANVAS_PRESETS.findIndex(
        (preset) =>
          preset.width === canvasWidth && preset.height === canvasHeight
      );
      const next = cycleArrayValue(CANVAS_PRESETS, currentIndex, direction);
      if (next) {
        onCanvasResize(next.width, next.height);
      }
    },
    [canvasWidth, canvasHeight, onCanvasResize]
  );

  const handleCanvasPresetQuickCycleKeyDownCapture = useCallback(
    (e: React.KeyboardEvent) => {
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
    },
    [cycleCanvasPreset]
  );

  const handleCanvasPresetQuickCycleWheelCapture = useCallback(
    (e: React.WheelEvent) => {
      if (e.deltaY === 0) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      cycleCanvasPreset(e.deltaY > 0 ? 1 : -1);
    },
    [cycleCanvasPreset]
  );

  return (
    <FlexColumn className="sketch-canvas-size-panel" padding={1} gap={1}>
      <FlexRow align="center" justify="space-between" sx={{ minHeight: 32 }}>
        <Text sx={{ fontSize: FONT_SIZE_SANS.label, color: SKETCH_COLORS.textMuted }}>
          {t("i18n-next52.sketch.canvas.resizeHandles")}
        </Text>
        <Tooltip
          title={
            canvasResizeHandlesEnabled
              ? t("i18n-next52.sketch.canvas.hideResizeHandles")
              : t("i18n-next52.sketch.canvas.showResizeHandles")
          }
          placement="left"
        >
          <Switch
            size="small"
            checked={canvasResizeHandlesEnabled}
            onChange={(_, checked) => onCanvasResizeHandlesEnabledChange(checked)}
            inputProps={{
              "aria-label": t("i18n-next52.sketch.canvas.toggleResizeHandles")
            }}
          />
        </Tooltip>
      </FlexRow>

      <Box
        sx={{ width: "100%", mt: 0.5 }}
        onKeyDownCapture={handleCanvasPresetQuickCycleKeyDownCapture}
        onWheelCapture={handleCanvasPresetQuickCycleWheelCapture}
      >
        <SelectField
          label={t("i18n-next52.sketch.canvas.preset")}
          hideLabel
          size="small"
          value={
            CANVAS_PRESETS.find(
              (p) => p.width === canvasWidth && p.height === canvasHeight
            )?.label ?? ""
          }
          options={[
            { value: "", label: t("i18n-next52.sketch.canvas.presets"), disabled: true },
            ...CANVAS_PRESETS.map((preset) => ({
              value: preset.label,
              label: `${preset.label} - ${preset.width}×${preset.height}`
            }))
          ]}
          onChange={(value) => {
            const preset = CANVAS_PRESETS.find((p) => p.label === value);
            if (preset) {
              onCanvasResize(preset.width, preset.height);
            }
          }}
        />
      </Box>

      <FlexColumn gap={0.5} sx={{ mt: 2 }}>
        <Text sx={{ fontSize: FONT_SIZE_SANS.label, color: SKETCH_COLORS.textMuted }}>
          {t("i18n-next52.sketch.canvas.aspectResolution")}
        </Text>
        <FlexRow align="center" gap={0.5}>
          <MediaControlChip
            icon={<AspectRatioIcon fontSize="small" />}
            label={aspectId}
            active={!!aspectAnchor}
            onClick={(e) => setAspectAnchor(e.currentTarget)}
            showChevron={false}
          />
          <MediaControlChip
            icon={<ResolutionIcon fontSize="small" />}
            label={resolutionId}
            active={!!resolutionAnchor}
            onClick={(e) => setResolutionAnchor(e.currentTarget)}
            showChevron={false}
          />
        </FlexRow>
        <MediaAspectRatioMenu
          anchorEl={aspectAnchor}
          open={!!aspectAnchor}
          onClose={() => setAspectAnchor(null)}
          value={aspectId}
          options={IMAGE_ASPECT_RATIOS}
          onChange={handleAspectResize}
        />
        <MediaOptionMenu
          anchorEl={resolutionAnchor}
          open={!!resolutionAnchor}
          onClose={() => setResolutionAnchor(null)}
          header={t("i18n-next52.sketch.canvas.resolution")}
          value={resolutionId}
          options={resolutionOptions}
          onChange={handleResolutionResize}
        />
      </FlexColumn>

      <FlexRow align="center" gap={1} sx={{ mt: 2 }}>
        <NumberField
          size="small"
          label={t("i18n-next52.sketch.canvas.width")}
          value={customWidth}
          onChange={(e) => setCustomWidth(e.target.value)}
          min={1}
          max={4096}
          step={1}
          sx={dimensionFieldSx}
        />
        <Text sx={{ fontSize: FONT_SIZE_SANS.label, color: SKETCH_COLORS.textFaint }}>
          ×
        </Text>
        <NumberField
          size="small"
          label={t("i18n-next52.sketch.canvas.height")}
          value={customHeight}
          onChange={(e) => setCustomHeight(e.target.value)}
          min={1}
          max={4096}
          step={1}
          sx={dimensionFieldSx}
        />
        <StateIconButton
          icon={<CheckIcon sx={{ fontSize: ICON_SIZE.md }} />}
          tooltip={t("i18n-next52.sketch.canvas.apply")}
          ariaLabel={t("i18n-next52.sketch.canvas.apply")}
          onClick={handleApplyCustomSize}
          isActive={canvasCustomSizeApply.dirty}
          color="primary"
          disabled={!canvasCustomSizeApply.dirty}
          size="small"
          sx={{ flexShrink: 0 }}
        />
      </FlexRow>
    </FlexColumn>
  );
};

export default SketchCanvasSizePanel;
