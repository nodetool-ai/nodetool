/** @jsxImportSource @emotion/react */
import { memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import { Box } from "@mui/material";
import type { Theme } from "@mui/material/styles";
import useErrorStore from "../../stores/ErrorStore";
import isEqual from "lodash/isEqual";
import { CopyButton } from "../ui_primitives";

export const errorStyles = (theme: Theme) =>
  css({
    position: "relative",
    backgroundColor: theme.vars.palette.error.main,
    borderRadius: "1px",
    padding: "10px",
    transition: "background-color 0.2s",
    display: "flex",
    width: "100%",
    maxWidth: "100%",

    ".error-text": {
      width: "100%",
      maxHeight: "18em",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[1000],
      cursor: "auto",
      userSelect: "text",
      lineHeight: "1.2em",
      padding: "0.5em .2em 0 0",
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      wordBreak: "break-word",
      overflowY: "auto",
      "&::selection": {
        backgroundColor: theme.vars.palette.grey[0]
      }
    },
  });
export const NodeErrors: React.FC<{ id: string; workflow_id: string }> = ({
  id,
  workflow_id
}) => {
  const theme = useTheme();
  const error = useErrorStore((state) =>
    workflow_id !== undefined ? state.getError(workflow_id, id) : undefined
  );

  if (!error) {
    return null;
  }

  let errorDisplay: React.ReactNode = '';
  if (typeof error === 'string') {
    errorDisplay = error;
  } else if (error instanceof Error) {
    errorDisplay = error.message;
  } else if (error && typeof error === 'object' && 'message' in error) {
    errorDisplay = String(error.message);
  } else if (error) {
    errorDisplay = JSON.stringify(error);
  }

  return (
    <div css={errorStyles(theme)} className="node-error nodrag nowheel">
      <Box sx={{ position: "absolute", top: 10, right: 10 }}>
        <CopyButton
          value={errorDisplay}
          tooltip="Copy to clipboard"
          tabIndex={-1}
        />
      </Box>
      <div className="error-text">{errorDisplay}</div>
    </div>
  );
};

export default memo(NodeErrors, isEqual);