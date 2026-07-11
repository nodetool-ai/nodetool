/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useCallback, memo, useMemo } from "react";
import { Tooltip, Text, SPACING, getSpacingPx } from "../../ui_primitives";
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
    padding: getSpacingPx(SPACING.sm),
    "& .button-wrapper": {
      display: "inline-flex",
      alignItems: "center"
    }
  });

export const ActionButtons: React.FC<ActionButtonsProps> = memo(({
  isLoading,
  isStreaming,
  onSend,
  onStop,
  isDisabled,
  hasContent
}) => {
  const showStopButton = (isLoading || isStreaming) && onStop;
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  const handleStop = useCallback(() => {
    onStop?.();
  }, [onStop]);

  return (
    <div className="chat-action-buttons" css={cssStyles}>
      {showStopButton && (
        <Tooltip delay={TOOLTIP_ENTER_DELAY} title="Stop Generation">
          <span className="button-wrapper">
            <StopGenerationButton onClick={handleStop} />
          </span>
        </Tooltip>
      )}
      {!showStopButton && (
        <Tooltip
          delay={TOOLTIP_ENTER_DELAY}
          title={
            <div style={{ textAlign: "center" }}>
              <Text>Send Message</Text>
              <Text>[Enter]</Text>
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
});

ActionButtons.displayName = "ActionButtons";
