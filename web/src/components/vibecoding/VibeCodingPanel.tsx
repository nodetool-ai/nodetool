/** @jsxImportSource @emotion/react */
import React, { useCallback, useEffect, useMemo, memo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Tooltip,
  Typography,
  Snackbar,
  Alert
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { CloseButton } from "../ui_primitives";
import { Workflow } from "../../stores/ApiTypes";
import { useVibeCodingStore } from "../../stores/VibeCodingStore";
import { client } from "../../stores/ApiClient";
import VibeCodingChat from "./VibeCodingChat";
import VibeCodingPreview from "./VibeCodingPreview";
import type { Theme } from "@mui/material/styles";

const createStyles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      backgroundColor: theme.palette.background.default
    },
    ".panel-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      borderBottom: `1px solid ${theme.palette.divider}`,
      backgroundColor: theme.palette.background.paper
    },
    ".panel-title": {
      display: "flex",
      alignItems: "center",
      gap: "12px"
    },
    ".panel-actions": {
      display: "flex",
      alignItems: "center",
      gap: "8px"
    },
    ".panel-content": {
      flex: 1,
      display: "flex",
      overflow: "hidden"
    },
    ".chat-section": {
      width: "40%",
      minWidth: "300px",
      borderRight: `1px solid ${theme.palette.divider}`,
      display: "flex",
      flexDirection: "column"
    },
    ".preview-section": {
      flex: 1,
      minWidth: "400px",
      display: "flex",
      flexDirection: "column"
    },
    ".dirty-indicator": {
      width: "8px",
      height: "8px",
      borderRadius: "50%",
      backgroundColor: theme.palette.warning.main
    }
  });

interface VibeCodingPanelProps {
  workflow: Workflow;
  onClose?: () => void;
}

