/** @jsxImportSource @emotion/react */
import { useCallback, useMemo, useState } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Divider,
  Paper,
  Chip
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Close";
import AddCommentIcon from "@mui/icons-material/AddComment";
import useCommentStore, { Comment } from "../../stores/CommentStore";
import { useNodes } from "../../contexts/NodeContext";
import { shallow } from "zustand/shallow";
import { formatDistanceToNow } from "date-fns";

interface CommentsPanelProps {
  onClose?: () => void;
}

const CommentsPanel: React.FC<CommentsPanelProps> = () => {
  const theme = useTheme<Theme>();
  const { comments, addComment, updateComment, deleteComment } =
    useCommentStore();
  const { nodes } = useNodes((state) => ({ nodes: state.nodes }), shallow);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [newCommentText, setNewCommentText] = useState("");

  const getNodeLabel = useCallback((nodeId: string | undefined): string => {
    if (!nodeId) {return "Workflow";}
    const node = nodes.find((n) => n.id === nodeId);
    return node?.data?.title || node?.type || nodeId;
  }, [nodes]);

  const workflowComments = useMemo(() =>
    comments.filter((c) => !c.nodeId),
    [comments]
  );

  const nodeComments = useMemo(() => {
    const result: Record<string, Comment[]> = {};
    comments.filter((c) => c.nodeId).forEach((comment) => {
      if (!result[comment.nodeId!]) {
        result[comment.nodeId!] = [];
      }
      result[comment.nodeId!].push(comment);
    });
    return result;
  }, [comments]);

  const handleAddComment = useCallback(() => {
    if (newCommentText.trim()) {
      addComment(undefined, newCommentText.trim());
      setNewCommentText("");
    }
  }, [newCommentText, addComment]);

  const handleStartEdit = useCallback((comment: Comment) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
  }, []);

  const handleSaveEdit = useCallback((commentId: string) => {
    if (editContent.trim()) {
      updateComment(commentId, editContent.trim());
    }
    setEditingId(null);
    setEditContent("");
  }, [editContent, updateComment]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditContent("");
  }, []);

  const handleDelete = useCallback((commentId: string) => {
    deleteComment(commentId);
  }, [deleteComment]);

  const styles = {
    container: {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column" as const,
      bgcolor: theme.vars.palette.background.default,
      overflow: "hidden"
    },
    header: {
      px: 2,
      py: 1.5,
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      bgcolor: theme.vars.palette.background.paper
    },
    title: {
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    content: {
      flex: 1,
      overflow: "auto",
      p: 2
    },
    section: {
      mb: 3
    },
    sectionTitle: {
      fontSize: "0.75rem",
      fontWeight: 600,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase" as const,
      letterSpacing: 0.5,
      mb: 1
    },
    commentCard: {
      p: 1.5,
      mb: 1,
      bgcolor: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: 1
    },
    commentHeader: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      mb: 0.5
    },
    commentMeta: {
      fontSize: "0.7rem",
      color: theme.vars.palette.text.secondary
    },
    commentText: {
      fontSize: "0.875rem",
      color: theme.vars.palette.text.primary,
      whiteSpace: "pre-wrap" as const,
      wordBreak: "break-word" as const
    },
    addSection: {
      mt: 2,
      p: 2,
      bgcolor: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: 1
    },
    nodeChip: {
      fontSize: "0.7rem",
      height: 20,
      bgcolor: theme.vars.palette.primary.light,
      color: theme.vars.palette.primary.contrastText
    }
  };

  const renderComment = (comment: Comment, isEditing: boolean) => (
    <Paper key={comment.id} sx={styles.commentCard} elevation={0}>
      <Box sx={styles.commentHeader}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="caption" sx={styles.commentMeta}>
            {comment.author}
          </Typography>
          <Typography variant="caption" sx={styles.commentMeta}>
            •
          </Typography>
          <Typography variant="caption" sx={styles.commentMeta}>
            {formatDistanceToNow(new Date(comment.updatedAt), { addSuffix: true })}
          </Typography>
          {comment.nodeId && (
            <Chip
              label={getNodeLabel(comment.nodeId)}
              size="small"
              sx={styles.nodeChip}
            />
          )}
        </Box>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          {!isEditing && (
            <IconButton
              size="small"
              onClick={() => handleStartEdit(comment)}
              sx={{ p: 0.5, width: 28, height: 28 }}
            >
              <EditIcon sx={{ fontSize: 14 }} />
            </IconButton>
          )}
          <IconButton
            size="small"
            onClick={() => handleDelete(comment.id)}
            sx={{ p: 0.5, width: 28, height: 28 }}
          >
            <DeleteIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
      </Box>
      {isEditing ? (
        <Box>
          <TextField
            fullWidth
            multiline
            size="small"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            variant="outlined"
            sx={{ mt: 1, mb: 1 }}
            autoFocus
          />
          <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
            <IconButton size="small" onClick={handleCancelEdit}>
              <CancelIcon sx={{ fontSize: 16 }} />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => handleSaveEdit(comment.id)}
              sx={{ color: theme.vars.palette.primary.main }}
            >
              <SaveIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
        </Box>
      ) : (
        <Typography variant="body2" sx={styles.commentText}>
          {comment.content}
        </Typography>
      )}
    </Paper>
  );

  return (
    <Box sx={styles.container}>
      <Box sx={styles.header}>
        <Typography variant="subtitle1" sx={styles.title}>
          Comments & Notes
        </Typography>
      </Box>

      <Box sx={styles.content}>
        {workflowComments.length > 0 && (
          <Box sx={styles.section}>
            <Typography variant="subtitle2" sx={styles.sectionTitle}>
              Workflow Comments
            </Typography>
            {workflowComments.map((comment) =>
              renderComment(comment, editingId === comment.id)
            )}
          </Box>
        )}

        {Object.keys(nodeComments).length > 0 && (
          <Box sx={styles.section}>
            <Typography variant="subtitle2" sx={styles.sectionTitle}>
              Node Comments
            </Typography>
            {Object.entries(nodeComments).map(([nodeId, nodeCommentsList]) => (
              <Box key={nodeId} sx={{ mb: 2 }}>
                <Typography
                  variant="caption"
                  sx={{
                    color: theme.vars.palette.text.secondary,
                    display: "block",
                    mb: 0.5
                  }}
                >
                  {getNodeLabel(nodeId)}
                </Typography>
                {nodeCommentsList.map((comment) =>
                  renderComment(comment, editingId === comment.id)
                )}
              </Box>
            ))}
            <Divider sx={{ mt: 2 }} />
          </Box>
        )}

        {workflowComments.length === 0 && Object.keys(nodeComments).length === 0 && (
          <Box
            sx={{
              textAlign: "center",
              py: 4,
              color: theme.vars.palette.text.secondary
            }}
          >
            <AddCommentIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
            <Typography variant="body2">No comments yet</Typography>
            <Typography variant="caption" sx={{ display: "block", mt: 0.5 }}>
              Add notes to document your workflow
            </Typography>
          </Box>
        )}

        <Box sx={styles.addSection}>
          <Typography variant="subtitle2" sx={styles.sectionTitle}>
            Add Comment
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={3}
            placeholder="Write your comment..."
            value={newCommentText}
            onChange={(e) => setNewCommentText(e.target.value)}
            variant="outlined"
            size="small"
            sx={{ mb: 1 }}
          />
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <Button
              variant="contained"
              size="small"
              onClick={handleAddComment}
              disabled={!newCommentText.trim()}
              startIcon={<AddCommentIcon />}
            >
              Add Comment
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default CommentsPanel;
