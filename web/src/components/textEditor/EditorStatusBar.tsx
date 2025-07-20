/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo } from "react";

interface EditorStatusBarProps {
  text: string;
  readOnly?: boolean;
}

const styles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.5em 1em 0 1em",
    backgroundColor: theme.vars.palette.grey[800],
    fontSize: theme.fontSizeSmaller,
    color: theme.vars.palette.grey[200],
    fontFamily: theme.fontFamily2,
    height: "1.75em",
    ".stats": {
      display: "flex",
      gap: "1em",
      ".stat-item": {
        display: "flex",
        alignItems: "center",
        gap: "0.25em",
        fontSize: theme.fontSizeSmaller,
        textTransform: "uppercase",
        ".label": {
          fontWeight: "400"
        },
        ".value": {
          color: theme.vars.palette.grey[100],
          fontWeight: "600"
        }
      }
    },
    ".status-info": {
      display: "flex",
      alignItems: "center",
      gap: "0.5em",
      color: theme.vars.palette.grey[400],
      fontSize: theme.fontSizeTiny
    }
  });

const EditorStatusBar = ({ text, readOnly = false }: EditorStatusBarProps) => {
  const theme = useTheme();

  // Calculate text statistics
  const wordCount = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
  const charCount = text.length;
  const lineCount = text === "" ? 1 : text.split("\n").length;

  return (
    <div className="editor-status-bar" css={styles}>
      <div className="stats">
        <div className="stat-item">
          <span className="label">Words:</span>
          <span className="value">{wordCount.toLocaleString()}</span>
        </div>
        <div className="stat-item">
          <span className="label">Characters:</span>
          <span className="value">{charCount.toLocaleString()}</span>
        </div>
        <div className="stat-item">
          <span className="label">Lines:</span>
          <span className="value">{lineCount.toLocaleString()}</span>
        </div>
      </div>
      <div className="status-info">{readOnly && <span>Read-only</span>}</div>
    </div>
  );
};

export default memo(EditorStatusBar);
