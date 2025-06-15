/** @jsxImportSource @emotion/react */
import { css, useTheme } from "@emotion/react";
import { memo } from "react";

interface EditorStatusBarProps {
  text: string;
  readOnly?: boolean;
}

const styles = (theme: any) =>
  css({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.5em 1em",
    backgroundColor: theme.palette.c_gray0,
    borderTop: `1px solid ${theme.palette.c_gray2}`,
    fontSize: theme.fontSizeSmaller,
    color: theme.palette.c_gray5,
    fontFamily: theme.fontFamily2,
    height: "2em",
    ".stats": {
      display: "flex",
      gap: "1em",
      ".stat-item": {
        display: "flex",
        alignItems: "center",
        gap: "0.25em",
        ".label": {
          fontWeight: "500"
        },
        ".value": {
          color: theme.palette.c_gray6,
          fontWeight: "600"
        }
      }
    },
    ".status-info": {
      display: "flex",
      alignItems: "center",
      gap: "0.5em",
      color: theme.palette.c_gray4,
      fontSize: theme.fontSizeTiny
    }
  });

const EditorStatusBar = ({ text, readOnly = false }: EditorStatusBarProps) => {
  const theme = useTheme();

  // Calculate text statistics
  const wordCount = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
  const charCount = text.length;
  const charCountNoSpaces = text.replace(/\s/g, "").length;
  const lineCount = text === "" ? 1 : text.split("\n").length;

  return (
    <div css={styles(theme)}>
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
          <span className="label">No spaces:</span>
          <span className="value">{charCountNoSpaces.toLocaleString()}</span>
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
