/**
 * CurveEditor — edits piecewise-linear keys `{ t, value }` over normalized
 * time, the shape of a particle emitter's `sizeOverLifetime`,
 * `speedOverLifetime` and `opacityOverLifetime`.
 *
 * Every key is a focusable slider. Arrow keys move it (Shift for larger
 * steps), Home/End snap its time to its neighbours, PageUp/PageDown snap its
 * value to the top or bottom of the plot, Insert adds a key after it and
 * Delete removes it. A pointer drag previews locally and commits once on
 * release, so a drag is one `onChange` (one undo entry for the caller).
 */

import { forwardRef, useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import Box from "@mui/material/Box";
import { useTheme, type SxProps, type Theme } from "@mui/material/styles";

import { EditorButton } from "../editor_ui";
import { Caption } from "./Caption";
import { FlexColumn } from "./FlexColumn";
import { FlexRow } from "./FlexRow";
import { InspectorValueInput } from "./InspectorValueInput";
import { clampNumber, evaluateCurveKeys, insertKey, insertionTime, removeKey, roundKeyNumber, updateKey, type CurveKey } from "./keyframeEditing";
import { SPACING, getSpacingPx } from "./spacing";
import { BORDER_RADIUS, CONTROL, MOTION, reducedMotion } from "./tokens";

export type { CurveKey } from "./keyframeEditing";

export interface CurveEditorProps {
  /** Keys sorted by `t` in [0, 1]. */
  value: readonly CurveKey[];
  /** Receives the whole new key list, still sorted. */
  onChange: (keys: CurveKey[]) => void;
  /** Accessible name of the editor, e.g. "Size over lifetime". */
  label: string;
  /** Lowest allowed value. Defaults to 0. */
  min?: number;
  /** Highest allowed value. Defaults to 100, the particle curve bound. */
  max?: number;
  /** Fewest keys the list may hold. Defaults to 1. */
  minKeys?: number;
  /** Most keys the list may hold. Defaults to 16, the particle curve bound. */
  maxKeys?: number;
  disabled?: boolean;
  sx?: SxProps<Theme>;
}

/** Time moved by one arrow-key press. Shift moves ten times as far. */
export const CURVE_TIME_STEP = 0.01;
const LARGE_STEP = 10;
const PLOT_HEIGHT = CONTROL.height.xl * 3;
const HANDLE_SIZE = getSpacingPx(SPACING.lg);

/**
 * Top of the plot: the largest key value rounded up to 1, 2 or 5 times a power
 * of ten, at least 1 and at most `max`. It follows the committed keys only, so
 * a drag in progress does not rescale the plot under the pointer.
 */
function plotTop(keys: readonly CurveKey[], min: number, max: number): number {
  const highest = Math.max(1, min + 1, ...keys.map((key) => key.value));
  const magnitude = 10 ** Math.floor(Math.log10(highest));
  const nice = [1, 2, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= highest) ?? highest;
  return Math.min(max, nice);
}

function formatNumber(value: number): string {
  return String(roundKeyNumber(value));
}

export const CurveEditor = forwardRef<HTMLDivElement, CurveEditorProps>(function CurveEditor({
  value,
  onChange,
  label,
  min = 0,
  max = 100,
  minKeys = 1,
  maxKeys = 16,
  disabled = false,
  sx
}, ref) {
  const theme = useTheme();
  const hintId = useId();
  const [selected, setSelected] = useState(0);
  const [draft, setDraft] = useState<CurveKey[] | null>(null);
  const plotRef = useRef<HTMLDivElement | null>(null);
  const handleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pendingFocus = useRef<number | null>(null);
  const drag = useRef<{ index: number; pointerId: number } | null>(null);

  const keys = draft ?? value;
  const top = useMemo(() => plotTop(value, min, max), [value, min, max]);
  const valueStep = roundKeyNumber((top - min) / 100);
  const selectedIndex = Math.min(selected, keys.length - 1);
  const selectedKey = keys[selectedIndex];

  useEffect(() => {
    if (pendingFocus.current !== null) {
      handleRefs.current[pendingFocus.current]?.focus();
      pendingFocus.current = null;
    }
  }, [value]);

  const commit = useCallback((next: CurveKey[], focusIndex?: number) => {
    if (focusIndex !== undefined) {
      setSelected(focusIndex);
      pendingFocus.current = focusIndex;
    }
    onChange(next);
  }, [onChange]);

  const moveKey = useCallback((index: number, patch: Partial<CurveKey>) => {
    const current = value[index];
    const next = updateKey(value, index, patch.value === undefined ? patch : { ...patch, value: roundKeyNumber(clampNumber(patch.value, min, max)) });
    if (next[index].t !== current.t || next[index].value !== current.value) {
      commit(next);
    }
  }, [commit, max, min, value]);

  const addKeyAfter = useCallback((index: number) => {
    if (value.length >= maxKeys) {
      return;
    }
    const t = insertionTime(value, index);
    const inserted = insertKey(value, { t, value: roundKeyNumber(evaluateCurveKeys(value, t)) });
    commit(inserted.keys, inserted.index);
  }, [commit, maxKeys, value]);

  const removeKeyAt = useCallback((index: number) => {
    if (value.length <= minKeys) {
      return;
    }
    commit(removeKey(value, index, minKeys), Math.max(0, index - 1));
  }, [commit, minKeys, value]);

  const pointFromEvent = useCallback((event: { clientX: number; clientY: number }): CurveKey | null => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    const t = clampNumber((event.clientX - rect.left) / rect.width, 0, 1);
    const level = clampNumber(1 - (event.clientY - rect.top) / rect.height, 0, 1);
    return {
      t: roundKeyNumber(Math.round(t / CURVE_TIME_STEP) * CURVE_TIME_STEP),
      value: roundKeyNumber(Math.round((min + level * (top - min)) / valueStep) * valueStep)
    };
  }, [min, top, valueStep]);

  const handleKeyDown = (index: number) => (event: KeyboardEvent<HTMLDivElement>): void => {
    if (disabled) {
      return;
    }
    const key = value[index];
    const scale = event.shiftKey ? LARGE_STEP : 1;
    switch (event.key) {
      case "ArrowLeft":
        moveKey(index, { t: key.t - CURVE_TIME_STEP * scale });
        break;
      case "ArrowRight":
        moveKey(index, { t: key.t + CURVE_TIME_STEP * scale });
        break;
      case "ArrowUp":
        moveKey(index, { value: key.value + valueStep * scale });
        break;
      case "ArrowDown":
        moveKey(index, { value: key.value - valueStep * scale });
        break;
      case "Home":
        moveKey(index, { t: 0 });
        break;
      case "End":
        moveKey(index, { t: 1 });
        break;
      case "PageUp":
        moveKey(index, { value: top });
        break;
      case "PageDown":
        moveKey(index, { value: min });
        break;
      case "Insert":
      case "+":
        addKeyAfter(index);
        break;
      case "Delete":
      case "Backspace":
        removeKeyAt(index);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const handlePointerDown = (index: number) => (event: PointerEvent<HTMLDivElement>): void => {
    if (disabled || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setSelected(index);
    drag.current = { index, pointerId: event.pointerId };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const active = drag.current;
    const point = active && active.pointerId === event.pointerId ? pointFromEvent(event) : null;
    if (active && point) {
      setDraft(updateKey(value, active.index, point));
    }
  };

  const endDrag = (apply: boolean) => (event: PointerEvent<HTMLDivElement>): void => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) {
      return;
    }
    drag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const result = draft;
    setDraft(null);
    if (apply && result) {
      commit(result);
    }
  };

  const handleDoubleClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (disabled || event.target !== event.currentTarget || value.length >= maxKeys) {
      return;
    }
    const point = pointFromEvent(event);
    if (point) {
      const inserted = insertKey(value, point);
      commit(inserted.keys, inserted.index);
    }
  };

  const toX = (t: number): number => t * 100;
  const toY = (level: number): number => 100 - clampNumber((level - min) / (top - min), 0, 1) * 100;
  const points = [
    `0,${toY(keys[0].value)}`,
    ...keys.map((key) => `${toX(key.t)},${toY(key.value)}`),
    `100,${toY(keys[keys.length - 1].value)}`
  ].join(" ");
  const palette = theme.vars.palette;

  return (
    <FlexColumn ref={ref} role="group" aria-label={label} gap={SPACING.xs} sx={{ width: "100%", minWidth: 0, opacity: disabled ? 0.5 : 1, ...sx }}>
      <Box sx={{ p: SPACING.sm }}>
        <Box
          ref={plotRef}
          data-testid="curve-editor-plot"
          onDoubleClick={handleDoubleClick}
          sx={{
            position: "relative",
            height: PLOT_HEIGHT,
            backgroundColor: palette.background.default,
            border: `1px solid ${palette.divider}`,
            borderRadius: BORDER_RADIUS.sm,
            cursor: disabled ? "default" : "crosshair"
          }}
        >
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <line x1="0" y1="50" x2="100" y2="50" stroke={palette.divider} vectorEffect="non-scaling-stroke" />
            <line x1="50" y1="0" x2="50" y2="100" stroke={palette.divider} vectorEffect="non-scaling-stroke" />
            <polyline points={points} fill="none" stroke={palette.primary.main} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </svg>
          {keys.map((key, index) => {
            const active = index === selectedIndex;
            return (
              <Box
                key={index}
                ref={(element: HTMLDivElement | null) => { handleRefs.current[index] = element; }}
                role="slider"
                tabIndex={disabled ? -1 : 0}
                aria-label={`${label} key ${index + 1}`}
                aria-describedby={hintId}
                aria-valuemin={0}
                aria-valuemax={1}
                aria-valuenow={key.t}
                aria-valuetext={`Time ${formatNumber(key.t)}, value ${formatNumber(key.value)}`}
                aria-disabled={disabled || undefined}
                onFocus={() => setSelected(index)}
                onKeyDown={handleKeyDown(index)}
                onPointerDown={handlePointerDown(index)}
                onPointerMove={handlePointerMove}
                onPointerUp={endDrag(true)}
                onPointerCancel={endDrag(false)}
                sx={{
                  position: "absolute",
                  left: `${toX(key.t)}%`,
                  top: `${toY(key.value)}%`,
                  width: HANDLE_SIZE,
                  height: HANDLE_SIZE,
                  transform: "translate(-50%, -50%)",
                  borderRadius: BORDER_RADIUS.circle,
                  border: `2px solid ${palette.primary.main}`,
                  backgroundColor: active ? palette.primary.main : palette.background.paper,
                  cursor: disabled ? "default" : "grab",
                  touchAction: "none",
                  transition: MOTION.background,
                  ...reducedMotion({ transition: MOTION.none }),
                  "&:focus-visible": {
                    outline: `2px solid ${palette.primary.light}`,
                    outlineOffset: "2px"
                  }
                }}
              />
            );
          })}
        </Box>
      </Box>
      <FlexRow gap={SPACING.xs} align="center" wrap>
        <InspectorValueInput
          ariaLabel={`Key ${selectedIndex + 1} time`}
          value={formatNumber(selectedKey.t)}
          disabled={disabled}
          onCommit={(raw) => {
            const next = Number(raw);
            if (raw.trim() !== "" && Number.isFinite(next)) {
              moveKey(selectedIndex, { t: next });
            }
          }}
        />
        <InspectorValueInput
          ariaLabel={`Key ${selectedIndex + 1} value`}
          value={formatNumber(selectedKey.value)}
          disabled={disabled}
          onCommit={(raw) => {
            const next = Number(raw);
            if (raw.trim() !== "" && Number.isFinite(next)) {
              moveKey(selectedIndex, { value: next });
            }
          }}
        />
        <EditorButton density="compact" disabled={disabled || value.length >= maxKeys} onClick={() => addKeyAfter(selectedIndex)}>Add key</EditorButton>
        <EditorButton density="compact" disabled={disabled || value.length <= minKeys} onClick={() => removeKeyAt(selectedIndex)}>Remove key</EditorButton>
      </FlexRow>
      <Caption id={hintId}>Arrow keys move a key, Shift moves further. Insert adds a key, Delete removes it. Double-click the plot to add a key there.</Caption>
    </FlexColumn>
  );
});
