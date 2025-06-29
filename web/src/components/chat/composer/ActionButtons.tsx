/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { Tooltip, Typography } from "@mui/material";
import { SendMessageButton } from "./SendMessageButton";
import { StopGenerationButton } from "./StopGenerationButton";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";

interface ActionButtonsProps {
  status:
    | "disconnected"
    | "connecting"
    | "connected"
    | "loading"
    | "error"
    | "streaming"
    | "reconnecting"
    | "disconnecting"
    | "failed";
  onSend: () => void;
  onStop?: () => void;
  isDisabled: boolean;
  hasContent: boolean;
}

const styles = css({
  position: "relative",
  paddingBottom: "0.6em",
  marginRight: "0.25em"
});

export const ActionButtons: React.FC<ActionButtonsProps> = ({
  status,
  onSend,
  onStop,
  isDisabled,
  hasContent
}) => {
  return (
    <div className="chat-action-buttons" css={styles}>
      {status === "loading" && onStop && (
        <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Stop Generation">
          <span style={{ display: "inline-flex" }}>
            <StopGenerationButton onClick={onStop} />
          </span>
        </Tooltip>
      )}
      {!(status === "loading" && onStop) && (
        <Tooltip
          enterDelay={TOOLTIP_ENTER_DELAY}
          title={
            <div style={{ textAlign: "center" }}>
              <Typography variant="inherit">Send Message</Typography>
              <Typography variant="inherit">[Enter]</Typography>
            </div>
          }
        >
          <span style={{ display: "inline-flex" }}>
            <SendMessageButton
              disabled={isDisabled}
              hasContent={hasContent}
              onClick={onSend}
            />
          </span>
        </Tooltip>
      )}
    </div>
  );
};
