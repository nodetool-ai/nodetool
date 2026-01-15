/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useState, useMemo } from "react";
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Button,
  Tooltip,
  Paper,
  Divider
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Close";
import NotesIcon from "@mui/icons-material/Notes";
import { useWorkflowNotesStore, WorkflowNote } from "../../stores/WorkflowNotesStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const styles = (theme: Theme) =>
  css({
    "&.workflow-notes-panel": {
      position: "fixed",
      top: "80px",
      right: "50px",
      width: "360px",
      maxHeight: "calc(100vh - 150px)",
      zIndex: 15000,
      display: "flex",
      flexDirection: "column",
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "12px",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
      border: `1px solid ${theme.vars.palette.divider}`,
      overflow: "hidden",
      animation: "slideIn 0.2s ease-out forwards",
      "@keyframes slideIn": {
        "0%": { opacity: 0, transform: "translateX(20px)" },
        "100%": { opacity: 1, transform: "translateX(0)" }
      }
    },
    "& .panel-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.default
    },
    "& .panel-title": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      fontSize: "14px",
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    "& .panel-content": {
      flex: 1,
      overflowY: "auto",
      padding: "12px 16px"
    },
    "& .workflow-name": {
      fontSize: "12px",
      fontWeight: 500,
      color: theme.vars.palette.text.secondary,
      marginBottom: "12px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    "& .notes-list": {
      display: "flex",
      flexDirection: "column",
      gap: "12px"
    },
    "& .note-card": {
      padding: "12px",
      borderRadius: "8px",
      backgroundColor: theme.vars.palette.background.default,
      border: `1px solid ${theme.vars.palette.divider}`,
      transition: "all 0.2s ease",
      "&:hover": {
        borderColor: theme.vars.palette.primary.main,
        boxShadow: `0 2px 8px ${theme.vars.palette.primary.main}20`
      }
    },
    "& .note-content": {
      fontSize: "13px",
      color: theme.vars.palette.text.primary,
      lineHeight: 1.5,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word"
    },
    "& .note-meta": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: "8px",
      fontSize: "11px",
      color: theme.vars.palette.text.secondary
    },
    "& .note-actions": {
      display: "flex",
      gap: "4px",
      opacity: 0,
      transition: "opacity 0.2s ease",
      "&:hover": {
        opacity: 1
      }
    },
    "& .note-card:hover .note-actions": {
      opacity: 1
    },
    "& .add-note-section": {
      marginTop: "16px",
      paddingTop: "16px",
      borderTop: `1px solid ${theme.vars.palette.divider}`
    },
    "& .add-note-textarea": {
      width: "100%",
      minHeight: "80px",
      "& .MuiInputBase-input": {
        fontSize: "13px",
        lineHeight: 1.5
      }
    },
    "& .add-note-actions": {
      display: "flex",
      justifyContent: "flex-end",
      gap: "8px",
      marginTop: "8px"
    },
    "& .empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      color: theme.vars.palette.text.secondary,
      textAlign: "center"
    },
    "& .empty-state-icon": {
      fontSize: "48px",
      marginBottom: "12px",
      opacity: 0.5
    },
    "& .empty-state-text": {
      fontSize: "13px",
      marginBottom: "8px"
    },
    "& .empty-state-hint": {
      fontSize: "11px",
      opacity: 0.7
    }
  });

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return "Just now";
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString();
  }
};

interface WorkflowNotesPanelProps {
  onClose: () => void;
}

