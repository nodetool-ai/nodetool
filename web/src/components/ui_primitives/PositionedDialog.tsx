/**
 * PositionedDialog Component
 *
 * A floating, mouse-anchored dialog with a transparent click-to-close backdrop
 * and a blurred, elevated surface. Replaces the hand-rolled `safeLeft`
 * positioning math and `backdropFilter: blur(10px)` recipe duplicated across
 * asset confirmation dialogs.
 *
 * Positioning rules:
 * - Anchor point: an `{x, y}` screen coordinate (usually the cursor position
 *   captured at open-time via `getMousePosition()`).
 * - The dialog is placed above and to the left of the anchor by default, then
 *   clamped inside the viewport with a configurable edge margin.
 */

import React, { memo, useCallback } from "react";
import { Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Surface, SurfaceProps } from "./Surface";

export interface PositionedDialogProps {
  /** Whether the dialog is visible */
  open: boolean;
  /** Close handler invoked when the backdrop is clicked */
  onClose: () => void;
  /** Anchor point in screen coordinates (usually cursor position) */
  anchor: { x: number; y: number };
  /** Dialog width in pixels (default: 400) */
  width?: number;
  /**
   * Pixels to offset the dialog above the anchor (default: 200). The dialog
   * is placed at `anchor.y - offsetY`.
   */
  offsetY?: number;
  /** Minimum margin from viewport edges in pixels (default: 50) */
  edgeMargin?: number;
  /** Backdrop z-index (default: 1300 — matches MUI modal layer) */
  zIndex?: number;
  /** Backdrop filter blur radius in pixels (default: 10) */
  blur?: number;
  /** Elevation for the Surface (default: 3) */
  elevation?: SurfaceProps["elevation"];
  /** Optional className applied to the backdrop */
  backdropClassName?: string;
  /** Optional className applied to the Surface */
  className?: string;
  /** Additional sx overrides applied to the Surface */
  sx?: SurfaceProps["sx"];
  /** Dialog content */
  children?: React.ReactNode;
}

/**
 * PositionedDialog - Mouse-anchored floating dialog
 *
 * @example
 * <PositionedDialog
 *   open={dialogOpen}
 *   onClose={handleClose}
 *   anchor={{ x: mouseX, y: mouseY }}
 *   width={400}
 * >
 *   <DialogTitle>Create folder</DialogTitle>
 *   <DialogBody>…</DialogBody>
 * </PositionedDialog>
 */
export const PositionedDialog: React.FC<PositionedDialogProps> = memo(
  function PositionedDialog({
    open,
    onClose,
    anchor,
    width = 400,
    offsetY = 200,
    edgeMargin = 50,
    zIndex = 1300,
    blur = 10,
    elevation = 3,
    backdropClassName,
    className,
    sx,
    children
  }) {
    const theme = useTheme();

    const handleBackdropClick = useCallback(
      (event: React.MouseEvent) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      },
      [onClose]
    );

    if (!open) {
      return null;
    }

    const screenWidth = typeof window !== "undefined" ? window.innerWidth : 0;

    // Shrink the width to fit the viewport when it would overflow.
    const effectiveWidth = Math.max(
      0,
      Math.min(width, screenWidth - edgeMargin * 2)
    );

    const rawLeft = anchor.x - effectiveWidth;
    const safeLeft = Math.min(
      Math.max(rawLeft, edgeMargin),
      Math.max(edgeMargin, screenWidth - effectiveWidth - edgeMargin)
    );

    const rawTop = anchor.y - offsetY;
    const safeTop = Math.max(rawTop, edgeMargin);

    return (
      <Box
        className={backdropClassName}
        onClick={handleBackdropClick}
        sx={{
          position: "fixed",
          inset: 0,
          backgroundColor: "transparent",
          zIndex
        }}
      >
        <Surface
          className={className}
          elevation={elevation}
          sx={{
            position: "absolute",
            left: `${safeLeft}px`,
            top: `${safeTop}px`,
            width: effectiveWidth,
            maxWidth: `calc(100vw - ${edgeMargin * 2}px)`,
            maxHeight: `calc(100vh - ${edgeMargin * 2}px)`,
            backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.9)`,
            backdropFilter: `blur(${blur}px)`,
            overflow: "hidden",
            ...sx
          }}
        >
          {children}
        </Surface>
      </Box>
    );
  }
);

PositionedDialog.displayName = "PositionedDialog";
