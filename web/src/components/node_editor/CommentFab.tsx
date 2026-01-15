/** @jsxImportSource @emotion/react */
import { useCallback } from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import { Comment } from "@mui/icons-material";
import { useQuickComment } from "../../hooks/useQuickComment";
import { getShortcutTooltip } from "../../config/shortcuts";

interface CommentFabProps {
  active: boolean;
}

const CommentFab: React.FC<CommentFabProps> = ({ active }) => {
  const { handleAddComment } = useQuickComment();

  const handleClick = useCallback(() => {
    if (active) {
      handleAddComment();
    }
  }, [handleAddComment, active]);

  if (!active) {
    return null;
  }

  return (
    <Tooltip
      title={getShortcutTooltip("addComment", "both", "full", true)}
      arrow
      placement="left"
    >
      <Box
        className="comment-fab"
        sx={{
          position: "absolute",
          bottom: 88,
          right: 16,
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          gap: 1
        }}
      >
        <IconButton
          onClick={handleClick}
          aria-label="Add Comment"
          sx={{
            width: 40,
            height: 40,
            bgcolor: "background.paper",
            border: 1,
            borderColor: "divider",
            boxShadow: 2,
            "&:hover": {
              bgcolor: "action.hover",
              boxShadow: 3
            }
          }}
        >
          <Comment sx={{ color: "text.secondary" }} />
        </IconButton>
      </Box>
    </Tooltip>
  );
};

export default CommentFab;
