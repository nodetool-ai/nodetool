/**
 * ResizeHandle — the drag/keyboard grip shared by every split and dock.
 *
 * Renders a `role="separator"` strip with pointer capture, arrow-key resizing
 * and a focus ring. The handle owns the gesture, never the size: it reports
 * incremental deltas through `onResize` and the caller keeps the value.
 *
 * Placement: by default the strip is an in-flow flex item between two panes.
 * Pass `edge` to pin it to the start or end edge of a positioned parent
 * instead (docked panels, floating windows).
 */

import { useCallback, useRef, useState } from "react";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";

import { BORDER_RADIUS, MOTION, Z_INDEX } from "./tokens";
import { SPACING, getSpacingPx } from "./spacing";

/** Pixels one arrow-key press moves the separator. */
const DEFAULT_KEYBOARD_STEP = 16;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Absolute-position offsets for a handle pinned to a parent's edge. */
const edgePlacement = (
  orientation: "vertical" | "horizontal",
  edge: "start" | "end" | undefined
): Record<string, number> => {
  if (!edge) {
    return {};
  }
  if (orientation === "vertical") {
    return edge === "start"
      ? { top: 0, bottom: 0, left: 0 }
      : { top: 0, bottom: 0, right: 0 };
  }
  return edge === "start"
    ? { left: 0, right: 0, top: 0 }
    : { left: 0, right: 0, bottom: 0 };
};

export interface ResizeHandleProps {
  /**
   * Axis of the separator itself, matching `aria-orientation`. A `vertical`
   * handle is a vertical bar between side-by-side panes and drags left/right;
   * a `horizontal` handle sits between stacked panes and drags up/down.
   */
  orientation: "vertical" | "horizontal";
  /** Current size, in the same units the caller stores. Reported as `aria-valuenow`. */
  value?: number;
  /**
   * Reads the size at the moment of a grab or key press, for panes whose size
   * is measured from the DOM (a responsive default, an imperatively resized
   * window). Takes precedence over `value`, which may then be omitted; without
   * it `aria-valuenow` is left off.
   */
  getValue?: () => number;
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
  /**
   * Pins the strip to an edge of its positioned parent, full length: `start`
   * is the left (vertical) or top (horizontal) edge, `end` the right or
   * bottom. Omit for an in-flow flex item. Offset it with `sx` insets.
   */
  edge?: "start" | "end";
  /** Strip thickness as a `SPACING` step. Defaults to `SPACING.sm` (6px). */
  thickness?: number;
  /**
   * Hit area only: no hover fill. For floating windows whose rounded edges
   * would look wrong under a coloured bar. Cursor, keyboard and the focus ring
   * stay.
   */
  invisible?: boolean;
  /**
   * Shows a small pill centred on the strip so it reads as a control without
   * hovering. For horizontal strips that sit between stacked panes.
   */
  grip?: boolean;
  onDoubleClick?: () => void;
  disabled?: boolean;
  className?: string;
  sx?: SxProps<Theme>;
}

export const ResizeHandle = ({
  orientation,
  value,
  getValue,
  min,
  max,
  onResize,
  onResizeStart,
  onResizeEnd,
  invert = false,
  invertExtremes,
  keyboardStep = DEFAULT_KEYBOARD_STEP,
  ariaLabel,
  edge,
  thickness = SPACING.sm,
  invisible = false,
  grip = false,
  onDoubleClick,
  disabled = false,
  className,
  sx
}: ResizeHandleProps) => {
  const vertical = orientation === "vertical";
  const [isDragging, setIsDragging] = useState(false);
  // Pointer position and value at drag start, plus the value already reported,
  // so a pointer dragged past a bound does not build up slack to undo.
  const drag = useRef({ pointer: 0, start: 0, applied: 0 });

  const readValue = useCallback(
    (): number => (getValue ? getValue() : (value ?? 0)),
    [getValue, value]
  );

  const emit = useCallback(
    (next: number) => {
      const current = readValue();
      const clamped = clamp(next, min, max);
      if (clamped !== current) {
        onResize(clamped - current);
      }
      return clamped;
    },
    [min, max, onResize, readValue]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || event.button !== 0) {
        return;
      }
      event.preventDefault();
      const startValue = readValue();
      drag.current = {
        pointer: orientation === "vertical" ? event.clientX : event.clientY,
        start: startValue,
        applied: startValue
      };
      setIsDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      onResizeStart?.();
    },
    [disabled, orientation, readValue, onResizeStart]
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
      const current = readValue();

      if (event.key === decrease) {
        emit(current - step);
      } else if (event.key === increase) {
        emit(current + step);
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
      readValue,
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
      aria-valuenow={value === undefined ? undefined : Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-disabled={disabled || undefined}
      data-dragging={isDragging ? "true" : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      onDoubleClick={disabled ? undefined : onDoubleClick}
      sx={[
        (theme) => ({
          ...(vertical
            ? { width: getSpacingPx(thickness) }
            : { height: getSpacingPx(thickness) }),
          flex: `0 0 ${getSpacingPx(thickness)}`,
          alignSelf: "stretch",
          boxSizing: "border-box",
          border: "none",
          padding: 0,
          background: "transparent",
          position: edge ? "absolute" : "relative",
          ...edgePlacement(orientation, edge),
          zIndex: edge ? Z_INDEX.dropdown : undefined,
          cursor: disabled
            ? "default"
            : orientation === "vertical"
              ? "col-resize"
              : "row-resize",
          transition: MOTION.background,
          touchAction: "none",
          "&:hover, &[data-dragging='true']": {
            backgroundColor:
              disabled || invisible
                ? "transparent"
                : theme.vars.palette.primary.main
          },
          "&::after": grip
            ? {
                content: '""',
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: getSpacingPx(vertical ? SPACING.micro : SPACING.xxxl),
                height: getSpacingPx(vertical ? SPACING.xxxl : SPACING.micro),
                borderRadius: BORDER_RADIUS.pill,
                backgroundColor: theme.vars.palette.text.disabled,
                transition: MOTION.background,
                pointerEvents: "none"
              }
            : undefined,
          "&:hover::after, &[data-dragging='true']::after": {
            backgroundColor: theme.vars.palette.primary.contrastText
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
