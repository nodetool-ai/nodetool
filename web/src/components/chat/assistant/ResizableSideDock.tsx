/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";

import { FlexColumn, MOTION, SPACING, getSpacingPx } from "../../ui_primitives";

const STORAGE_PREFIX = "nodetool.assistantDock.";
const DEFAULT_WIDTH = 340;
const MIN_WIDTH = 280;
const MAX_WIDTH = 640;
const KEYBOARD_STEP = 16;

function readStoredWidth(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    const value = raw == null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredWidth(key: string, width: number): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, String(Math.round(width)));
  } catch {
    /* ignore quota / private-mode */
  }
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "row",
    height: "100%",
    minHeight: 0,
    flexShrink: 0,
    backgroundColor: theme.vars.palette.background.paper,
    borderLeft: `1px solid ${theme.vars.palette.divider}`,
    overflow: "hidden",

    ".assistant-dock__handle": {
      flex: `0 0 ${getSpacingPx(SPACING.sm)}`,
      alignSelf: "stretch",
      border: "none",
      padding: 0,
      background: "transparent",
      cursor: "col-resize",
      transition: MOTION.background,
      touchAction: "none"
    },
    ".assistant-dock__handle:hover, .assistant-dock__handle.dragging": {
      backgroundColor: theme.vars.palette.primary.main
    },
    ".assistant-dock__handle:focus-visible": {
      outline: `2px solid ${theme.vars.palette.primary.main}`,
      outlineOffset: "-2px"
    },
    ".assistant-dock__body": {
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden"
    }
  });

export interface ResizableSideDockProps {
  /** Persist key. Widths stay independent per assistant location. */
  storageKey: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  ariaLabel?: string;
  className?: string;
  /**
   * When false, render the children at full size with no reserved width
   * (narrow / stacked layouts).
   */
  enabled?: boolean;
  children: ReactNode;
}

/**
 * Right-docked column with a left-edge drag handle. Arrow keys also resize it.
 * Used by every editor assistant so the panels behave the same.
 */
const ResizableSideDock = ({
  storageKey,
  defaultWidth = DEFAULT_WIDTH,
  minWidth = MIN_WIDTH,
  maxWidth = MAX_WIDTH,
  ariaLabel = "Resize assistant panel",
  className,
  enabled = true,
  children
}: ResizableSideDockProps) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const [width, setWidth] = useState(() =>
    clamp(readStoredWidth(storageKey, defaultWidth), minWidth, maxWidth)
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ pointer: 0, width: 0 });

  const persist = useCallback(
    (next: number) => {
      const clamped = clamp(next, minWidth, maxWidth);
      setWidth(clamped);
      writeStoredWidth(storageKey, clamped);
      return clamped;
    },
    [minWidth, maxWidth, storageKey]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      dragStart.current = { pointer: event.clientX, width };
      setIsDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [width]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) {
        return;
      }
      // The handle sits on the left edge: drag left grows the panel.
      persist(dragStart.current.width - (event.clientX - dragStart.current.pointer));
    },
    [isDragging, persist]
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
    },
    [isDragging]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        persist(width + KEYBOARD_STEP);
      } else if (event.key === "ArrowRight") {
        persist(width - KEYBOARD_STEP);
      } else if (event.key === "Home") {
        persist(maxWidth);
      } else if (event.key === "End") {
        persist(minWidth);
      } else {
        return;
      }
      event.preventDefault();
    },
    [persist, width, minWidth, maxWidth]
  );

  if (!enabled) {
    return (
      <FlexColumn className={className} fullHeight sx={{ minHeight: 0 }}>
        {children}
      </FlexColumn>
    );
  }

  return (
    <div
      css={cssStyles}
      className={className}
      style={{ width }}
      data-testid="assistant-side-dock"
    >
      <div
        className={`assistant-dock__handle${isDragging ? " dragging" : ""}`}
        role="separator"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-orientation="vertical"
        aria-valuenow={Math.round(width)}
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
      />
      <div className="assistant-dock__body">{children}</div>
    </div>
  );
};

export default ResizableSideDock;
