/**
 * StatusBar
 *
 * The slim strip under an editor: selection, hints, counts, zoom. A bottom
 * `Toolbar` at `compact` density with caption type in `text.secondary`.
 * `SaveState` is the one save readout: the dirty dot, "Saving…", "Saved".
 *
 * @example
 * <StatusBar>
 *   <StatusBarItem grow>{hint}</StatusBarItem>
 *   <SaveState state={dirty ? "dirty" : "saved"} />
 *   <StatusBarItem>{count} items</StatusBarItem>
 * </StatusBar>
 */

import { forwardRef } from "react";
import { Box } from "./Box";
import type { BoxProps } from "./Box";
import { LoadingSpinner } from "./LoadingSpinner";
import { SPACING, getSpacingPx } from "./spacing";
import { BORDER_RADIUS, TYPOGRAPHY } from "./tokens";
import { Toolbar } from "./Toolbar";
import type { ToolbarProps } from "./Toolbar";

export type StatusBarProps = Omit<ToolbarProps, "position" | "density">;

export const StatusBar = forwardRef<HTMLDivElement, StatusBarProps>(
  ({ sx, children, ...props }, ref) => (
    <Toolbar
      ref={ref}
      component="footer"
      position="bottom"
      density="compact"
      sx={[
        {
          ...TYPOGRAPHY.sans.caption,
          color: "text.secondary",
          gap: SPACING.lg,
          overflow: "hidden",
          whiteSpace: "nowrap"
        },
        ...(Array.isArray(sx) ? sx : [sx])
      ]}
      {...props}
    >
      {children}
    </Toolbar>
  )
);

StatusBar.displayName = "StatusBar";

export interface StatusBarItemProps extends BoxProps {
  /** Take the free width and truncate with an ellipsis. */
  grow?: boolean;
}

/** One readout in a `StatusBar`. Never wraps; `grow` makes it the flexible one. */
export const StatusBarItem = forwardRef<HTMLDivElement, StatusBarItemProps>(
  ({ grow = false, sx, children, ...props }, ref) => (
    <Box
      ref={ref}
      sx={[
        {
          display: "flex",
          alignItems: "center",
          gap: SPACING.xs,
          whiteSpace: "nowrap",
          minWidth: 0,
          ...(grow
            ? { flex: 1, overflow: "hidden", textOverflow: "ellipsis" }
            : { flexShrink: 0 })
        },
        ...(Array.isArray(sx) ? sx : [sx])
      ]}
      {...props}
    >
      {children}
    </Box>
  )
);

StatusBarItem.displayName = "StatusBarItem";

export type SaveStateValue = "idle" | "dirty" | "saving" | "saved" | "error";

const DEFAULT_LABELS: Record<Exclude<SaveStateValue, "idle">, string> = {
  dirty: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed"
};

const DOT_COLOR: Record<Exclude<SaveStateValue, "idle">, string> = {
  dirty: "warning.main",
  saving: "info.main",
  saved: "success.main",
  error: "error.main"
};

export interface SaveStateProps {
  /** `idle` renders nothing. */
  state: SaveStateValue;
  /**
   * Show the text beside the dot. Without it the dot alone carries the state
   * and is labelled for screen readers.
   * @default true
   */
  showLabel?: boolean;
  /** Replace the default text for a state, e.g. `{ saved: "Draft saved" }`. */
  labels?: Partial<Record<Exclude<SaveStateValue, "idle">, string>>;
  className?: string;
}

/** Dirty dot plus "Saving…" / "Saved" text. Used in toolbars and status bars. */
export const SaveState: React.FC<SaveStateProps> = ({
  state,
  showLabel = true,
  labels,
  className
}) => {
  if (state === "idle") {
    return null;
  }
  const label = labels?.[state] ?? DEFAULT_LABELS[state];
  return (
    <Box
      className={className}
      aria-live={showLabel ? "polite" : undefined}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: SPACING.xs,
        minWidth: 0,
        flexShrink: 0
      }}
    >
      {state === "saving" ? (
        <LoadingSpinner inline size={14} />
      ) : (
        <Box
          role={showLabel ? undefined : "img"}
          aria-label={showLabel ? undefined : label}
          aria-hidden={showLabel ? true : undefined}
          sx={{
            width: getSpacingPx(SPACING.md),
            height: getSpacingPx(SPACING.md),
            borderRadius: BORDER_RADIUS.circle,
            bgcolor: DOT_COLOR[state],
            flexShrink: 0
          }}
        />
      )}
      {showLabel && (
        <Box component="span" sx={{ ...TYPOGRAPHY.sans.caption, color: "text.secondary", whiteSpace: "nowrap" }}>
          {label}
        </Box>
      )}
    </Box>
  );
};

SaveState.displayName = "SaveState";
