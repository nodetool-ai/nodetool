/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { Button, Tooltip, Typography } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import StopCircleOutlinedIcon from "@mui/icons-material/StopCircleOutlined";
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
  ".send-button": {
    marginBottom: "-5px"
  }
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
          <Button className="stop-button" onClick={onStop}>
            <StopCircleOutlinedIcon fontSize="small" />
          </Button>
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
          <Button
            className="send-button"
            onClick={() => {
              if (!isDisabled && hasContent) {
                onSend();
              }
            }}
            sx={{
              "& .MuiSvgIcon-root": {
                filter: !hasContent ? "saturate(0)" : "none"
              }
            }}
          >
            <SendIcon fontSize="small" />
          </Button>
        </Tooltip>
      )}
    </div>
  );
};
