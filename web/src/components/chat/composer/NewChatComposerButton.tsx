import React, { forwardRef } from "react";
import AddCommentOutlinedIcon from "@mui/icons-material/AddCommentOutlined";
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
      onClick={onClick}
      size="small"
      disableRipple={disabled}
      disabled={disabled}
      sx={(theme) => ({
        width: 36,
        height: 36,
        transition: "background-color 0.15s ease, transform 0.1s ease",
        marginRight: "6px",
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
      <AddCommentOutlinedIcon
        fontSize="small"
        sx={(theme) => ({
          color: disabled
            ? theme.vars.palette.grey[500]
            : theme.vars.palette.grey[0]
        })}
      />
    </IconButton>
  );
});

NewChatComposerButton.displayName = "NewChatComposerButton";
