/** @jsxImportSource @emotion/react */
/**
 * The divider above the piano roll's velocity or controller lane. Drag it, or
 * focus it and press the arrow keys, to resize the lane.
 */

import React, { memo, useRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { MOTION } from "../../ui_primitives";

const HANDLE_HEIGHT_PX = 4;
const KEYBOARD_STEP_PX = 8;

const handleStyles = (theme: Theme) =>
  css({
    height: HANDLE_HEIGHT_PX,
    flexShrink: 0,
    cursor: "ns-resize",
    touchAction: "none",
    outline: "none",
    backgroundColor: theme.vars.palette.divider,
    transition: MOTION.background,
    "&:hover, &:focus-visible, &[data-dragging]": {
      backgroundColor: theme.vars.palette.primary.main
    }
  });

interface LaneResizeHandleProps {
  label: string;
  heightPx: number;
  minPx: number;
  maxPx: number;
  onResize: (heightPx: number) => void;
}

export const LaneResizeHandle: React.FC<LaneResizeHandleProps> = memo(
  ({ label, heightPx, minPx, maxPx, onResize }) => {
    const theme = useTheme();
    const startRef = useRef<{ y: number; height: number } | null>(null);
    const clamp = (px: number): number => Math.round(Math.min(maxPx, Math.max(minPx, px)));
    return (
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={label}
        aria-valuenow={heightPx}
        aria-valuemin={minPx}
        aria-valuemax={maxPx}
        tabIndex={0}
        css={handleStyles(theme)}
        onPointerDown={(e) => {
          if (e.button !== 0) {
            return;
          }
          startRef.current = { y: e.clientY, height: heightPx };
          e.currentTarget.dataset.dragging = "";
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Without capture the drag still works while the pointer stays on the handle.
          }
        }}
        onPointerMove={(e) => {
          const start = startRef.current;
          if (start) {
            // The lane sits under the handle: dragging up makes it taller.
            onResize(clamp(start.height + start.y - e.clientY));
          }
        }}
        onPointerUp={(e) => {
          startRef.current = null;
          delete e.currentTarget.dataset.dragging;
        }}
        onPointerCancel={(e) => {
          startRef.current = null;
          delete e.currentTarget.dataset.dragging;
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            onResize(clamp(heightPx + (e.key === "ArrowUp" ? KEYBOARD_STEP_PX : -KEYBOARD_STEP_PX)));
          }
        }}
      />
    );
  }
);

LaneResizeHandle.displayName = "LaneResizeHandle";