const VibeCodingPanel: React.FC<VibeCodingPanelProps> = ({
  workflow,
  onClose
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const getSession = useVibeCodingStore((state) => state.getSession);
  const initSession = useVibeCodingStore((state) => state.initSession);
  const setCurrentHtml = useVibeCodingStore((state) => state.setCurrentHtml);
  const setSavedHtml = useVibeCodingStore((state) => state.setSavedHtml);
  const isDirty = useVibeCodingStore((state) => state.isDirty);

  const session = getSession(workflow.id);
  const hasUnsavedChanges = isDirty(workflow.id);

  const [isSaving, setIsSaving] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  // Initialize session with workflow's current html_app
  useEffect(() => {
    initSession(workflow.id, workflow.html_app || null);
  }, [workflow.id, workflow.html_app, initSession]);

  // Warn before closing with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Handle HTML generated from chat
  const handleHtmlGenerated = useCallback(
    (html: string) => {
      setCurrentHtml(workflow.id, html);
    },
    [workflow.id, setCurrentHtml]
  );

  // Save HTML to workflow
  const handleSave = useCallback(async () => {
    if (!session.currentHtml) {
      return;
    }

    setIsSaving(true);
    try {
      await client.PUT("/api/workflows/{id}", {
        params: { path: { id: workflow.id } },
        body: {
          name: workflow.name,
          access: workflow.access,
          html_app: session.currentHtml
        }
      });
      setSavedHtml(workflow.id, session.currentHtml);
      setSnackbar({
        open: true,
        message: "App saved successfully!",
        severity: "success"
      });
    } catch (error: unknown) {
      console.error("Failed to save:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to save app";
      setSnackbar({
        open: true,
        message: errorMessage,
        severity: "error"
      });
    } finally {
      setIsSaving(false);
    }
  }, [workflow.id, workflow.name, workflow.access, session.currentHtml, setSavedHtml]);

  // Clear saved HTML (revert to default UI)
  const handleClearApp = useCallback(async () => {
    setIsSaving(true);
    try {
      await client.PUT("/api/workflows/{id}", {
        params: { path: { id: workflow.id } },
        body: {
          name: workflow.name,
          access: workflow.access,
          html_app: null
        }
      });
      setSavedHtml(workflow.id, null);
      setCurrentHtml(workflow.id, null);
      setShowClearDialog(false);
      setSnackbar({
        open: true,
        message: "Custom app removed. Workflow will use default UI.",
        severity: "success"
      });
    } catch (error: unknown) {
      console.error("Failed to clear:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to clear app";
      setSnackbar({
        open: true,
        message: errorMessage,
        severity: "error"
      });
    } finally {
      setIsSaving(false);
    }
  }, [workflow.id, workflow.name, workflow.access, setSavedHtml, setCurrentHtml]);

  // Handle close with unsaved changes
  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowDiscardDialog(true);
    } else {
      onClose?.();
    }
  }, [hasUnsavedChanges, onClose]);

  const handleDiscardAndClose = useCallback(() => {
    setShowDiscardDialog(false);
    setCurrentHtml(workflow.id, session.savedHtml);
    onClose?.();
  }, [workflow.id, session.savedHtml, setCurrentHtml, onClose]);

  const handleSaveAndClose = useCallback(async () => {
    await handleSave();
    setShowDiscardDialog(false);
    onClose?.();
  }, [handleSave, onClose]);

  // Memoized handlers for dialog actions to avoid inline arrow functions
  const handleShowClearDialog = useCallback(() => {
    setShowClearDialog(true);
  }, []);

  const handleHideClearDialog = useCallback(() => {
    setShowClearDialog(false);
  }, []);

  const handleHideDiscardDialog = useCallback(() => {
    setShowDiscardDialog(false);
  }, []);

  return (
    <Box css={styles}>
      {/* Header */}
      <div className="panel-header">
        <div className="panel-title">
          <Typography variant="h6">Design App UI</Typography>
          {hasUnsavedChanges && (
            <Tooltip title="Unsaved changes">
              <div className="dirty-indicator" />
            </Tooltip>
          )}
        </div>
        <div className="panel-actions">
          {session.savedHtml && (
            <Tooltip title="Remove custom app (use default UI)">
              <Button
                size="small"
                color="error"
                startIcon={<DeleteOutlineIcon />}
                onClick={handleShowClearDialog}
                disabled={isSaving}
              >
                Clear App
              </Button>
            </Tooltip>
          )}
          <Button
            variant="contained"
            size="small"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={!hasUnsavedChanges || isSaving || !session.currentHtml}
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
          {onClose && (
            <CloseButton onClick={handleClose} />
          )}
        </div>
      </div>

      {/* Split Content */}
      <div className="panel-content">
        <div className="chat-section">
          <VibeCodingChat
            workflow={workflow}
            onHtmlGenerated={handleHtmlGenerated}
          />
        </div>
        <div className="preview-section">
          <VibeCodingPreview
            html={session.currentHtml}
            workflowId={workflow.id}
            isGenerating={session.status === "streaming"}
          />
        </div>
      </div>

      {/* Discard Changes Dialog */}
      <Dialog
        open={showDiscardDialog}
        onClose={handleHideDiscardDialog}
      >
        <DialogTitle>Unsaved Changes</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have unsaved changes. Are you sure you want to close without
            saving?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleHideDiscardDialog}>Cancel</Button>
          <Button onClick={handleDiscardAndClose} color="error">
            Discard Changes
          </Button>
          <Button
            onClick={handleSaveAndClose}
            variant="contained"
            disabled={isSaving}
          >
            Save & Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clear App Dialog */}
      <Dialog open={showClearDialog} onClose={handleHideClearDialog}>
        <DialogTitle>Remove Custom App?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will remove the custom app and the workflow will use the
            default MiniApp UI. This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleHideClearDialog}>Cancel</Button>
          <Button onClick={handleClearApp} color="error" disabled={isSaving}>
            Remove App
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default memo(VibeCodingPanel);
