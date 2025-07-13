import React, { forwardRef } from "react";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import { IconButton } from "@mui/material";

interface NewChatComposerButtonProps {
  disabled?: boolean;
  onClick: () => void;
}

export const NewChatComposerButton = forwardRef<
  HTMLButtonElement,
  NewChatComposerButtonProps
>(({ disabled = false, onClick }, ref) => {
  return (
    <IconButton
      ref={ref}
      onClick={() => {
        if (!disabled) onClick();
      }}
      size="small"
      disableRipple={disabled}
      disabled={disabled}
      sx={{
        width: 30,
        height: 30,
        borderRadius: "50%",
        backgroundColor: "transparent",
        transition: "all 0.2s",
        marginRight: "8px",
        "&:hover": {
          backgroundColor: "var(--palette-action-hover)",
          borderColor: "var(--palette-primary-main)"
        },
        "&:disabled": {
          opacity: 0.5,
          borderColor: "var(--palette-grey-500)"
        }
      }}
    >
      <ChatBubbleOutlineIcon
        fontSize="small"
        sx={{
          color: disabled
            ? "var(--palette-text-disabled)"
            : "var(--palette-text-primary)"
        }}
      />
    </IconButton>
  );
});

NewChatComposerButton.displayName = "NewChatComposerButton"; 