/**
 * GradientEditor — edits colour stops `{ t, color }` over normalized time,
 * the shape of a particle emitter's `colorOverLifetime`.
 *
 * Every stop is a focusable slider below the gradient bar. Arrow keys move it
 * (Shift for larger steps), Home/End snap it to its neighbours, Insert adds a
 * stop after it in the colour the gradient already has there, and Delete
 * removes it. A pointer drag previews locally and commits once on release.
 */

import { forwardRef, useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import Box from "@mui/material/Box";
import { useTheme, type SxProps, type Theme } from "@mui/material/styles";

import { EditorButton } from "../editor_ui";
import { Caption } from "./Caption";
import { FlexColumn } from "./FlexColumn";
import { FlexRow } from "./FlexRow";
import { InspectorValueInput } from "./InspectorValueInput";
import { clampNumber, draggedCoordinate, evaluateGradientStops, insertKey, insertionTime, removeKey, roundKeyNumber, snapToStep, updateKey, type GradientStop } from "./keyframeEditing";
import { SPACING, getSpacingPx } from "./spacing";
import { BORDER_RADIUS, CONTROL, MOTION, reducedMotion } from "./tokens";

export type { GradientStop } from "./keyframeEditing";

export interface GradientEditorProps {
  /** Stops sorted by `t` in [0, 1], each a `#rrggbb` colour. */
  value: readonly GradientStop[];
  /** Receives the whole new stop list, still sorted. */
  onChange: (stops: GradientStop[]) => void;
  /** Accessible name of the editor, e.g. "Colour over lifetime". */
  label: string;
  /** Fewest stops the list may hold. Defaults to 1. */
  minStops?: number;
  /** Most stops the list may hold. Defaults to 8, the particle gradient bound. */
  maxStops?: number;
  disabled?: boolean;
  sx?: SxProps<Theme>;
}

/** Position moved by one arrow-key press. Shift moves ten times as far. */
export const GRADIENT_POSITION_STEP = 0.01;
const LARGE_STEP = 10;
const HANDLE_SIZE = getSpacingPx(SPACING.lg);

function gradientCss(stops: readonly GradientStop[]): string {
  const parts = stops.map((stop) => `${stop.color} ${roundKeyNumber(stop.t * 100)}%`);
  return `linear-gradient(to right, ${stops.length === 1 ? `${parts[0]}, ${parts[0]}` : parts.join(", ")})`;
}

export const GradientEditor = forwardRef<HTMLDivElement, GradientEditorProps>(function GradientEditor({
  value,
  onChange,
  label,
  minStops = 1,
  maxStops = 8,
  disabled = false,
  sx
}, ref) {
  const theme = useTheme();
  const hintId = useId();
  const [selected, setSelected] = useState(0);
  const [draft, setDraft] = useState<GradientStop[] | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const handleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pendingFocus = useRef<number | null>(null);
  const drag = useRef<{ index: number; pointerId: number } | null>(null);

  const [colorDraft, setColorDraft] = useState<string | null>(null);
  const colorRef = useRef<HTMLInputElement | null>(null);
  const dragged = draft ?? value;
  const selectedIndex = Math.min(selected, dragged.length - 1);
  // The native picker fires an input event on every tick; those only preview, and the change event or blur commits.
  const stops = colorDraft === null ? dragged : dragged.map((stop, index) => index === selectedIndex ? { ...stop, color: colorDraft } : stop);
  const selectedStop = stops[selectedIndex];

  useEffect(() => {
    if (pendingFocus.current !== null) {
      handleRefs.current[pendingFocus.current]?.focus();
      pendingFocus.current = null;
    }
  }, [value]);

  const commit = useCallback((next: GradientStop[], focusIndex?: number) => {
    if (focusIndex !== undefined) {
      setSelected(focusIndex);
      pendingFocus.current = focusIndex;
    }
    onChange(next);
  }, [onChange]);

  const updateStop = useCallback((index: number, patch: Partial<GradientStop>) => {
    const current = value[index];
    const next = updateKey(value, index, patch);
    if (next[index].t !== current.t || next[index].color !== current.color) {
      commit(next);
    }
  }, [commit, value]);

  const commitColor = useCallback(() => {
    const input = colorRef.current;
    setColorDraft(null);
    if (input) {
      updateStop(selectedIndex, { color: input.value.toLowerCase() });
    }
  }, [selectedIndex, updateStop]);

  useEffect(() => {
    const input = colorRef.current;
    input?.addEventListener("change", commitColor);
    return () => input?.removeEventListener("change", commitColor);
  }, [commitColor]);

  const addStopAt = useCallback((t: number) => {
    if (value.length >= maxStops) {
      return;
    }
    const inserted = insertKey(value, { t, color: evaluateGradientStops(value, t) });
    commit(inserted.keys, inserted.index);
  }, [commit, maxStops, value]);

  const removeStopAt = useCallback((index: number) => {
    if (value.length <= minStops) {
      return;
    }
    commit(removeKey(value, index, minStops), Math.max(0, index - 1));
  }, [commit, minStops, value]);

  const positionFromEvent = useCallback((event: { clientX: number }): number | null => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) {
      return null;
    }
    const t = clampNumber((event.clientX - rect.left) / rect.width, 0, 1);
    return snapToStep(t, GRADIENT_POSITION_STEP);
  }, []);

  const handleKeyDown = (index: number) => (event: KeyboardEvent<HTMLDivElement>): void => {
    if (disabled) {
      return;
    }
    const stop = value[index];
    const scale = event.shiftKey ? LARGE_STEP : 1;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        updateStop(index, { t: stop.t - GRADIENT_POSITION_STEP * scale });
        break;
      case "ArrowRight":
      case "ArrowUp":
        updateStop(index, { t: stop.t + GRADIENT_POSITION_STEP * scale });
        break;
      case "Home":
        updateStop(index, { t: 0 });
        break;
      case "End":
        updateStop(index, { t: 1 });
        break;
      case "Insert":
      case "+":
        addStopAt(insertionTime(value, index));
        break;
      case "Delete":
      case "Backspace":
        removeStopAt(index);
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
    const t = active && active.pointerId === event.pointerId ? positionFromEvent(event) : null;
    if (active && t !== null) {
      setDraft(updateKey(value, active.index, { t: draggedCoordinate(value[active.index].t, t, GRADIENT_POSITION_STEP) }));
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
    // A drag that ends where it started is not an edit: no undo entry, and an off-grid key keeps its value.
    if (apply && result && (result[active.index].t !== value[active.index].t)) {
      commit(result);
    }
  };

  const handleDoubleClick = (event: MouseEvent<HTMLDivElement>): void => {
    const t = disabled ? null : positionFromEvent(event);
    if (t !== null) {
      addStopAt(t);
    }
  };

  const palette = theme.vars.palette;

  return (
    <FlexColumn ref={ref} role="group" aria-label={label} gap={SPACING.xs} sx={{ width: "100%", minWidth: 0, opacity: disabled ? 0.5 : 1, ...sx }}>
      <Box sx={{ px: SPACING.sm }}>
        <Box
          ref={barRef}
          data-testid="gradient-editor-bar"
          onDoubleClick={handleDoubleClick}
          sx={{
            height: CONTROL.height.sm,
            background: gradientCss(stops),
            border: `1px solid ${palette.divider}`,
            borderRadius: BORDER_RADIUS.sm,
            cursor: disabled ? "default" : "copy"
          }}
        />
        <Box sx={{ position: "relative", height: HANDLE_SIZE, mt: SPACING.xs }}>
          {stops.map((stop, index) => {
            const active = index === selectedIndex;
            return (
              <Box
                key={index}
                ref={(element: HTMLDivElement | null) => { handleRefs.current[index] = element; }}
                role="slider"
                tabIndex={disabled ? -1 : 0}
                aria-label={`${label} stop ${index + 1}`}
                aria-describedby={hintId}
                aria-valuemin={0}
                aria-valuemax={1}
                aria-valuenow={stop.t}
                aria-valuetext={`Position ${roundKeyNumber(stop.t)}, colour ${stop.color}`}
                aria-disabled={disabled || undefined}
                onFocus={() => setSelected(index)}
                onKeyDown={handleKeyDown(index)}
                onPointerDown={handlePointerDown(index)}
                onPointerMove={handlePointerMove}
                onPointerUp={endDrag(true)}
                onPointerCancel={endDrag(false)}
                onLostPointerCapture={endDrag(false)}
                sx={{
                  position: "absolute",
                  top: 0,
                  left: `${roundKeyNumber(stop.t * 100)}%`,
                  width: HANDLE_SIZE,
                  height: HANDLE_SIZE,
                  transform: "translateX(-50%)",
                  borderRadius: BORDER_RADIUS.xs,
                  border: `2px solid ${active ? palette.primary.main : palette.text.secondary}`,
                  backgroundColor: stop.color,
                  cursor: disabled ? "default" : "grab",
                  touchAction: "none",
                  transition: MOTION.border,
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
        <Box
          ref={colorRef}
          component="input"
          type="color"
          aria-label={`Stop ${selectedIndex + 1} colour`}
          value={selectedStop.color}
          disabled={disabled}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setColorDraft(event.target.value.toLowerCase())}
          onBlur={commitColor}
          sx={{
            width: CONTROL.height.sm,
            height: CONTROL.height.sm,
            p: 0,
            flexShrink: 0,
            border: `1px solid ${palette.divider}`,
            borderRadius: BORDER_RADIUS.sm,
            background: "none",
            cursor: disabled ? "default" : "pointer",
            "&::-webkit-color-swatch": { border: "none", borderRadius: BORDER_RADIUS.xs },
            "&::-moz-color-swatch": { border: "none", borderRadius: BORDER_RADIUS.xs }
          }}
        />
        <InspectorValueInput
          ariaLabel={`Stop ${selectedIndex + 1} position`}
          value={String(roundKeyNumber(selectedStop.t))}
          disabled={disabled}
          onCommit={(raw) => {
            const next = Number(raw);
            if (raw.trim() !== "" && Number.isFinite(next)) {
              updateStop(selectedIndex, { t: next });
            }
          }}
        />
        <EditorButton density="compact" disabled={disabled || value.length >= maxStops} onClick={() => addStopAt(insertionTime(value, selectedIndex))}>Add stop</EditorButton>
        <EditorButton density="compact" disabled={disabled || value.length <= minStops} onClick={() => removeStopAt(selectedIndex)}>Remove stop</EditorButton>
      </FlexRow>
      <Caption id={hintId}>Arrow keys move a stop, Shift moves further. Insert adds a stop, Delete removes it. Double-click the bar to add a stop there.</Caption>
    </FlexColumn>
  );
});
