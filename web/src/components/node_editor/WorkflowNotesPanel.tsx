/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useCallback, useEffect } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Typography,
  TextField,
  Button,
  IconButton,
  Tooltip
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useWorkflowNotesStore } from "../../stores/WorkflowNotesStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import type { NodeStore } from "../../stores/NodeStore";

const styles = (theme: Theme) =>
  css({
    "&": {
      margin: 0,
      padding: theme.spacing(3),
      minWidth: "420px",
      maxWidth: "500px",
      height: "100%",
      display: "flex",
      flexDirection: "column"
    },

    ".notes-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: theme.spacing(3),
      paddingBottom: theme.spacing(2),
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`
    },

    ".notes-header h3": {
      margin: 0,
      fontSize: "1.25rem",
      fontWeight: 600,
      color: theme.vars.palette.grey[0],
      letterSpacing: "-0.02em",
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1)
    },

    ".close-button": {
      color: theme.vars.palette.grey[400],
      padding: "6px",
      "&:hover": {
        color: theme.vars.palette.grey[0],
        backgroundColor: theme.vars.palette.grey[700]
      }
    },

    ".notes-info": {
      display: "flex",
      alignItems: "flex-start",
      gap: theme.spacing(1.5),
      padding: theme.spacing(2),
      marginBottom: theme.spacing(3),
      backgroundColor: theme.vars.palette.action.hover,
      borderRadius: "8px",
      border: `1px solid ${theme.vars.palette.grey[800]}`
    },

    ".notes-info svg": {
      color: theme.vars.palette.primary.main,
      flexShrink: 0,
      marginTop: "2px"
    },

    ".notes-info p": {
      margin: 0,
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.grey[300],
      lineHeight: 1.5
    },

    ".notes-editor-container": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      minHeight: 0
    },

    ".notes-textfield": {
      flex: 1,
      display: "flex",
      flexDirection: "column",

      "& .MuiOutlinedInput-root": {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        backgroundColor: theme.vars.palette.grey[900],
        borderRadius: "8px",
        border: `1px solid ${theme.vars.palette.grey[700]}`,
        transition: "all 0.2s ease",
        "&:hover": {
          borderColor: theme.vars.palette.grey[500]
        },
        "&.Mui-focused": {
          borderColor: "var(--palette-primary-main)",
          borderWidth: "1px"
        }
      },

      "& .MuiOutlinedInput-input": {
        flex: 1,
        fontFamily: theme.fontFamily2,
        fontSize: theme.fontSizeSmall,
        color: theme.vars.palette.grey[0],
        padding: theme.spacing(2),
        lineHeight: 1.6,
        resize: "none",
        spellCheck: false
      },

      "& .MuiOutlinedInput-notchedOutline": {
        borderColor: theme.vars.palette.grey[700]
      }
    },

    ".notes-actions": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: theme.spacing(2),
      paddingTop: theme.spacing(2),
      borderTop: `1px solid ${theme.vars.palette.grey[800]}`
    },

    ".clear-button": {
      color: theme.vars.palette.error.light,
      fontSize: theme.fontSizeSmall,
      textTransform: "none",
      "&:hover": {
        backgroundColor: `${theme.vars.palette.error.dark}22`
      }
    },

    ".save-status": {
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.grey[400]
    }
  });

interface WorkflowNotesPanelProps {
  workflowId: string;
  onClose: () => void;
}

const WorkflowNotesPanel: React.FC<WorkflowNotesPanelProps> = ({
  workflowId,
  onClose
}) => {
  const theme = useTheme();
  const { notes, isEditing, setNotes, setIsEditing } = useWorkflowNotesStore(
    (state) => ({
      notes: state.notes,
      isEditing: state.isEditing,
      setNotes: state.setNotes,
      setIsEditing: state.setIsEditing
    })
  );

  const activeNodeStore = useWorkflowManager((state) =>
    (state.currentWorkflowId
      ? state.nodeStores[state.currentWorkflowId]
      : undefined) as NodeStore | undefined
  );

  const { saveWorkflow } = useWorkflowManager((state) => ({
    saveWorkflow: state.saveWorkflow
  }));

  useEffect(() => {
    if (activeNodeStore) {
      const workflow = activeNodeStore.getState().getWorkflow();
      useWorkflowNotesStore.getState().loadNotesFromWorkflow(workflow);
    }
  }, [workflowId, activeNodeStore]);

  const handleNotesChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setNotes(event.target.value);
      setIsEditing(true);
    },
    [setNotes, setIsEditing]
  );

  const handleClearNotes = useCallback(() => {
    setNotes("");
    setIsEditing(true);
  }, [setNotes, setIsEditing]);

  const handleSave = useCallback(async () => {
    if (!activeNodeStore) {
      return;
    }

    const storeState = activeNodeStore.getState();
    const workflow = storeState.getWorkflow();
    const notesSettings = useWorkflowNotesStore.getState().getNotesForSave();

    const updatedWorkflow: typeof workflow = {
      ...workflow,
      settings: {
        ...(workflow.settings || {}),
        ...notesSettings
      }
    };

    await saveWorkflow(updatedWorkflow);
    setIsEditing(false);
  }, [activeNodeStore, saveWorkflow, setIsEditing]);

  const hasNotes = notes.length > 0;

  return (
    <div css={styles(theme)} className="workflow-notes-panel">
      <div className="notes-header">
        <Typography variant="h3">
          <InfoOutlinedIcon />
          Workflow Notes
        </Typography>
        <Tooltip title="Close notes">
          <IconButton className="close-button" onClick={onClose} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>

      <div className="notes-info">
        <InfoOutlinedIcon fontSize="small" />
        <Typography variant="body2">
          Add notes, documentation, or TODOs for this workflow. Markdown is
          supported. Notes are saved with the workflow.
        </Typography>
      </div>

      <div className="notes-editor-container">
        <TextField
          className="notes-textfield"
          multiline
          fullWidth
          placeholder="## Workflow Overview&#10;&#10;### Purpose&#10;Describe what this workflow does...&#10;&#10;### Inputs&#10;- Input 1: ...&#10;- Input 2: ...&#10;&#10;### Outputs&#10;- Output 1: ...&#10;&#10;### TODO&#10;- [ ] Add model configuration&#10;- [ ] Test with sample data"
          value={notes}
          onChange={handleNotesChange}
          variant="outlined"
        />
      </div>

      <div className="notes-actions">
        <Tooltip title="Clear all notes">
          <span>
            <Button
              className="clear-button"
              startIcon={<DeleteOutlineIcon />}
              onClick={handleClearNotes}
              disabled={!hasNotes}
              size="small"
            >
              Clear
            </Button>
          </span>
        </Tooltip>

        <Typography className="save-status">
          {isEditing ? "Unsaved changes" : "All changes saved"}
        </Typography>

        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!isEditing}
          size="small"
        >
          Save Notes
        </Button>
      </div>
    </div>
  );
};

export default WorkflowNotesPanel;
