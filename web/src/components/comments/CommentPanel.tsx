/**
 * CommentPanel - Main panel for displaying and managing workflow comments.
 */

import React, { useCallback, useMemo } from "react";
import { Box, Typography, Stack } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useWorkflowCommentStore } from "../../stores/WorkflowCommentStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import CommentForm from "./CommentForm";
import CommentItem from "./CommentItem";
import FormatSizeIcon from "@mui/icons-material/FormatSize";

/**
 * Filter options for comments display.
 */
type CommentFilter = "all" | "open" | "resolved";

interface CommentPanelProps {
  onEditComment?: (commentId: string) => void;
}

const CommentPanel: React.FC<CommentPanelProps> = ({ onEditComment }) => {
  const theme = useTheme();
  const currentWorkflowId = useWorkflowManager((state) => state.currentWorkflowId);
  const workflowId = currentWorkflowId || "";

  const [filter, setFilter] = React.useState<CommentFilter>("all");
  const comments = useWorkflowCommentStore((state) => state.getWorkflowComments(workflowId));
  const selectComment = useWorkflowCommentStore((state) => state.selectComment);

  // Filter comments based on selected filter
  const filteredComments = useMemo(() => {
    switch (filter) {
      case "open":
        return comments.filter((c) => !c.isResolved);
      case "resolved":
        return comments.filter((c) => c.isResolved);
      default:
        return comments;
    }
  }, [comments, filter]);

  // Sort by creation date (newest first)
  const sortedComments = useMemo(() => {
    return [...filteredComments].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [filteredComments]);

  const handleFilterChange = useCallback((newFilter: CommentFilter) => {
    setFilter(newFilter);
  }, []);

  const handleSelectComment = useCallback((commentId: string) => {
    selectComment(commentId);
    onEditComment?.(commentId);
  }, [selectComment, onEditComment]);

  const commentCount = comments.length;
  const resolvedCount = comments.filter((c) => c.isResolved).length;
  const openCount = commentCount - resolvedCount;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: theme.vars.palette.background.default
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <Typography variant="h6">Comments</Typography>
        <Typography variant="caption" color="text.secondary">
          {openCount} open, {resolvedCount} resolved
        </Typography>
      </Box>

      {/* Filter Buttons */}
      <Box
        sx={{
          px: 2,
          py: 1,
          display: "flex",
          gap: 1,
          borderBottom: `1px solid ${theme.vars.palette.divider}`
        }}
      >
        <FilterButton
          label="All"
          count={commentCount}
          active={filter === "all"}
          onClick={() => handleFilterChange("all")}
        />
        <FilterButton
          label="Open"
          count={openCount}
          active={filter === "open"}
          onClick={() => handleFilterChange("open")}
        />
        <FilterButton
          label="Resolved"
          count={resolvedCount}
          active={filter === "resolved"}
          onClick={() => handleFilterChange("resolved")}
        />
      </Box>

      {/* Comments List */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          p: 2
        }}
      >
        {sortedComments.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <Stack spacing={2}>
            {sortedComments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                onSelect={handleSelectComment}
              />
            ))}
          </Stack>
        )}
      </Box>

      {/* Add Comment Form */}
      <Box
        sx={{
          p: 2,
          borderTop: `1px solid ${theme.vars.palette.divider}`
        }}
      >
        <CommentForm workflowId={workflowId} />
      </Box>
    </Box>
  );
};

interface FilterButtonProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

const FilterButton: React.FC<FilterButtonProps> = ({ label, count, active, onClick }) => {
  const theme = useTheme();

  return (
    <Box
      onClick={onClick}
      sx={{
        px: 2,
        py: 0.75,
        borderRadius: 1.5,
        fontSize: "0.875rem",
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 0.2s",
        backgroundColor: active
          ? theme.vars.palette.primary.main + "20"
          : "transparent",
        color: active
          ? theme.vars.palette.primary.main
          : theme.vars.palette.text.secondary,
        border: active
          ? `1px solid ${theme.vars.palette.primary.main}`
          : `1px solid ${theme.vars.palette.divider}`,
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        "&:hover": {
          backgroundColor: active
            ? theme.vars.palette.primary.main + "30"
            : theme.vars.palette.action.hover
        }
      }}
    >
      {label}
      <Box
        sx={{
          px: 1,
          py: 0.25,
          borderRadius: 1,
          backgroundColor: active
            ? theme.vars.palette.background.paper
            : theme.vars.palette.divider,
          fontSize: "0.75rem"
        }}
      >
        {count}
      </Box>
    </Box>
  );
};

interface EmptyStateProps {
  filter: CommentFilter;
}

const EmptyState: React.FC<EmptyStateProps> = ({ filter }) => {
  const theme = useTheme();

  let message = "No comments yet.";
  let subtext = "Add a comment to start the discussion.";

  if (filter === "open") {
    message = "No open comments.";
    subtext = "All comments have been resolved.";
  } else if (filter === "resolved") {
    message = "No resolved comments.";
    subtext = "Resolved comments will appear here.";
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        textAlign: "center",
        color: theme.vars.palette.text.secondary
      }}
    >
      <FormatSizeIcon
        sx={{
          fontSize: 48,
          mb: 2,
          opacity: 0.3
        }}
      />
      <Typography variant="body1" sx={{ mb: 0.5 }}>
        {message}
      </Typography>
      <Typography variant="caption">{subtext}</Typography>
    </Box>
  );
};

export default CommentPanel;
