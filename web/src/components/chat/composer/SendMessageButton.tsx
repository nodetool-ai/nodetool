import React, { forwardRef } from "react";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
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
      sx={{
        width: 30,
        height: 30,
        borderRadius: "50%",
        backgroundColor: "#ffffff",
        transition: "background-color 0.2s, box-shadow 0.2s",
        boxShadow: "0 0 0 1px rgba(0,0,0,0.1)",
        "&:hover": {
          backgroundColor: "var(--palette-primary-main)"
        }
      }}
    >
      <ArrowUpwardIcon
        fontSize="small"
        sx={{
          color: isDisabled
            ? "var(--palette-text-disabled)"
            : "var(--palette-grey-800)"
        }}
      />
    </IconButton>
  );
});

SendMessageButton.displayName = "SendMessageButton";
