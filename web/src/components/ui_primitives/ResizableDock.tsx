/**
 * ResizableDock — a side-docked column with an edge drag handle.
 *
 * The width is persisted per `storageKey` in localStorage and restored on
 * mount. Arrow keys resize it too, through the shared `ResizeHandle`.
 */

import { useCallback, useState, type ReactNode } from "react";

import { FlexColumn } from "./FlexColumn";
import { FlexRow } from "./FlexRow";
import { ResizeHandle } from "./ResizeHandle";

/** Prefix every assistant dock has always written under. */
const DEFAULT_STORAGE_PREFIX = "nodetool.assistantDock.";
const DEFAULT_WIDTH = 340;
const MIN_WIDTH = 280;
const MAX_WIDTH = 640;

type DockSide = "left" | "right";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function readStoredWidth(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    const value = raw == null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredWidth(key: string, width: number): void {
  try {
    localStorage.setItem(key, String(Math.round(width)));
  } catch {
    /* ignore quota / private-mode */
  }
}

export interface ResizableDockProps {
  /** Persist key. Widths stay independent per dock location. */
  storageKey: string;
  /** localStorage namespace. Defaults to the assistant dock's own prefix. */
  storagePrefix?: string;
  /** Which edge the dock sits on. Decides which way a drag grows it. */
  side?: DockSide;
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

export const ResizableDock = ({
  storageKey,
  storagePrefix = DEFAULT_STORAGE_PREFIX,
  side = "right",
  defaultWidth = DEFAULT_WIDTH,
  minWidth = MIN_WIDTH,
  maxWidth = MAX_WIDTH,
  ariaLabel = "Resize assistant panel",
  className,
  enabled = true,
  children
}: ResizableDockProps) => {
  const fullKey = storagePrefix + storageKey;
  const [width, setWidth] = useState(() =>
    clamp(readStoredWidth(fullKey, defaultWidth), minWidth, maxWidth)
  );

  const handleResize = useCallback(
    (delta: number) => {
      setWidth((current) => {
        const next = clamp(current + delta, minWidth, maxWidth);
        writeStoredWidth(fullKey, next);
        return next;
      });
    },
    [minWidth, maxWidth, fullKey]
  );

  if (!enabled) {
    return (
      <FlexColumn className={className} fullHeight sx={{ minHeight: 0 }}>
        {children}
      </FlexColumn>
    );
  }

  return (
    <FlexRow
      className={className}
      fullHeight
      data-testid="assistant-side-dock"
      sx={(theme) => ({
        // A left dock puts its handle on the right edge, and vice versa.
        flexDirection: side === "right" ? "row" : "row-reverse",
        width,
        minHeight: 0,
        flexShrink: 0,
        backgroundColor: theme.vars.palette.background.paper,
        [side === "right" ? "borderLeft" : "borderRight"]:
          `1px solid ${theme.vars.palette.divider}`,
        overflow: "hidden"
      })}
    >
      <ResizeHandle
        orientation="vertical"
        value={width}
        min={minWidth}
        max={maxWidth}
        onResize={handleResize}
        // A right dock's handle is on its left edge, so dragging left grows it.
        invert={side === "right"}
        // Home has always jumped to the widest dock, whichever side it is on.
        invertExtremes
        ariaLabel={ariaLabel}
      />
      <FlexColumn
        fullHeight
        sx={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}
      >
        {children}
      </FlexColumn>
    </FlexRow>
  );
};

export default ResizableDock;
