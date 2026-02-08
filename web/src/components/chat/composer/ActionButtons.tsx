/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useCallback } from "react";
import { Tooltip, Typography } from "@mui/material";
import { SendMessageButton } from "./SendMessageButton";
import { StopGenerationButton } from "./StopGenerationButton";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";

interface ActionButtonsProps {
  isLoading: boolean;
  isStreaming: boolean;
  onSend: () => void;
  onStop?: () => void;
  onNewChat?: () => void;
  isDisabled: boolean;
  hasContent: boolean;
}

const styles = (_theme: Theme) =>
  css({
    position: "relative",
    marginRight: "0.25em",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px",
    "& .button-wrapper": {
      display: "inline-flex",
      alignItems: "center"
    }
  });

export const ActionButtons: React.FC<ActionButtonsProps> = ({
  isLoading,
  isStreaming,
  onSend,
  onStop,
  isDisabled,
  hasContent
}) => {
  // Show stop button ONLY when generation is actively running
  const showStopButton = (isLoading || isStreaming) && onStop;
  const theme = useTheme();

  // Memoize stop handler to prevent unnecessary re-renders
  const handleStop = useCallback(() => {
    onStop?.();
  }, [onStop]);

  return (
    <div className="chat-action-buttons" css={styles(theme)}>
      {/* {onNewChat && (
        <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="New Chat">
          <span className="new-chat-button-wrapper button-wrapper">
            <NewChatComposerButton disabled={isDisabled} onClick={onNewChat} />
          </span>
        </Tooltip>
      )} */}
      {showStopButton && (
        <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Stop Generation">
          <span className="button-wrapper">
            <StopGenerationButton onClick={handleStop} />
          </span>
        </Tooltip>
      )}
      {!showStopButton && (
        <Tooltip
          enterDelay={TOOLTIP_ENTER_DELAY}
          title={
            <div style={{ textAlign: "center" }}>
              <Typography variant="inherit">Send Message</Typography>
              <Typography variant="inherit">[Enter]</Typography>
            </div>
          }
        >
          <span className="button-wrapper">
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
