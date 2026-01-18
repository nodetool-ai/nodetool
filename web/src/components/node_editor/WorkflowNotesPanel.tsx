/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useCallback, useMemo, useState } from "react";
import { Box, TextField, Typography, IconButton, Tooltip } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import NotesIcon from "@mui/icons-material/Notes";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useWorkflowNotesStore } from "../../stores/WorkflowNotesStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

const containerStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    boxSizing: "border-box",
    backgroundColor: theme.vars.palette.background.paper,
    ".notes-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: theme.spacing(1.5, 2),
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      minHeight: 48
    },
    ".header-title": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      "& .MuiTypography-root": {
        fontSize: theme.fontSizeSmall,
        fontWeight: 600,
        color: theme.vars.palette.text.secondary,
        textTransform: "uppercase",
        letterSpacing: "0.5px"
      }
    },
    ".notes-content": {
      flex: 1,
      padding: theme.spacing(2),
      overflow: "auto"
    },
    ".notes-textfield": {
      width: "100%",
      height: "100%",
      "& .MuiOutlinedInput-root": {
        height: "100%",
        backgroundColor: theme.vars.palette.grey[900],
        borderRadius: 8,
        "& .MuiOutlinedInput-input": {
          height: "100%",
          padding: theme.spacing(2),
          fontFamily: theme.fontFamily2,
          fontSize: theme.fontSizeSmall,
          lineHeight: 1.6,
          resize: "none"
        },
        "& .MuiOutlinedInput-notchedOutline": {
          borderColor: theme.vars.palette.grey[700]
        },
        "&:hover .MuiOutlinedInput-notchedOutline": {
          borderColor: theme.vars.palette.grey[600]
        },
        "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
          borderColor: "var(--palette-primary-main)"
        }
      }
    },
    ".empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      color: theme.vars.palette.text.secondary,
      textAlign: "center",
      padding: theme.spacing(4),
      "& .MuiTypography-root": {
        marginTop: theme.spacing(2),
        fontSize: theme.fontSizeSmall
      },
      "& .MuiSvgIcon-root": {
        fontSize: 48,
        opacity: 0.4
      }
    },
    ".actions": {
      display: "flex",
      gap: theme.spacing(1),
      padding: theme.spacing(1, 2),
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      justifyContent: "flex-end"
    },
    ".clear-button": {
      fontSize: theme.fontSizeSmall,
      textTransform: "none",
      color: theme.vars.palette.text.secondary,
      "&:hover": {
        color: theme.vars.palette.error.main,
        backgroundColor: `${theme.vars.palette.error.main}22`
      }
    }
  });

interface WorkflowNotesPanelProps {
  workflowId: string;
  onClose?: () => void;
}

const WorkflowNotesPanel: React.FC<WorkflowNotesPanelProps> = ({
  workflowId,
  onClose
}) => {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => containerStyles(theme), [theme]);

  const [localContent, setLocalContent] = useState<string>("");
  const [hasChanges, setHasChanges] = useState(false);

  const { getNotes, setNotes, clearNotes } = useWorkflowNotesStore(
    (state) => ({
      getNotes: state.getNotes,
      setNotes: state.setNotes,
      clearNotes: state.clearNotes
    })
  );

  const workflow = useWorkflowManager((state) =>
    state.openWorkflows.find((w) => w.id === workflowId)
  );

  const savedNotes = useMemo(
    () => getNotes(workflowId),
    [workflowId, getNotes]
  );

  const handleNotesChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.target.value;
      setLocalContent(value);
      setHasChanges(true);
    },
    []
  );

  const _handleSave = useCallback(() => {
    if (hasChanges) {
      setNotes(workflowId, localContent);
      setHasChanges(false);
    }
  }, [workflowId, localContent, hasChanges, setNotes]);

  const handleClear = useCallback(() => {
    setLocalContent("");
    setHasChanges(true);
    clearNotes(workflowId);
  }, [workflowId, clearNotes]);

  const handleClose = useCallback(() => {
    if (hasChanges) {
      setNotes(workflowId, localContent);
    }
    onClose?.();
  }, [workflowId, localContent, hasChanges, onClose, setNotes]);

  const displayContent = useMemo(() => {
    if (localContent !== "") {
      return localContent;
    }
    return savedNotes;
  }, [localContent, savedNotes]);

  if (!workflow) {
    return null;
  }

  return (
    <Box css={memoizedStyles}>
      <Box className="notes-header">
        <Box className="header-title">
          <NotesIcon
            fontSize="small"
            sx={{ color: "var(--palette-primary-main)" }}
          />
          <Typography>Notes: {workflow.name}</Typography>
        </Box>
        <Tooltip title="Close notes">
          <IconButton size="small" onClick={handleClose} aria-label="Close notes">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Box className="notes-content">
        {workflow ? (
          <TextField
            className="notes-textfield"
            multiline
            fullWidth
            placeholder="Add notes about this workflow... (Markdown supported)"
            value={displayContent}
            onChange={handleNotesChange}
            variant="outlined"
          />
        ) : (
          <Box className="empty-state">
            <NotesIcon />
            <Typography>
              Select a workflow to view or edit notes
            </Typography>
          </Box>
        )}
      </Box>

      {workflow && (
        <Box className="actions">
          <Tooltip title="Clear all notes">
            <IconButton
              size="small"
              onClick={handleClear}
              aria-label="Clear notes"
              sx={{ mr: "auto" }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {hasChanges && (
            <Typography
              variant="caption"
              sx={{
                color: "warning.main",
                alignSelf: "center",
                mr: 1
              }}
            >
              Unsaved changes
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
};

export default WorkflowNotesPanel;
