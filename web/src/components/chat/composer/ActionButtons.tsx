/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useCallback, useMemo } from "react";
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

  // Memoize styles to prevent recreation on every render
  const stylesValue = useMemo(() => createStyles(theme), [theme]);

  // Memoize stop handler to prevent unnecessary re-renders
  const handleStop = useCallback(() => {
    onStop?.();
  }, [onStop]);

  return (
    <div className="chat-action-buttons" css={stylesValue}>
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

const createStyles = (theme: Theme) =>
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

export default React.memo(ActionButtons, (prevProps, nextProps) => {
  return (
    prevProps.isLoading === nextProps.isLoading &&
    prevProps.isStreaming === nextProps.isStreaming &&
    prevProps.isDisabled === nextProps.isDisabled &&
    prevProps.hasContent === nextProps.hasContent
  );
});
