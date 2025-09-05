import React, { forwardRef } from "react";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import { IconButton } from "@mui/material";

interface SendMessageButtonProps {
  disabled?: boolean;
  onClick: () => void;
  hasContent?: boolean;
}

export const SendMessageButton = forwardRef<
  HTMLButtonElement,
  SendMessageButtonProps
>(({ disabled = false, onClick, hasContent = true }, ref) => {
  const isDisabled = disabled || !hasContent;
  return (
    <IconButton
      ref={ref}
      onClick={() => {
        if (!isDisabled) onClick();
      }}
      size="small"
      disableRipple={isDisabled}
      disabled={isDisabled}
      sx={(theme) => ({
        width: 36,
        height: 36,
        transition: "background-color 0.15s ease, transform 0.1s ease",
        boxShadow: "none",
        "&:hover": {
          backgroundColor: theme.vars.palette.grey[600]
        },
        "&:active": {
          transform: "translateY(1px)"
        },
        "&:disabled": {
          opacity: 0.5
        }
      })}
    >
      <SendRoundedIcon
        fontSize="small"
        sx={(theme) => ({
          color: isDisabled
            ? theme.vars.palette.grey[500]
            : theme.vars.palette.grey[0]
        })}
      />
    </IconButton>
  );
});

SendMessageButton.displayName = "SendMessageButton";
