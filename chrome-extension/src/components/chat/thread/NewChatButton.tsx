/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { IconButton, Tooltip } from "@mui/material";
import AddCommentIcon from "@mui/icons-material/AddComment";

interface NewChatButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

const buttonStyles = css({
  transition: "all 0.2s ease",
  "&:hover": {
    transform: "scale(1.05)"
  }
});

export function NewChatButton({ onClick, disabled }: NewChatButtonProps) {
  return (
    <Tooltip title="New Chat" placement="bottom">
      <span>
        <IconButton
          css={buttonStyles}
          onClick={onClick}
          disabled={disabled}
          size="small"
          sx={{
            color: "primary.main",
            "&:hover": {
              bgcolor: "action.hover"
            }
          }}
        >
          <AddCommentIcon />
        </IconButton>
      </span>
    </Tooltip>
  );
}

export default NewChatButton;
