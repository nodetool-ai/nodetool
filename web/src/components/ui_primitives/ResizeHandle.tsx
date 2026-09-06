/**
 * ResizeHandle — the drag/keyboard grip shared by every split and dock.
 *
 * Renders a `role="separator"` strip with pointer capture, arrow-key resizing
 * and a focus ring. The handle owns the gesture, never the size: it reports
 * incremental deltas through `onResize` and the caller keeps the value.
 */

import { useCallback, useRef, useState } from "react";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";

import { MOTION } from "./tokens";
import { SPACING, getSpacingPx } from "./spacing";

/** Pixels one arrow-key press moves the separator. */
const DEFAULT_KEYBOARD_STEP = 16;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export interface ResizeHandleProps {
  /**
   * Axis of the separator itself, matching `aria-orientation`. A `vertical`
   * handle is a vertical bar between side-by-side panes and drags left/right;
   * a `horizontal` handle sits between stacked panes and drags up/down.
   */
  orientation: "vertical" | "horizontal";
  /** Current size, in the same units the caller stores. Reported as `aria-valuenow`. */
  value: number;
  min: number;
  max: number;
  /**
   * Called with the change to apply to `value`, already clamped to
   * `[min, max]` and already direction-corrected by `invert`.
   */
  onResize: (delta: number) => void;
  onResizeStart?: () => void;
  onResizeEnd?: () => void;
  /**
   * When true, moving toward the handle's start (left / up) *increases* the
   * value — the case for a pane whose handle sits on its leading edge. Also
   * flips the arrow keys and, unless `invertExtremes` says otherwise, Home/End.
   */
  invert?: boolean;
  /** Overrides `invert` for Home/End only. Home jumps to max when true. */
  invertExtremes?: boolean;
  /** Pixels one arrow-key press moves the separator. Defaults to 16. */
  keyboardStep?: number;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  sx?: SxProps<Theme>;
}

export const ResizeHandle = ({
  orientation,
  value,
  min,
  max,
  onResize,
  onResizeStart,
  onResizeEnd,
  invert = false,
  invertExtremes,
  keyboardStep = DEFAULT_KEYBOARD_STEP,
  ariaLabel,
  disabled = false,
  className,
  sx
}: ResizeHandleProps) => {
  const [isDragging, setIsDragging] = useState(false);
  // Pointer position and value at drag start, plus the value already reported,
  // so a pointer dragged past a bound does not build up slack to undo.
  const drag = useRef({ pointer: 0, start: 0, applied: 0 });

  const emit = useCallback(
    (next: number) => {
      const clamped = clamp(next, min, max);
      if (clamped !== value) {
        onResize(clamped - value);
      }
      return clamped;
    },
    [min, max, onResize, value]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || event.button !== 0) {
        return;
      }
      event.preventDefault();
      drag.current = {
        pointer: orientation === "vertical" ? event.clientX : event.clientY,
        start: value,
        applied: value
      };
      setIsDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      onResizeStart?.();
    },
    [disabled, orientation, value, onResizeStart]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) {
        return;
      }
      const current =
        orientation === "vertical" ? event.clientX : event.clientY;
      const moved = current - drag.current.pointer;
      const target = clamp(
        drag.current.start + (invert ? -moved : moved),
        min,
        max
      );
      if (target !== drag.current.applied) {
        onResize(target - drag.current.applied);
        drag.current.applied = target;
      }
    },
    [isDragging, orientation, invert, min, max, onResize]
  );

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) {
        return;
      }
      setIsDragging(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      onResizeEnd?.();
    },
    [isDragging, onResizeEnd]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) {
        return;
      }
      const decrease = orientation === "vertical" ? "ArrowLeft" : "ArrowUp";
      const increase = orientation === "vertical" ? "ArrowRight" : "ArrowDown";
      const step = invert ? -keyboardStep : keyboardStep;
      const extremesFlipped = invertExtremes ?? invert;

      if (event.key === decrease) {
        emit(value - step);
      } else if (event.key === increase) {
        emit(value + step);
      } else if (event.key === "Home") {
        emit(extremesFlipped ? max : min);
      } else if (event.key === "End") {
        emit(extremesFlipped ? min : max);
      } else {
        return;
      }
      event.preventDefault();
    },
    [
      disabled,
      orientation,
      invert,
      invertExtremes,
      keyboardStep,
      emit,
      value,
      min,
      max
    ]
  );

  return (
    <Box
      className={className}
      role="separator"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-orientation={orientation}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-disabled={disabled || undefined}
      data-dragging={isDragging ? "true" : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      sx={[
        (theme) => ({
          flex: `0 0 ${getSpacingPx(SPACING.sm)}`,
          alignSelf: "stretch",
          border: "none",
          padding: 0,
          background: "transparent",
          cursor: disabled
            ? "default"
            : orientation === "vertical"
              ? "col-resize"
              : "row-resize",
          transition: MOTION.background,
          touchAction: "none",
          "&:hover, &[data-dragging='true']": {
            backgroundColor: disabled
              ? "transparent"
              : theme.vars.palette.primary.main
          },
          "&:focus-visible": {
            outline: `2px solid ${theme.vars.palette.primary.main}`,
            outlineOffset: "-2px"
          }
        }),
        ...(Array.isArray(sx) ? sx : [sx])
      ]}
    />
  );
};

export default ResizeHandle;
