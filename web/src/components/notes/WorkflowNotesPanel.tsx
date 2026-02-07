/**
 * WorkflowNotesPanel Component
 *
 * Side panel for viewing and editing workflow documentation notes.
 * Users can add notes to document their workflows, similar to code comments.
 */

import React, { useCallback, useEffect, useMemo, memo } from "react";
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Tooltip,
  Alert
} from "@mui/material";
import {
  Delete as DeleteIcon,
  Info as InfoIcon
} from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import { useWorkflowNotesStore } from "../../stores/WorkflowNotesStore";
import PanelHeadline from "../ui/PanelHeadline";
import { CloseButton } from "../ui_primitives";

interface WorkflowNotesPanelProps {
  workflowId: string;
  onClose: () => void;
}

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString();
};

export const WorkflowNotesPanel: React.FC<WorkflowNotesPanelProps> = memo(
  function WorkflowNotesPanel({ workflowId, onClose }) {
    const theme = useTheme();
    const note = useWorkflowNotesStore((state) => state.getNote(workflowId));
    const setNote = useWorkflowNotesStore((state) => state.setNote);
    const deleteNote = useWorkflowNotesStore((state) => state.deleteNote);

    const [localContent, setLocalContent] = React.useState(note?.content || "");

    // Update local content when note changes from external source
    useEffect(() => {
      setLocalContent(note?.content || "");
    }, [note?.content]);

    const handleContentChange = useCallback(
      (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newContent = event.target.value;
        setLocalContent(newContent);
        setNote(workflowId, newContent);
      },
      [workflowId, setNote]
    );

    const handleDelete = useCallback(() => {
      deleteNote(workflowId);
      setLocalContent("");
    }, [workflowId, deleteNote]);

    const hasContent = useMemo(() => localContent.trim().length > 0, [localContent]);

    const characterCount = useMemo(() => localContent.length, [localContent]);
    const wordCount = useMemo(() => {
      return localContent.trim() === "" ? 0 : localContent.trim().split(/\s+/).length;
    }, [localContent]);

    return (
      <Box
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          backgroundColor: theme.vars.palette.background.default
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 2,
            py: 1,
            borderBottom: `1px solid ${theme.vars.palette.divider}`
          }}
        >
          <PanelHeadline title="Workflow Notes" />
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {note && (
              <Tooltip title="Delete note">
                <IconButton
                  size="small"
                  onClick={handleDelete}
                  aria-label="Delete note"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <CloseButton onClick={(e) => {
              e.stopPropagation();
              onClose();
            }} />
          </Box>
        </Box>

        {/* Content */}
        <Box
          sx={{
            flex: 1,
            overflow: "auto",
            p: 2
          }}
        >
          {/* Info Alert */}
          {!hasContent && (
            <Alert
              severity="info"
              icon={<InfoIcon fontSize="inherit" />}
              sx={{ mb: 2 }}
            >
              <Typography variant="body2">
                Add notes to document your workflow. Use this space to explain
                the workflow&apos;s purpose, important nodes, or any other relevant
                information.
              </Typography>
            </Alert>
          )}

          {/* Metadata */}
          {note && (
            <Box
              sx={{
                mb: 2,
                pb: 2,
                borderBottom: `1px solid ${theme.vars.palette.divider}`
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Created: {formatDate(note.createdAt)}
                {note.updatedAt !== note.createdAt && (
                  <> • Updated: {formatDate(note.updatedAt)}</>
                )}
              </Typography>
            </Box>
          )}

          {/* Text Editor */}
          <TextField
            multiline
            fullWidth
            placeholder="Add your workflow notes here..."
            value={localContent}
            onChange={handleContentChange}
            aria-label="Workflow notes content"
            sx={{
              "& .MuiInputBase-root": {
                height: "100%",
                alignItems: "flexStart"
              },
              "& .MuiInputBase-input": {
                height: "100% !important",
                overflow: "auto !important",
                fontFamily: theme.typography.fontFamily,
                fontSize: theme.typography.body1.fontSize,
                lineHeight: theme.typography.body1.lineHeight
              }
            }}
            InputProps={{
              sx: {
                height: "calc(100vh - 250px)",
                minHeight: "300px"
              }
            }}
          />

          {/* Stats Footer */}
          {hasContent && (
            <Box
              sx={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 2,
                mt: 1,
                pt: 1,
                borderTop: `1px solid ${theme.vars.palette.divider}`
              }}
            >
              <Typography variant="caption" color="text.secondary">
                {wordCount} {wordCount === 1 ? "word" : "words"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {characterCount} {characterCount === 1 ? "character" : "characters"}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    );
  }
);
