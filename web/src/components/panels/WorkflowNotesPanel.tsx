/**
 * WorkflowNotesPanel
 *
 * Rich text notes panel for documenting workflows.
 * Provides markdown editing with live preview and automatic save.
 *
 * Features:
 * - Markdown editor with syntax highlighting
 * - Live preview of formatted content
 * - Auto-save to localStorage
 * - Word count and character count
 * - Last saved timestamp
 * - Clear notes button
 *
 * @example
 * ```typescript
 * import { WorkflowNotesPanel } from './WorkflowNotesPanel';
 *
 * <WorkflowNotesPanel workflowId="workflow-123" />
 * ```
 */

import { memo, useCallback, useEffect, useState } from "react";
import { Box, Typography, TextField, IconButton, Divider, Stack } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ClearIcon from "@mui/icons-material/DeleteOutline";
import SaveIcon from "@mui/icons-material/Save";
import EditIcon from "@mui/icons-material/Edit";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { useWorkflowNotesStore } from "../../stores/WorkflowNotesStore";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatDistanceToNow } from "date-fns";

interface WorkflowNotesPanelProps {
  workflowId: string;
  onClose?: () => void;
}

const WorkflowNotesPanel = memo(function WorkflowNotesPanel({
  workflowId,
  onClose: _onClose
}: WorkflowNotesPanelProps) {
  const theme = useTheme();
  const getNotes = useWorkflowNotesStore((state) => state.getNotes);
  const updateNotes = useWorkflowNotesStore((state) => state.updateNotes);
  const deleteNotes = useWorkflowNotesStore((state) => state.deleteNotes);
  const hasNotes = useWorkflowNotesStore((state) => state.hasNotes);

  const [content, setContent] = useState<string>(() => getNotes(workflowId) ?? "");
  const [isEditing, setIsEditing] = useState(true);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");

  // Load notes when workflowId changes
  useEffect(() => {
    const notes = getNotes(workflowId);
    if (notes !== null) {
      setContent(notes);
    } else {
      setContent("");
    }
  }, [workflowId, getNotes]);

  // Auto-save with debounce
  useEffect(() => {
    if (saveStatus === "unsaved") {
      const timer = setTimeout(() => {
        setSaveStatus("saving");
        updateNotes(workflowId, content);
        setLastSaved(Date.now());
        setSaveStatus("saved");
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [content, workflowId, updateNotes, saveStatus]);

  const handleContentChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(event.target.value);
    setSaveStatus("unsaved");
  }, []);

  const handleClearNotes = useCallback(() => {
    // Using native confirm for simplicity. In production, consider using a custom dialog.
    if (window.confirm("Are you sure you want to clear all notes? This cannot be undone.")) {
      setContent("");
      deleteNotes(workflowId);
      setLastSaved(Date.now());
    }
  }, [workflowId, deleteNotes]);

  const handleToggleView = useCallback(() => {
    setIsEditing((prev) => !prev);
  }, []);

  const wordCount = content.trim().split(/\s+/).filter((word) => word.length > 0).length;
  const charCount = content.length;
  const hasLocalNotes = hasNotes(workflowId);

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
        <Typography variant="h6" component="h2">
          Workflow Notes
        </Typography>
        <Stack direction="row" spacing={0.5}>
          {hasLocalNotes && (
            <IconButton
              size="small"
              onClick={handleToggleView}
              title={isEditing ? "Preview" : "Edit"}
              sx={{ color: "text.secondary" }}
            >
              {isEditing ? <VisibilityIcon /> : <EditIcon />}
            </IconButton>
          )}
          <IconButton
            size="small"
            onClick={handleClearNotes}
            disabled={!hasLocalNotes}
            title="Clear notes"
            sx={{ color: "text.secondary" }}
          >
            <ClearIcon />
          </IconButton>
        </Stack>
      </Box>

      {/* Content */}
      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          p: 2
        }}
      >
        {isEditing ? (
          <TextField
            multiline
            fullWidth
            value={content}
            onChange={handleContentChange}
            placeholder="# Workflow Notes&#10;&#10;Add your notes, documentation, and ideas here.&#10;&#10;## Tips&#10;- Use **markdown** for formatting&#10;- Notes are auto-saved&#10;- Toggle preview to see formatted output"
            sx={{
              "& .MuiInputBase-root": {
                height: "100%",
                alignItems: "flex-start"
              },
              "& .MuiInputBase-input": {
                fontSize: "0.875rem",
                lineHeight: 1.6,
                fontFamily: "'JetBrains Mono', monospace"
              }
            }}
            InputProps={{
              sx: {
                height: "100%",
                "& textarea": {
                  resize: "none"
                }
              }
            }}
          />
        ) : (
          <Box
            sx={{
              "& .markdown-content": {
                fontSize: "0.875rem",
                lineHeight: 1.6,
                color: theme.vars.palette.text.primary,
                "& h1, & h2, & h3, & h4, & h5, & h6": {
                  mt: 2,
                  mb: 1,
                  fontWeight: 600
                },
                "& h1": { fontSize: "1.5rem" },
                "& h2": { fontSize: "1.25rem" },
                "& h3": { fontSize: "1.1rem" },
                "& p": { mb: 1 },
                "& ul, & ol": { ml: 2, mb: 1 },
                "& li": { mb: 0.5 },
                "& code": {
                  backgroundColor: theme.vars.palette.action.selected,
                  px: 0.5,
                  py: 0.25,
                  borderRadius: 0.25,
                  fontSize: "0.875em",
                  fontFamily: "'JetBrains Mono', monospace"
                },
                "& pre": {
                  backgroundColor: theme.vars.palette.action.selected,
                  p: 1,
                  borderRadius: 1,
                  overflow: "auto",
                  mb: 1,
                  "& code": {
                    backgroundColor: "transparent",
                    p: 0
                  }
                },
                "& blockquote": {
                  borderLeft: `3px solid ${theme.vars.palette.primary.main}`,
                  pl: 1.5,
                  ml: 0,
                  fontStyle: "italic",
                  color: theme.vars.palette.text.secondary
                },
                "& a": {
                  color: theme.vars.palette.primary.main,
                  textDecoration: "none",
                  "&:hover": {
                    textDecoration: "underline"
                  }
                }
              }
            }}
          >
            <div className="markdown-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
              >
                {content || "*No notes yet. Click edit to add documentation.*"}
              </ReactMarkdown>
            </div>
          </Box>
        )}
      </Box>

      {/* Footer */}
      <Box
        sx={{
          px: 2,
          py: 1,
          borderTop: `1px solid ${theme.vars.palette.divider}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: theme.vars.palette.background.paper
        }}
      >
        <Stack direction="row" spacing={2} alignItems="center">
          {saveStatus === "saving" && (
            <Typography variant="caption" color="text.secondary">
              Saving...
            </Typography>
          )}
          {saveStatus === "saved" && lastSaved && (
            <Typography variant="caption" color="text.secondary">
              <SaveIcon sx={{ fontSize: 12, mr: 0.5, verticalAlign: "middle" }} />
              Saved {formatDistanceToNow(lastSaved, { addSuffix: true })}
            </Typography>
          )}
          <Divider orientation="vertical" flexItem />
          <Typography variant="caption" color="text.secondary">
            {wordCount} words
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {charCount} characters
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
});

export default WorkflowNotesPanel;
