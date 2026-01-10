/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useState, useCallback } from "react";
import { Box, IconButton, TextField, Tooltip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import CommentIcon from "@mui/icons-material/Comment";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import { useNodes } from "../../contexts/NodeContext";
import { NodeData } from "../../stores/NodeData";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "4px 8px",
    backgroundColor: "rgba(255, 193, 7, 0.1)",
    border: "1px solid rgba(255, 193, 7, 0.3)",
    borderRadius: "4px",
    fontSize: "0.75rem",
    color: theme.vars.palette.text.secondary,
    maxWidth: "100%",
    overflow: "hidden",
  });

const commentButtonStyles = css({
  padding: "2px",
  minWidth: "unset",
  "& .MuiSvgIcon-root": {
    fontSize: "1rem",
  },
});

interface NodeCommentProps {
  nodeId: string;
  comment: string | undefined;
}

const NodeComment: React.FC<NodeCommentProps> = ({ nodeId, comment }) => {
  const theme = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(comment || "");
  const { updateNodeData } = useNodes((state) => ({
    updateNodeData: state.updateNodeData,
  }));

  const handleSave = useCallback(() => {
    updateNodeData(nodeId, {
      comment: editValue.trim() || undefined
    });
    setIsEditing(false);
  }, [nodeId, editValue, updateNodeData]);

  const handleCancel = useCallback(() => {
    setEditValue(comment || "");
    setIsEditing(false);
  }, [comment]);

  const handleDelete = useCallback(() => {
    updateNodeData(nodeId, {
      comment: undefined,
    });
  }, [nodeId, updateNodeData]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Escape") {
        handleCancel();
      }
    },
    [handleSave, handleCancel]
  );

  if (isEditing) {
    return (
      <Box css={styles(theme)}>
        <TextField
          size="small"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          placeholder="Add a comment..."
          variant="standard"
          autoFocus
          multiline
          maxRows={3}
          sx={{
            flex: 1,
            "& .MuiInput-input": {
              fontSize: "0.75rem",
              padding: "2px 0",
            },
            "& .MuiInput-underline:before": {
              borderBottom: "none",
            },
            "& .MuiInput-underline:hover:before": {
              borderBottom: "none",
            },
          }}
        />
        <IconButton
          size="small"
          onClick={handleCancel}
          css={commentButtonStyles}
          sx={{ color: "text.secondary" }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
    );
  }

  if (!comment) {
    return (
      <Tooltip title="Add comment">
        <IconButton
          size="small"
          onClick={() => {
            setEditValue("");
            setIsEditing(true);
          }}
          css={commentButtonStyles}
          sx={{ color: "text.secondary" }}
        >
          <CommentIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    );
  }

  return (
    <Tooltip title={comment}>
      <Box
        css={css([
          styles(theme),
          css({
            cursor: "pointer",
            "&:hover": {
              backgroundColor: "rgba(255, 193, 7, 0.15)",
              "& .comment-edit-btn": {
                opacity: 1,
              },
            },
          }),
        ])}
        onClick={() => setIsEditing(true)}
      >
        <CommentIcon fontSize="small" sx={{ flexShrink: 0 }} />
        <Box
          component="span"
          sx={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {comment}
        </Box>
        <IconButton
          size="small"
          className="comment-edit-btn"
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
          }}
          css={css([commentButtonStyles, css({ opacity: 0, transition: "opacity 0.2s" })])}
          sx={{ color: "text.secondary" }}
        >
          <EditIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            handleDelete();
          }}
          css={commentButtonStyles}
          sx={{ color: "text.secondary" }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
    </Tooltip>
  );
};

export default memo(NodeComment);
