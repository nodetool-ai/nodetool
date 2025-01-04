/** @jsxImportSource @emotion/react */
import { memo } from "react";
import { css } from "@emotion/react";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { Button } from "@mui/material";
import useErrorStore from "../../stores/ErrorStore";
import { isEqual } from "lodash";

export const errorStyles = (theme: any) =>
  css({
    position: "relative",
    backgroundColor: theme.palette.c_error,
    borderRadius: "1px",
    padding: "10px",
    transition: "background-color 0.2s",
    display: "flex",
    maxWidth: "240px",

    ".error-text": {
      maxHeight: "6em",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmaller,
      color: theme.palette.c_black,
      cursor: "auto",
      userSelect: "text",
      lineHeight: "1.1em",
      padding: "0.5em .2em 0 0",
      overflowX: "hidden",
      overflowY: "auto",
      "&::selection": {
        backgroundColor: theme.palette.c_white
      }
    },
    button: {
      position: "absolute",
      left: "8px",
      top: "-2px",
      height: "1em",
      padding: "6px 3px",
      borderRadius: "1px",
      fontSize: theme.fontSizeSmall,
      color: theme.palette.c_white,
      backgroundColor: theme.palette.c_gray1,
      "&:hover": {
        backgroundColor: theme.palette.c_gray2
      }
    }
  });

export const NodeErrors: React.FC<{ id: string; workflow_id: string }> = ({
  id,
  workflow_id
}) => {
  const error = useErrorStore((state) =>
    workflow_id !== undefined ? state.getError(workflow_id, id) : undefined
  );
  const { writeClipboard } = useClipboard();

  if (!error) {
    return null;
  }
  return (
    <div css={errorStyles} className="node-error nodrag nowheel">
      <Button
        size="small"
        onClick={() => writeClipboard(error, true)}
        title="Copy error to clipboard"
      >
        COPY
      </Button>
      <div className="error-text">{error}</div>
    </div>
  );
};

export default memo(NodeErrors, isEqual);
