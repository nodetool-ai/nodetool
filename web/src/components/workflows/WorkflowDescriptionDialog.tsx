/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useState, useCallback, useEffect } from "react";
import {
  Box,
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  IconButton
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import DescriptionIcon from "@mui/icons-material/Description";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

const styles = (theme: Theme) =>
  css({
    "&.description-dialog": {
      "& .MuiDialog-paper": {
        minWidth: "400px",
        maxWidth: "600px",
        padding: 0
      }
    },
    "& .dialog-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: theme.spacing(1, 2),
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.action.hover
    },
    "& .dialog-title": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      padding: 0,
      margin: 0,
      fontSize: "16px",
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    "& .dialog-content": {
      padding: theme.spacing(3, 2),
      minHeight: "100px"
    },
    "& .description-text": {
      fontSize: "14px",
      lineHeight: 1.6,
      color: theme.vars.palette.text.secondary,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word"
    },
    "& .description-text.empty": {
      fontStyle: "italic",
      color: theme.vars.palette.text.disabled
    },
    "& .dialog-actions": {
      display: "flex",
      justifyContent: "flex-end",
      gap: theme.spacing(1),
      padding: theme.spacing(2),
      borderTop: `1px solid ${theme.vars.palette.divider}`
    },
    "& .edit-container": {
      width: "100%"
    },
    "& .edit-textfield": {
      "& .MuiOutlinedInput-root": {
        minHeight: "120px"
      }
    }
  });

interface WorkflowDescriptionDialogProps {
  workflowId: string;
  open: boolean;
  onClose: () => void;
}

const WorkflowDescriptionDialog: React.FC<WorkflowDescriptionDialogProps> = memo(
  ({ _workflowId, open, onClose }: WorkflowDescriptionDialogProps) => {
    const theme = useTheme();
    const { getCurrentWorkflow, updateWorkflow } = useWorkflowManager((state) => ({
      getCurrentWorkflow: state.getCurrentWorkflow,
      updateWorkflow: state.updateWorkflow
    }));
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState("");
    const [originalDescription, setOriginalDescription] = useState("");

    const workflow = getCurrentWorkflow();
    const description = workflow?.description || "";
    const isEmpty = description.trim().length === 0;

    useEffect(() => {
      if (open) {
        setOriginalDescription(description);
        setEditValue(description);
        setIsEditing(false);
      }
    }, [open, description]);

    const handleStartEdit = useCallback(() => {
      setEditValue(description);
      setIsEditing(true);
    }, [description]);

    const handleCancelEdit = useCallback(() => {
      setEditValue(originalDescription);
      setIsEditing(false);
    }, [originalDescription]);

    const handleSave = useCallback(async () => {
      if (workflow) {
        await updateWorkflow({
          ...workflow,
          description: editValue.trim()
        });
        setOriginalDescription(editValue.trim());
        setIsEditing(false);
      }
    }, [workflow, editValue, updateWorkflow]);

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent) => {
        if (event.key === "Escape" && isEditing) {
          event.preventDefault();
          handleCancelEdit();
        }
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && isEditing) {
          event.preventDefault();
          handleSave();
        }
      },
      [isEditing, handleCancelEdit, handleSave]
    );

    const handleClose = useCallback(() => {
      if (isEditing) {
        setEditValue(originalDescription);
        setIsEditing(false);
      }
      onClose();
    }, [isEditing, originalDescription, onClose]);

    return (
      <Dialog
        open={open}
        onClose={handleClose}
        className="description-dialog"
        css={styles(theme)}
        onKeyDown={handleKeyDown}
      >
        <Box className="dialog-header">
          <Typography className="dialog-title">
            <DescriptionIcon fontSize="small" />
            Workflow Description
          </Typography>
          <IconButton
            size="small"
            onClick={handleClose}
            aria-label="Close dialog"
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        <DialogContent className="dialog-content">
          {isEditing ? (
            <Box className="edit-container">
              <TextField
                className="edit-textfield"
                fullWidth
                multiline
                minRows={4}
                maxRows={10}
                variant="outlined"
                placeholder="Add a description for this workflow..."
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                autoFocus
              />
            </Box>
          ) : (
            <Typography
              className={`description-text ${isEmpty ? "empty" : ""}`}
              variant="body2"
            >
              {isEmpty
                ? "No description provided. Click the edit button to add one."
                : description}
            </Typography>
          )}
        </DialogContent>

        <DialogActions className="dialog-actions">
          {isEditing ? (
            <>
              <Button variant="outlined" onClick={handleCancelEdit}>
                Cancel
              </Button>
              <Button variant="contained" onClick={handleSave}>
                Save
              </Button>
            </>
          ) : (
            <>
              <Button variant="outlined" onClick={handleClose}>
                Close
              </Button>
              <Button
                variant="contained"
                startIcon={<EditIcon />}
                onClick={handleStartEdit}
              >
                {isEmpty ? "Add Description" : "Edit"}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    );
  }
);

WorkflowDescriptionDialog.displayName = "WorkflowDescriptionDialog";

export default WorkflowDescriptionDialog;
