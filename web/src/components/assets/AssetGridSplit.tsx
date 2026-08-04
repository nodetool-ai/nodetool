/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { MOTION } from "../ui_primitives";

const SEPARATOR_THICKNESS = 6;
/** Pixels one arrow-key press moves the separator. */
const KEYBOARD_STEP = 16;

export type SplitOrientation = "horizontal" | "vertical";

interface AssetGridSplitProps {
  /** `horizontal` puts the folder pane beside the grid, `vertical` above it. */
  orientation: SplitOrientation;
  /** Starting size of the folder pane, in pixels along the split axis. */
  initialSize: number;
  minSize?: number;
  maxSize?: number;
  /** The folder pane. */
  first: React.ReactNode;
  /** The file grid — takes the remaining space. */
  second: React.ReactNode;
  separatorLabel: string;
}

const styles = (theme: Theme, orientation: SplitOrientation) =>
  css({
    display: "flex",
    flexDirection: orientation === "horizontal" ? "row" : "column",
    width: "100%",
    height: "100%",
    minWidth: 0,
    minHeight: 0,

    ".asset-split-pane": {
      minWidth: 0,
      minHeight: 0,
      overflow: "hidden"
    },
    ".asset-split-pane.first": {
      flexGrow: 0,
      flexShrink: 0
    },
    ".asset-split-pane.second": {
      flexGrow: 1,
      flexBasis: 0
    },

    ".asset-split-separator": {
      flex: `0 0 ${SEPARATOR_THICKNESS}px`,
      alignSelf: "stretch",
      border: "none",
      padding: 0,
      background: "transparent",
      cursor: orientation === "horizontal" ? "col-resize" : "row-resize",
      transition: `background-color ${MOTION.normal}`,
      touchAction: "none"
    },
    ".asset-split-separator:hover, .asset-split-separator.dragging": {
      backgroundColor: theme.vars.palette.grey[800]
    },
    ".asset-split-separator:focus-visible": {
      outline: `2px solid ${theme.vars.palette.primary.main}`,
      outlineOffset: "-2px"
    }
  });

/**
 * Two-pane resizable split for the asset browser: a folder pane at a fixed
 * size along the split axis, a file grid taking the rest, and a separator the
 * user can drag or move with the keyboard.
 *
 * This replaces a Dockview layout. Dockview brought a full docking framework —
 * draggable tabs, floating groups, serialized layouts — for what has only ever
 * been one immovable split, and cost 310 KB plus a stylesheet of overrides to
 * hide the parts that were never wanted.
 */
const AssetGridSplit: React.FC<AssetGridSplitProps> = ({
  orientation,
  initialSize,
  minSize = 120,
  maxSize = 600,
  first,
  second,
  separatorLabel
}) => {
  const theme = useTheme();
  const [size, setSize] = useState(initialSize);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ pointer: 0, size: 0 });

  const clamp = useCallback(
    (value: number) => Math.min(maxSize, Math.max(minSize, value)),
    [minSize, maxSize]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragStart.current = {
        pointer: orientation === "horizontal" ? event.clientX : event.clientY,
        size
      };
      setIsDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [orientation, size]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      const current =
        orientation === "horizontal" ? event.clientX : event.clientY;
      setSize(clamp(dragStart.current.size + current - dragStart.current.pointer));
    },
    [isDragging, orientation, clamp]
  );

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      setIsDragging(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [isDragging]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const decrease = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
      const increase = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
      if (event.key === decrease) {
        setSize((s) => clamp(s - KEYBOARD_STEP));
      } else if (event.key === increase) {
        setSize((s) => clamp(s + KEYBOARD_STEP));
      } else if (event.key === "Home") {
        setSize(minSize);
      } else if (event.key === "End") {
        setSize(maxSize);
      } else {
        return;
      }
      event.preventDefault();
    },
    [orientation, clamp, minSize, maxSize]
  );

  const firstPaneStyle: React.CSSProperties =
    orientation === "horizontal" ? { width: size } : { height: size };

  return (
    <div css={styles(theme, orientation)} className="asset-split">
      <div className="asset-split-pane first" style={firstPaneStyle}>
        {first}
      </div>
      <div
        className={`asset-split-separator${isDragging ? " dragging" : ""}`}
        role="separator"
        tabIndex={0}
        aria-label={separatorLabel}
        aria-orientation={
          orientation === "horizontal" ? "vertical" : "horizontal"
        }
        aria-valuenow={Math.round(size)}
        aria-valuemin={minSize}
        aria-valuemax={maxSize}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
      />
      <div className="asset-split-pane second">{second}</div>
    </div>
  );
};

export default AssetGridSplit;
