import React, { forwardRef } from "react";
import AddCommentOutlinedIcon from "@mui/icons-material/AddCommentOutlined";
import { ToolbarIconButton } from "../../ui_primitives";

interface NewChatComposerButtonProps {
  disabled?: boolean;
  onClick: () => void;
}

export const NewChatComposerButton = forwardRef<
  HTMLButtonElement,
  NewChatComposerButtonProps
>(({ disabled = false, onClick }, ref) => {
  return (
    <ToolbarIconButton
      ref={ref}
      icon={<AddCommentOutlinedIcon fontSize="small" />}
      tooltip="New chat"
      onClick={onClick}
      disabled={disabled}
      nodrag={false}
      sx={(theme) => ({
        width: 36,
        height: 36,
        marginRight: "6px",
        transition: "background-color 0.15s ease, transform 0.1s ease",
        color: disabled
          ? theme.vars.palette.grey[500]
          : theme.vars.palette.grey[0],
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
    />
  );
});

NewChatComposerButton.displayName = "NewChatComposerButton";
