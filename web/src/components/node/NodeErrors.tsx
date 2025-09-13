/** @jsxImportSource @emotion/react */
import { memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { IconButton } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import useErrorStore from "../../stores/ErrorStore";
import { isEqual } from "lodash";

export const errorStyles = (theme: Theme) =>
  css({
    position: "relative",
    backgroundColor: theme.vars.palette.error.main,
    borderRadius: "1px",
    padding: "10px",
    transition: "background-color 0.2s",
    display: "flex",
    maxWidth: "240px",

    ".error-text": {
      width: "100%",
      maxHeight: "6em",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[1000],
      cursor: "auto",
      userSelect: "text",
      lineHeight: "1.1em",
      padding: "0.5em .2em 0 0",
      overflowX: "hidden",
      overflowY: "auto",
      "&::selection": {
        backgroundColor: theme.vars.palette.grey[0]
      }
    },
    ".copy-button": {
      position: "absolute",
      top: "-2px",
      left: "7px",
      padding: ".2em 0",
      opacity: 0.4,
      svg: {
        width: ".5em",
        height: ".5em"
      },
      "&:hover": {
        opacity: 1
      },
      transition: "opacity 0.2s ease",
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[100]
    }
  });
export const NodeErrors: React.FC<{ id: string; workflow_id: string }> = ({
  id,
  workflow_id
}) => {
  const theme = useTheme();
  const error = useErrorStore((state) =>
    workflow_id !== undefined ? state.getError(workflow_id, id) : undefined
  );
  const { writeClipboard } = useClipboard();

  if (!error) {
    return null;
  }

  return (
    <div css={errorStyles(theme)} className="node-error nodrag nowheel">
      <IconButton
        className="copy-button"
        size="small"
        onClick={() => writeClipboard(error, true)}
        title="Copy error to clipboard"
      >
        <ContentCopyIcon fontSize="small" />
      </IconButton>
      <div className="error-text">{error}</div>
    </div>
  );
};

export default memo(NodeErrors, isEqual);
