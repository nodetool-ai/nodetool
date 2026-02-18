/**
 * CommentItem - Displays a single workflow comment with actions.
 */

import React, { useCallback, useMemo } from "react";
import {
  Box,
  Typography,
  Stack,
  IconButton,
  Tooltip,
  Chip
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useWorkflowCommentStore } from "../../stores/WorkflowCommentStore";
import type { WorkflowComment } from "../../stores/WorkflowCommentStore";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import PersonIcon from "@mui/icons-material/Person";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

interface CommentItemProps {
  comment: WorkflowComment;
  onSelect?: (commentId: string) => void;
}

const CommentItem: React.FC<CommentItemProps> = ({ comment, onSelect }) => {
  const theme = useTheme();
  const toggleCommentResolved = useWorkflowCommentStore((state) => state.toggleCommentResolved);
  const deleteComment = useWorkflowCommentStore((state) => state.deleteComment);

  const handleToggleResolved = useCallback(() => {
    toggleCommentResolved(comment.id);
  }, [comment.id, toggleCommentResolved]);

  const handleDelete = useCallback(() => {
    // eslint-disable-next-line no-alert
    if (window.confirm("Are you sure you want to delete this comment?")) {
      deleteComment(comment.id);
    }
  }, [comment.id, deleteComment]);

  const handleEdit = useCallback(() => {
    onSelect?.(comment.id);
  }, [comment.id, onSelect]);

  const formattedDate = useMemo(() => {
    return new Date(comment.createdAt).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }, [comment.createdAt]);

  const formattedUpdatedDate = useMemo(() => {
    const updated = new Date(comment.updatedAt);
    const created = new Date(comment.createdAt);
    const wasEdited = updated.getTime() - created.getTime() > 1000; // More than 1 second difference

    if (!wasEdited) {
      return null;
    }

    return `edited ${updated.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })}`;
  }, [comment.createdAt, comment.updatedAt]);

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        backgroundColor: comment.isResolved
          ? theme.vars.palette.action.hover
          : theme.vars.palette.background.paper,
        border: `1px solid ${theme.vars.palette.divider}`,
        transition: "all 0.2s",
        "&:hover": {
          borderColor: theme.vars.palette.primary.main,
          boxShadow: theme.shadows[2]
        },
        opacity: comment.isResolved ? 0.7 : 1
      }}
    >
      {/* Header: Author and Actions */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1
        }}
      >
        {/* Author info */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <PersonIcon
            sx={{
              fontSize: 18,
              color: theme.vars.palette.text.secondary
            }}
          />
          <Typography variant="subtitle2" fontWeight={600}>
            {comment.author}
          </Typography>
          {comment.isResolved && (
            <Chip
              label="Resolved"
              size="small"
              icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
              sx={{
                height: 20,
                fontSize: "0.7rem",
                backgroundColor: theme.vars.palette.success.main + "20",
                color: theme.vars.palette.success.main
              }}
            />
          )}
        </Box>

        {/* Action buttons */}
        <Stack direction="row" spacing={0.5}>
          <Tooltip title={comment.isResolved ? "Reopen comment" : "Mark as resolved"}>
            <IconButton
              size="small"
              onClick={handleToggleResolved}
              sx={{
                color: comment.isResolved
                  ? theme.vars.palette.success.main
                  : theme.vars.palette.text.secondary
              }}
            >
              {comment.isResolved ? (
                <CheckCircleIcon sx={{ fontSize: 18 }} />
              ) : (
                <CheckCircleOutlineIcon sx={{ fontSize: 18 }} />
              )}
            </IconButton>
          </Tooltip>

          <Tooltip title="Edit comment">
            <IconButton size="small" onClick={handleEdit}>
              <EditIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Delete comment">
            <IconButton size="small" onClick={handleDelete}>
              <DeleteIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {/* Content */}
      <Typography
        variant="body2"
        sx={{
          mb: 1.5,
          wordBreak: "break-word",
          whiteSpace: "pre-wrap",
          color: comment.isResolved
            ? theme.vars.palette.text.secondary
            : theme.vars.palette.text.primary
        }}
      >
        {comment.content}
      </Typography>

      {/* Metadata */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          fontSize: "0.75rem",
          color: theme.vars.palette.text.secondary
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
          <AccessTimeIcon sx={{ fontSize: 14 }} />
          <Typography variant="caption">{formattedDate}</Typography>
        </Box>
        {formattedUpdatedDate && (
          <Typography variant="caption">• {formattedUpdatedDate}</Typography>
        )}
        {comment.nodeId && (
          <>
            <Typography variant="caption">•</Typography>
            <Typography variant="caption">Linked to node</Typography>
          </>
        )}
      </Box>
    </Box>
  );
};

export default CommentItem;
