/** @jsxImportSource @emotion/react */
/**
 * ConsolePanel — collapsible view of the live conda/uv/npm output streamed from
 * the desktop app during package install/uninstall.
 */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useEffect, useState } from "react";

import {
  BORDER_RADIUS,
  EditorButton,
  FlexColumn,
  FlexRow
} from "../ui_primitives";

const consoleStyles = (theme: Theme) =>
  css({
    fontFamily: theme.fontFamily2,
    fontSize: theme.fontSizeSmaller,
    color: theme.vars.palette.text.secondary,
    backgroundColor: theme.vars.palette.action.hover,
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: BORDER_RADIUS.xs,
    padding: "0.75em",
    margin: 0,
    maxHeight: "220px",
    overflow: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word"
  });

interface ConsolePanelProps {
  lines: string[];
  onClear: () => void;
  /** Reveal the console when an install/uninstall is in flight. */
  busy?: boolean;
}

const ConsolePanel = ({ lines, onClear, busy = false }: ConsolePanelProps) => {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  // Auto-open when an operation begins so its live output is visible without a
  // manual toggle; the user can still hide it mid-run.
  useEffect(() => {
    if (busy) setOpen(true);
  }, [busy]);

  return (
    <FlexColumn gap={1}>
      <FlexRow gap={1.5} align="center" justify="space-between">
        <EditorButton
          variant="text"
          density="compact"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? "Hide console" : "Show console"}
          {lines.length > 0 ? ` (${lines.length})` : ""}
        </EditorButton>
        {open && lines.length > 0 && (
          <EditorButton variant="text" density="compact" onClick={onClear}>
            Clear
          </EditorButton>
        )}
      </FlexRow>
      {open && (
        <pre css={consoleStyles(theme)}>
          {lines.length > 0
            ? lines.join("\n")
            : "No output yet. Logs appear here during install."}
        </pre>
      )}
    </FlexColumn>
  );
};

export default memo(ConsolePanel);
