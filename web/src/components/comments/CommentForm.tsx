/**
 * CommentForm - Form for adding new workflow comments.
 */

import React, { useCallback, useState } from "react";
import { Box, TextField, IconButton, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useWorkflowCommentStore } from "../../stores/WorkflowCommentStore";
import SendIcon from "@mui/icons-material/Send";
import useAuthStore from "../../stores/useAuth";

interface CommentFormProps {
  workflowId: string;
  nodeId?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

const CommentForm: React.FC<CommentFormProps> = ({
  workflowId,
  nodeId,
  placeholder = "Add a comment...",
  autoFocus = false
}) => {
  const theme = useTheme();
  const addComment = useWorkflowCommentStore((state) => state.addComment);
  const user = useAuthStore((state) => state.user);

  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get author from user object (use email as fallback for username)
  const getAuthorName = useCallback((): string => {
    if (!user) {
      return "";
    }
    // Check if user has email property (from Supabase User)
    if ("email" in user && user.email) {
      return user.email;
    }
    // Fallback to ID
    return user.id;
  }, [user]);

  const handleSubmit = useCallback(async () => {
    const trimmedContent = content.trim();

    if (!trimmedContent || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      addComment({
        workflowId,
        content: trimmedContent,
        author: getAuthorName(), // Empty string will be replaced with "Anonymous"
        isResolved: false,
        nodeId
      });

      setContent("");
    } catch (error) {
      console.error("Failed to add comment:", error);
    } finally {
      setIsSubmitting(false);
    }
  }, [content, isSubmitting, workflowId, addComment, getAuthorName, nodeId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Submit on Ctrl/Cmd + Enter, allow Shift + Enter for new lines
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const canSubmit = content.trim().length > 0 && !isSubmitting;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1
      }}
    >
      <TextField
        multiline
        maxRows={4}
        placeholder={placeholder}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus={autoFocus}
        disabled={isSubmitting}
        fullWidth
        size="small"
        sx={{
          "& .MuiInputBase-root": {
            fontSize: "0.875rem"
          }
        }}
      />

      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Ctrl + Enter to send
        </Typography>

        <IconButton
          color="primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
          size="small"
          sx={{
            backgroundColor: canSubmit
              ? theme.vars.palette.primary.main + "20"
              : "transparent",
            "&:hover": canSubmit
              ? {
                  backgroundColor: theme.vars.palette.primary.main + "30"
                }
              : {},
            "&.Mui-disabled": {
              opacity: 0.5
            }
          }}
        >
          <SendIcon
            sx={{
              fontSize: 20,
              color: canSubmit
                ? theme.vars.palette.primary.main
                : theme.vars.palette.text.secondary
            }}
          />
        </IconButton>
      </Box>
    </Box>
  );
};

export default CommentForm;
