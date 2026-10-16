/**
 * LogView
 *
 * Monospace log lines with a colour per level, an optional copy button and an
 * optional follow-the-tail scroll. One look for install consoles, run logs and
 * script output. Lines are plain strings (level `info`) or `{ text, level }`.
 *
 * Virtualised consoles that need their own row layout can take the line style
 * from `logLevelColor` and `LOG_LINE_STYLE` instead of rendering `LogView`.
 *
 * @example
 * <LogView lines={output} autoScroll emptyText="No output yet." />
 * <LogView lines={[{ text: "boom", level: "error" }]} copyable />
 */

import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from "react";
import { Box } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { CopyButton } from "./CopyButton";
import { SPACING } from "./spacing";
import { BORDER_RADIUS, TYPOGRAPHY, Z_INDEX } from "./tokens";

export type LogLevel = "debug" | "info" | "success" | "warning" | "error";

export interface LogLine {
  text: string;
  level?: LogLevel;
}

export interface LogViewProps {
  lines: ReadonlyArray<string | LogLine>;
  /** Shown instead of the lines when there are none. */
  emptyText?: string;
  /** Adds a copy button (all lines, one per row) in the top right corner. */
  copyable?: boolean;
  /** Keep the view scrolled to the newest line as lines arrive. */
  autoScroll?: boolean;
  /** Scroll past this height. Any CSS length. */
  maxHeight?: string;
  className?: string;
  sx?: SxProps<Theme>;
}

/** Type for one log line: mono, wrapping long messages. */
export const LOG_LINE_STYLE = {
  ...TYPOGRAPHY.mono.code,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere"
} as const;

/** Theme colour (CSS variable) for a log level. */
export const logLevelColor = (theme: Theme, level: LogLevel = "info"): string => {
  switch (level) {
    case "error":
      return theme.vars.palette.error.main;
    case "warning":
      return theme.vars.palette.warning.main;
    case "success":
      return theme.vars.palette.success.main;
    case "debug":
      return theme.vars.palette.text.disabled;
    default:
      return theme.vars.palette.text.secondary;
  }
};

const LogViewInternal = forwardRef<HTMLDivElement, LogViewProps>(
  function LogView(
    {
      lines,
      emptyText = "No output yet.",
      copyable = false,
      autoScroll = false,
      maxHeight = "220px",
      className,
      sx
    },
    ref
  ) {
    const innerRef = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => innerRef.current as HTMLDivElement);

    useEffect(() => {
      const el = innerRef.current;
      if (autoScroll && el) {
        el.scrollTop = el.scrollHeight;
      }
    }, [autoScroll, lines]);

    const normalized = lines.map((line) =>
      typeof line === "string" ? { text: line } : line
    );

    return (
      <Box
        ref={innerRef}
        role="log"
        className={className}
        sx={[
          (theme) => ({
            position: "relative",
            border: `1px solid ${theme.vars.palette.divider}`,
            borderRadius: BORDER_RADIUS.sm,
            backgroundColor: theme.vars.palette.action.hover,
            padding: theme.spacing(SPACING.md, SPACING.lg),
            maxHeight,
            overflow: "auto"
          }),
          ...(Array.isArray(sx) ? sx : [sx])
        ]}
      >
        {copyable && normalized.length > 0 && (
          <Box
            sx={{
              position: "sticky",
              top: 0,
              float: "right",
              zIndex: Z_INDEX.raised
            }}
          >
            <CopyButton
              value={normalized.map((line) => line.text).join("\n")}
            />
          </Box>
        )}
        {normalized.length === 0 ? (
          <Box
            sx={(theme) => ({
              ...LOG_LINE_STYLE,
              color: logLevelColor(theme, "debug")
            })}
          >
            {emptyText}
          </Box>
        ) : (
          normalized.map((line, index) => (
            <Box
              key={index}
              data-level={line.level ?? "info"}
              sx={(theme) => ({
                ...LOG_LINE_STYLE,
                color: logLevelColor(theme, line.level)
              })}
            >
              {line.text}
            </Box>
          ))
        )}
      </Box>
    );
  }
);

export const LogView = memo(LogViewInternal);
LogView.displayName = "LogView";
