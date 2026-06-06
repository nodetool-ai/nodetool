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
import {
  MenuItem,
  Select,
  Switch,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import { CANVAS_PRESETS } from "./types";
import { SKETCH_COLORS, SKETCH_FONT, SKETCH_SPACING, SKETCH_TOOLTIP_DELAY_MS } from "./sketchStyles";
import { FlexColumn, FlexRow, StateIconButton } from "../ui_primitives";

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
    fontSize: SKETCH_FONT.md,
    height: "28px"
  },
  "& .MuiInputBase-input": {
    padding: `${SKETCH_SPACING.sm} ${SKETCH_SPACING.lg}`
  },
  "& .MuiInputLabel-root": { fontSize: SKETCH_FONT.sm }
} as const;

export interface SketchCanvasSizePanelProps {
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
        <Typography sx={{ fontSize: SKETCH_FONT.sm, color: SKETCH_COLORS.textMuted }}>
          Resize handles
        </Typography>
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
      </FlexRow>

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
          marginTop: 0.5,
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
            {preset.label} - {preset.width}×{preset.height}
          </MenuItem>
        ))}
      </Select>

      <FlexRow align="center" gap={0.5} sx={{ mt: 4 }}>
        <TextField
          size="small"
          label="W"
          type="number"
          value={customWidth}
          onChange={(e) => setCustomWidth(e.target.value)}
          inputProps={{ min: 1, max: 4096, step: 1 }}
          sx={dimensionFieldSx}
        />
        <Typography sx={{ fontSize: SKETCH_FONT.md, color: SKETCH_COLORS.textFaint }}>
          ×
        </Typography>
        <TextField
          size="small"
          label="H"
          type="number"
          value={customHeight}
          onChange={(e) => setCustomHeight(e.target.value)}
          inputProps={{ min: 1, max: 4096, step: 1 }}
          sx={dimensionFieldSx}
        />
        <StateIconButton
          icon={<CheckIcon sx={{ fontSize: 18 }} />}
          tooltip="Apply canvas size"
          ariaLabel="Apply canvas size"
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
