/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useState } from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import CloseIcon from "@mui/icons-material/Close";
import CommentIcon from "@mui/icons-material/Comment";
import { useTheme } from "@mui/material/styles";

interface NodeCommentProps {
  _nodeId: string;
  comment?: string;
  onUpdateComment: (comment: string) => void;
}

export const NodeComment: React.FC<NodeCommentProps> = memo(function NodeComment({
  _nodeId,
  comment,
  onUpdateComment
}: NodeCommentProps) {
  const theme = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(comment || "");

  const handleEdit = useCallback(() => {
    setEditValue(comment || "");
    setIsEditing(true);
  }, [comment]);

  const handleCancel = useCallback(() => {
    setEditValue(comment || "");
    setIsEditing(false);
  }, [comment]);

  const handleSave = useCallback(() => {
    onUpdateComment(editValue);
    setIsEditing(false);
  }, [editValue, onUpdateComment]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  }, [handleSave, handleCancel]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditValue(e.target.value);
  }, []);

  const handleDelete = useCallback(() => {
    onUpdateComment("");
    setIsEditing(false);
  }, [onUpdateComment]);

  if (isEditing) {
    return (
      <Box
        css={css({
          padding: "8px 12px",
          backgroundColor: theme.vars.palette.action.hover,
          borderTop: `1px solid ${theme.vars.palette.divider}`,
          display: "flex",
          flexDirection: "column",
          gap: "8px"
        })}
      >
        <Box
          css={css({
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          })}
        >
          <Box
            css={css({
              display: "flex",
              alignItems: "center",
              gap: "4px",
              color: theme.vars.palette.text.secondary,
              fontSize: "0.7rem",
              fontWeight: 500,
              textTransform: "uppercase"
            })}
          >
            <CommentIcon sx={{ fontSize: 14 }} />
            Comment
          </Box>
          <Box css={css({ display: "flex", gap: "4px" })}>
            {editValue && (
              <Tooltip title="Delete comment">
                <IconButton size="small" onClick={handleDelete} sx={{ p: 0.5 }}>
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Cancel (Esc)">
              <IconButton size="small" onClick={handleCancel} sx={{ p: 0.5 }}>
                <CloseIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
        <textarea
          value={editValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Add a comment to document this node..."
          autoFocus
          css={css({
            width: "100%",
            minHeight: "60px",
            maxHeight: "120px",
            padding: "8px",
            fontSize: "0.8rem",
            fontFamily: "inherit",
            border: `1px solid ${theme.vars.palette.divider}`,
            borderRadius: "4px",
            backgroundColor: theme.vars.palette.background.paper,
            color: theme.vars.palette.text.primary,
            resize: "vertical",
            outline: "none",
            "&:focus": {
              borderColor: theme.vars.palette.primary.main
            },
            "&::placeholder": {
              color: theme.vars.palette.text.disabled
            }
          })}
        />
      </Box>
    );
  }

  if (!comment) {
    return null;
  }

  return (
    <Box
      css={css({
        padding: "8px 12px",
        backgroundColor: theme.vars.palette.action.hover,
        borderTop: `1px solid ${theme.vars.palette.divider}`,
        cursor: "pointer",
        transition: "background-color 0.2s",
        "&:hover": {
          backgroundColor: theme.vars.palette.action.selected
        }
      })}
      onClick={handleEdit}
    >
      <Box
        css={css({
          display: "flex",
          alignItems: "flex-start",
          gap: "6px"
        })}
      >
        <CommentIcon
          sx={{
            fontSize: 14,
            color: theme.vars.palette.text.secondary,
            mt: 0.5,
            flexShrink: 0
          }}
        />
        <Box
          css={css({
            flex: 1,
            fontSize: "0.8rem",
            color: theme.vars.palette.text.secondary,
            wordBreak: "break-word",
            lineHeight: 1.4,
            fontStyle: "italic"
          })}
        >
          {comment}
        </Box>
        <Tooltip title="Edit comment">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit();
            }}
            sx={{
              p: 0.25,
              opacity: 0,
              transition: "opacity 0.2s",
              flexShrink: 0,
              ".node-body:hover &": {
                opacity: 1
              }
            }}
          >
            <EditIcon sx={{ fontSize: 12 }} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
});
