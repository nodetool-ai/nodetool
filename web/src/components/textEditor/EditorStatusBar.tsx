/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo } from "react";
import { Box, BORDER_RADIUS } from "../ui_primitives";
import LockIcon from "@mui/icons-material/Lock";

interface EditorStatusBarProps {
  text: string;
  readOnly?: boolean;
  /** Number of template variables detected in the document. */
  varCount?: number;
  /** Active editor language label (e.g. "Plain Text"). */
  languageLabel?: string;
  /** Current cursor position (1-based). Shown when available. */
  cursor?: { line: number; column: number } | null;
  /** Indent size in spaces, shown as "Spaces: n". */
  indentSize?: number;
  /** Character encoding label. */
  encoding?: string;
}

const styles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.4em 1.25em",
    backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.7)`,
    backdropFilter: "blur(8px)",
    fontSize: theme.fontSizeSmaller,
    color: theme.vars.palette.grey[300],
    fontFamily: theme.fontFamily2,
    height: "2em",
    position: "relative",
    "&::before": {
      content: "''",
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: "1px",
      background: `linear-gradient(90deg,
        rgba(${theme.vars.palette.common.whiteChannel} / 0.06),
        rgba(${theme.vars.palette.common.whiteChannel} / 0.03) 50%,
        transparent 100%)`
    },
    ".stats": {
      display: "flex",
      gap: "0.5em",
      alignItems: "center"
    },
    ".stat-item": {
      display: "flex",
      alignItems: "center",
      gap: "0.25em",
      fontSize: theme.fontSizeSmaller,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      ".label": {
        fontWeight: 400,
        opacity: 0.7
      },
      ".value": {
        color: theme.vars.palette.grey[100],
        fontWeight: 600
      }
    },
    ".stat-dot": {
      width: "3px",
      height: "3px",
      borderRadius: BORDER_RADIUS.circle,
      backgroundColor: `rgba(${theme.vars.palette.common.whiteChannel} / 0.15)`,
      flexShrink: 0
    },
    ".status-info": {
      display: "flex",
      alignItems: "center",
      gap: "0.85em",
      color: theme.vars.palette.grey[400],
      fontSize: theme.fontSizeTiny,
      ".info-item": {
        whiteSpace: "nowrap"
      }
    },
    ".read-only-badge": {
      display: "inline-flex",
      alignItems: "center",
      gap: "0.25em",
      padding: theme.spacing(0.5, 2),
      borderRadius: BORDER_RADIUS.md,
      fontSize: theme.fontSizeTiny,
      fontWeight: 500,
      letterSpacing: "0.03em",
      textTransform: "uppercase",
      color: theme.vars.palette.warning.main,
      backgroundColor: `rgba(${theme.vars.palette.warning.mainChannel} / 0.08)`,
      border: `1px solid rgba(${theme.vars.palette.warning.mainChannel} / 0.15)`,
      svg: {
        fontSize: "var(--fontSizeSmaller)"
      }
    }
  });

const EditorStatusBar = ({
  text,
  readOnly = false,
  varCount,
  languageLabel,
  cursor,
  indentSize = 2,
  encoding = "UTF-8"
}: EditorStatusBarProps) => {
  const theme = useTheme();

  const wordCount = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
  const charCount = text.length;
  const lineCount = text === "" ? 1 : text.split("\n").length;

  return (
    <Box className="editor-status-bar" css={styles(theme)}>
      <div className="stats">
        <div className="stat-item">
          <span className="label">Words:</span>
          <span className="value">{wordCount.toLocaleString()}</span>
        </div>
        <span className="stat-dot" />
        <div className="stat-item">
          <span className="label">Chars:</span>
          <span className="value">{charCount.toLocaleString()}</span>
        </div>
        <span className="stat-dot" />
        <div className="stat-item">
          <span className="label">Lines:</span>
          <span className="value">{lineCount.toLocaleString()}</span>
        </div>
        {varCount !== undefined && (
          <>
            <span className="stat-dot" />
            <div className="stat-item">
              <span className="label">Vars:</span>
              <span className="value">{varCount.toLocaleString()}</span>
            </div>
          </>
        )}
      </div>
      <div className="status-info">
        {readOnly && (
          <span className="read-only-badge">
            <LockIcon />
            Read-only
          </span>
        )}
        {cursor && (
          <span className="info-item">
            Ln {cursor.line}, Col {cursor.column}
          </span>
        )}
        {languageLabel && <span className="info-item">{languageLabel}</span>}
        <span className="info-item">Spaces: {indentSize}</span>
        <span className="info-item">{encoding}</span>
      </div>
    </Box>
  );
};

export default memo(EditorStatusBar);