export const WorkflowNotesPanel: React.FC<WorkflowNotesPanelProps> = memo(
  function WorkflowNotesPanel({ onClose }) {
    const theme = useTheme();
    const currentWorkflow = useWorkflowManager((state) => state.getCurrentWorkflow());
    const workflowId = currentWorkflow?.id || null;

    const {
      notesByWorkflow,
      addNote,
      updateNote,
      deleteNote
    } = useWorkflowNotesStore();

    const notes = useMemo(() => {
      if (!workflowId) {
        return [];
      }
      return notesByWorkflow[workflowId] || [];
    }, [workflowId, notesByWorkflow]);

    const [newNoteContent, setNewNoteContent] = useState("");
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [editingContent, setEditingContent] = useState("");

    const handleAddNote = useCallback(() => {
      if (!workflowId || !newNoteContent.trim()) {
        return;
      }
      addNote(workflowId, newNoteContent);
      setNewNoteContent("");
    }, [workflowId, newNoteContent, addNote]);

    const handleStartEdit = useCallback((note: WorkflowNote) => {
      setEditingNoteId(note.id);
      setEditingContent(note.content);
    }, []);

    const handleSaveEdit = useCallback(
      (noteId: string) => {
        if (!workflowId || !editingContent.trim()) {
          return;
        }
        updateNote(workflowId, noteId, editingContent);
        setEditingNoteId(null);
        setEditingContent("");
      },
      [workflowId, editingContent, updateNote]
    );

    const handleCancelEdit = useCallback(() => {
      setEditingNoteId(null);
      setEditingContent("");
    }, []);

    const handleDelete = useCallback(
      (noteId: string) => {
        if (!workflowId) {
          return;
        }
        deleteNote(workflowId, noteId);
      },
      [workflowId, deleteNote]
    );

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          handleAddNote();
        }
      },
      [handleAddNote]
    );

    if (!workflowId) {
      return null;
    }

    return (
      <Box className="workflow-notes-panel" css={styles(theme)}>
        <Box className="panel-header">
          <Box className="panel-title">
            <NotesIcon fontSize="small" />
            <Typography variant="subtitle2">Workflow Notes</Typography>
          </Box>
          <Tooltip
            title="Close"
            placement="left-start"
            enterDelay={TOOLTIP_ENTER_DELAY}
          >
            <IconButton size="small" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <Box className="panel-content">
          {currentWorkflow && (
            <Typography className="workflow-name">
              {currentWorkflow.name || "Untitled Workflow"}
            </Typography>
          )}

          {notes.length === 0 ? (
            <Box className="empty-state">
              <NotesIcon className="empty-state-icon" />
              <Typography className="empty-state-text">
                No notes yet
              </Typography>
              <Typography className="empty-state-hint">
                Add notes to document your workflow
              </Typography>
            </Box>
          ) : (
            <Box className="notes-list">
              {notes.map((note) => (
                <Paper
                  key={note.id}
                  className="note-card"
                  elevation={0}
                  sx={{ bgcolor: "background.default" }}
                >
                  {editingNoteId === note.id ? (
                    <Box>
                      <TextField
                        className="add-note-textarea"
                        multiline
                        fullWidth
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        placeholder="Edit note..."
                        variant="outlined"
                        size="small"
                        autoFocus
                      />
                      <Box className="add-note-actions">
                        <Tooltip title="Cancel">
                          <IconButton
                            size="small"
                            onClick={handleCancelEdit}
                          >
                            <CancelIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Save">
                          <IconButton
                            size="small"
                            onClick={() => handleSaveEdit(note.id)}
                            color="primary"
                          >
                            <SaveIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>
                  ) : (
                    <>
                      <Typography className="note-content">
                        {note.content}
                      </Typography>
                      <Box className="note-meta">
                        <Typography variant="caption">
                          {formatDate(note.updatedAt)}
                        </Typography>
                        <Box className="note-actions">
                          <Tooltip title="Edit">
                            <IconButton
                              size="small"
                              onClick={() => handleStartEdit(note)}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              onClick={() => handleDelete(note.id)}
                              color="error"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>
                    </>
                  )}
                </Paper>
              ))}
            </Box>
          )}

          <Box className="add-note-section">
            <TextField
              className="add-note-textarea"
              multiline
              fullWidth
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a note... (Enter to save, Shift+Enter for new line)"
              variant="outlined"
              size="small"
              maxRows={4}
            />
            <Box className="add-note-actions">
              <Button
                variant="contained"
                size="small"
                startIcon={<AddIcon />}
                onClick={handleAddNote}
                disabled={!newNoteContent.trim()}
              >
                Add Note
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>
    );
  }
);

export default WorkflowNotesPanel;
