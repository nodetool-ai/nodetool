/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useState, useRef, useEffect } from "react";
import { Box, IconButton, TextField, Tooltip } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CommentIcon from "@mui/icons-material/Comment";

interface NodeCommentProps {
  nodeId: string;
  comment: string;
  onUpdateComment: (nodeId: string, comment: string) => void;
  onDeleteComment: (nodeId: string) => void;
}

const commentStyles = (theme: Theme) =>
  css({
    "& .comment-container": {
      marginTop: "8px",
      padding: "8px 12px",
      backgroundColor: theme.vars.palette.action.hover,
      borderRadius: "6px",
      border: `1px solid ${theme.vars.palette.divider}`,
      borderLeft: `3px solid ${theme.vars.palette.info.main}`,
    },
    "& .comment-display": {
      display: "flex",
      alignItems: "flex-start",
      gap: "8px",
      "& .comment-icon": {
        color: theme.vars.palette.info.main,
        fontSize: "18px",
        flexShrink: 0,
        marginTop: "2px",
      },
      "& .comment-text": {
        flex: 1,
        fontSize: "0.85rem",
        color: theme.vars.palette.text.secondary,
        wordBreak: "break-word",
        lineHeight: 1.4,
      },
      "& .comment-actions": {
        display: "flex",
        gap: "2px",
        opacity: 0,
        transition: "opacity 0.2s",
      },
      "&:hover .comment-actions": {
        opacity: 1,
      },
    },
    "& .comment-edit": {
      "& .MuiTextField-root": {
        width: "100%",
      },
      "& .MuiOutlinedInput-root": {
        fontSize: "0.85rem",
        backgroundColor: theme.vars.palette.background.paper,
      },
    },
  });

const NodeComment: React.FC<NodeCommentProps> = memo(function NodeComment({
  nodeId,
  comment,
  onUpdateComment,
  onDeleteComment,
}) {
  const theme = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(comment);
  const textFieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditValue(comment);
  }, [comment]);

  useEffect(() => {
    if (isEditing && textFieldRef.current) {
      const input = textFieldRef.current.querySelector("input");
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }
  }, [isEditing]);

  const handleEdit = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleCancel = useCallback(() => {
    setEditValue(comment);
    setIsEditing(false);
  }, [comment]);

  const handleSave = useCallback(() => {
    if (editValue.trim() !== comment.trim()) {
      onUpdateComment(nodeId, editValue.trim());
    }
    setIsEditing(false);
  }, [nodeId, comment, editValue, onUpdateComment]);

  const handleDelete = useCallback(() => {
    onDeleteComment(nodeId);
  }, [nodeId, onDeleteComment]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSave();
      } else if (event.key === "Escape") {
        handleCancel();
      }
    },
    [handleSave, handleCancel]
  );

  const handleBlur = useCallback(() => {
    if (isEditing) {
      handleSave();
    }
  }, [isEditing, handleSave]);

  if (isEditing) {
    return (
      <Box css={commentStyles(theme)} className="comment-container">
        <Box className="comment-edit" ref={textFieldRef}>
          <TextField
            fullWidth
            multiline
            minRows={1}
            maxRows={4}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder="Add a comment..."
            variant="outlined"
            size="small"
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box css={commentStyles(theme)} className="comment-container">
      <Box className="comment-display">
        <CommentIcon className="comment-icon" />
        <Box className="comment-text">{comment}</Box>
        <Box className="comment-actions">
          <Tooltip title="Edit comment">
            <IconButton size="small" onClick={handleEdit}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete comment">
            <IconButton size="small" onClick={handleDelete} color="error">
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </Box>
  );
});

export default NodeComment;
