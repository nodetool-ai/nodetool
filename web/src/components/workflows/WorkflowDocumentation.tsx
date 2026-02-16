/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useState, useCallback, memo } from "react";
import {
  Box,
  TextField,
  Typography,
  IconButton,
  Tooltip,
  FormControl
} from "@mui/material";
import { Save, Edit, Description as DescriptionIcon } from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNotificationStore } from "../../stores/NotificationStore";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",

    ".header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: theme.spacing(2),
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.paper
    },

    ".header-title": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1)
    },

    ".title-text": {
      fontSize: "0.95rem",
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },

    ".subtitle-text": {
      fontSize: "0.75rem",
      color: theme.vars.palette.text.secondary,
      marginLeft: theme.spacing(1)
    },

    ".actions": {
      display: "flex",
      gap: theme.spacing(0.5)
    },

    ".content": {
      flex: 1,
      overflow: "auto",
      padding: theme.spacing(2)
    },

    ".documentation-textarea": {
      width: "100%",
      height: "100%",
      fontFamily: theme.fontFamily1,

      "& .MuiInputBase-root": {
        height: "100%",
        alignItems: "flex-start",
        fontSize: theme.fontSizeNormal,
        lineHeight: 1.6,
        color: theme.vars.palette.text.primary
      },

      "& .MuiInputBase-input": {
        height: "100% !important",
        overflow: "auto !important",
        whiteSpace: "pre-wrap",
        paddingTop: theme.spacing(1.5),
        paddingBottom: theme.spacing(1.5)
      },

      "& .MuiOutlinedInput-notchedOutline": {
        borderColor: theme.vars.palette.divider
      },

      "&:hover .MuiOutlinedInput-notchedOutline": {
        borderColor: theme.vars.palette.grey[500]
      }
    },

    ".empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      gap: theme.spacing(2),
      color: theme.vars.palette.text.secondary
    },

    ".empty-state-icon": {
      fontSize: "4rem",
      opacity: 0.3
    },

    ".empty-state-text": {
      fontSize: "0.9rem",
      textAlign: "center",
      maxWidth: "300px"
    },

    ".empty-state-hint": {
      fontSize: "0.75rem",
      color: theme.vars.palette.text.disabled
    },

    ".save-button": {
      transition: "all 0.2s ease"
    },

    ".save-button.saved": {
      color: theme.vars.palette.success.main
    }
  });

interface WorkflowDocumentationProps {
  workflowId: string;
}

/**
 * WorkflowDocumentation component displays and edits workflow documentation.
 * Documentation is stored in workflow.settings.documentation.
 *
 * Features:
 * - View-only mode by default with edit button
 * - Textarea for editing documentation
 * - Save button with visual feedback
 * - Empty state when no documentation exists
 */
const WorkflowDocumentation = memo(function WorkflowDocumentation({
  workflowId
}: WorkflowDocumentationProps) {
  const theme = useTheme();
  const { getWorkflow, saveWorkflow } = useWorkflowManager(
    (state) => ({
      getWorkflow: state.getWorkflow,
      saveWorkflow: state.saveWorkflow
    })
  );
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const workflow = getWorkflow(workflowId);
  const documentation = workflow?.settings?.documentation as string | undefined ?? "";
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(documentation);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");

  // Update edited text when workflow changes
  if (editedText !== documentation && !isEditing) {
    setEditedText(documentation);
  }

  const handleEdit = useCallback(() => {
    setIsEditing(true);
    setEditedText(documentation);
  }, [documentation]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditedText(documentation);
  }, [documentation]);

  const handleSave = useCallback(async () => {
    if (!workflow) {
      return;
    }

    const updatedWorkflow = {
      ...workflow,
      settings: {
        ...(workflow.settings || {}),
        documentation: editedText
      }
    };

    try {
      await saveWorkflow(updatedWorkflow);
      setIsEditing(false);
      setSaveStatus("saved");
      addNotification({
        type: "success",
        content: "Documentation saved",
        dismissable: true,
        timeout: 2000
      });

      // Reset save status after animation
      setTimeout(() => setSaveStatus("idle"), 1500);
    } catch (_error) {
      addNotification({
        type: "error",
        content: "Failed to save documentation",
        dismissable: true,
        alert: true
      });
    }
  }, [workflow, editedText, saveWorkflow, addNotification]);

  const handleTextChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setEditedText(event.target.value);
    },
    []
  );

  const isEmpty = !documentation;

  return (
    <Box css={styles(theme)} className="workflow-documentation">
      <Box className="header">
        <Box className="header-title">
          <DescriptionIcon fontSize="small" />
          <Typography className="title-text">Documentation</Typography>
          {!isEmpty && !isEditing && (
            <Typography className="subtitle-text">
              ({documentation.length} chars)
            </Typography>
          )}
        </Box>
        <Box className="actions">
          {isEditing ? (
            <>
              <Tooltip title="Save (Ctrl+Enter)">
                <IconButton
                  className={`save-button ${saveStatus}`}
                  onClick={handleSave}
                  size="small"
                  aria-label="Save documentation"
                >
                  <Save fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Cancel (Esc)">
                <IconButton
                  onClick={handleCancel}
                  size="small"
                  aria-label="Cancel editing"
                >
                  <Typography variant="button" sx={{ fontSize: "0.7rem" }}>
                    ✕
                  </Typography>
                </IconButton>
              </Tooltip>
            </>
          ) : (
            <Tooltip title="Edit documentation">
              <IconButton
                onClick={handleEdit}
                size="small"
                aria-label="Edit documentation"
              >
                <Edit fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      <Box className="content">
        {isEmpty && !isEditing ? (
          <Box className="empty-state">
            <DescriptionIcon className="empty-state-icon" />
            <Typography className="empty-state-text">
              No documentation yet
            </Typography>
            <Typography className="empty-state-hint">
              Click the edit button to add workflow documentation
            </Typography>
          </Box>
        ) : (
          <FormControl className="documentation-textarea" fullWidth>
            <TextField
              multiline
              fullWidth
              value={editedText}
              onChange={handleTextChange}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  handleSave();
                } else if (e.key === "Escape") {
                  handleCancel();
                }
              }}
              placeholder="Add documentation for this workflow...

You can use this space to:
• Describe the workflow's purpose
• Document input/output requirements
• Add usage examples
• Note any dependencies or prerequisites
• Record troubleshooting tips

Keyboard shortcuts:
• Ctrl+Enter / Cmd+Enter: Save
• Esc: Cancel editing"
              disabled={!isEditing}
              autoFocus={isEditing}
              aria-label="Workflow documentation"
            />
          </FormControl>
        )}
      </Box>
    </Box>
  );
});

export default WorkflowDocumentation;
