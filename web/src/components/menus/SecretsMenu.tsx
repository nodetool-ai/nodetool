/** @jsxImportSource @emotion/react */
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import WarningIcon from "@mui/icons-material/Warning";
import {
  Button,
  TextField,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Chip,
  Box,
  Divider
} from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import useSecretsStore from "../../stores/SecretsStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useState, useCallback, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import { getSharedSettingsStyles } from "./sharedSettingsStyles";
import ConfirmDialog from "../dialogs/ConfirmDialog";

interface SecretFormData {
  key: string;
  value: string;
}

const SecretsMenu = () => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const {
    secrets,
    isLoading: storeLoading,
    fetchSecrets,
    updateSecret,
    deleteSecret
  } = useSecretsStore();
  const { addNotification } = useNotificationStore();
  const safeSecrets = useMemo(() => secrets ?? [], [secrets]);

  const [openDialog, setOpenDialog] = useState(false);
  const [editingSecret, setEditingSecret] = useState<any | null>(null);
  const [formData, setFormData] = useState<SecretFormData>({
    key: "",
    value: ""
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [secretToDelete, setSecretToDelete] = useState<string | null>(null);

  // Use React Query to trigger fetch, but use store state directly
  const { isLoading: queryLoading } = useQuery({
    queryKey: ["secrets"],
    queryFn: () => fetchSecrets(),
    staleTime: 30000 // Consider data fresh for 30 seconds
  });

  const isLoading = storeLoading || queryLoading;
  const isSuccess = !isLoading;

  // Group secrets by configured/unconfigured status
  // Use store state directly (same as sidebar) to ensure consistency
  const secretsByStatus = useMemo(() => {
    const configured = safeSecrets.filter((s: any) => s.is_configured);
    const unconfigured = safeSecrets.filter((s: any) => !s.is_configured);
    return { configured, unconfigured };
  }, [safeSecrets]);

  const updateMutation = useMutation({
    mutationFn: () => updateSecret(editingSecret.key, formData.value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["secrets"] });
      // Invalidate providers cache when secrets change, as provider availability
      // depends on having the required secrets configured
      queryClient.invalidateQueries({ queryKey: ["providers"] });
      // Also invalidate all model queries that depend on providers
      queryClient.invalidateQueries({ queryKey: ["language-models"] });
      queryClient.invalidateQueries({ queryKey: ["image-models"] });
      queryClient.invalidateQueries({ queryKey: ["tts-models"] });
      queryClient.invalidateQueries({ queryKey: ["asr-models"] });
      queryClient.invalidateQueries({ queryKey: ["video-models"] });
      addNotification({
        type: "success",
        content: "Secret updated successfully",
        alert: true
      });
      resetForm();
    },
    onError: (error: any) => {
      addNotification({
        type: "error",
        content: `Failed to update secret: ${error.message}`,
        dismissable: true
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => deleteSecret(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["secrets"] });
      // Invalidate providers cache when secrets change, as provider availability
      // depends on having the required secrets configured
      queryClient.invalidateQueries({ queryKey: ["providers"] });
      // Also invalidate all model queries that depend on providers
      queryClient.invalidateQueries({ queryKey: ["language-models"] });
      queryClient.invalidateQueries({ queryKey: ["image-models"] });
      queryClient.invalidateQueries({ queryKey: ["tts-models"] });
      queryClient.invalidateQueries({ queryKey: ["asr-models"] });
      queryClient.invalidateQueries({ queryKey: ["video-models"] });
      addNotification({
        type: "success",
        content: "Secret deleted successfully",
        alert: true
      });
    },
    onError: (error: any) => {
      addNotification({
        type: "error",
        content: `Failed to delete secret: ${error.message}`,
        dismissable: true
      });
    }
  });

  const resetForm = () => {
    setFormData({ key: "", value: "" });
    setEditingSecret(null);
    setOpenDialog(false);
  };

  const handleOpenEditDialog = (secret: any) => {
    setEditingSecret(secret);
    setFormData({
      key: secret.key,
      value: ""
    });
    setOpenDialog(true);
  };

  const handleClose = () => {
    resetForm();
  };

  const handleSave = useCallback(() => {
    if (!formData.value) {
      addNotification({
        type: "error",
        content: "Secret value is required",
        dismissable: true
      });
      return;
    }

    updateMutation.mutate();
  }, [formData, updateMutation, addNotification]);

  const handleDelete = (key: string) => {
    setSecretToDelete(key);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (secretToDelete) {
      deleteMutation.mutate(secretToDelete);
    }
    setDeleteDialogOpen(false);
    setSecretToDelete(null);
  };

  return (
    <>
      {isLoading && (
        <Typography sx={{ textAlign: "center", padding: "2em" }}>
          Loading secrets...
        </Typography>
      )}
      {isSuccess && (
        <div className="secrets-content" css={getSharedSettingsStyles(theme)}>
          <div className="settings-main-content">
            <Typography variant="h1">Secrets Management</Typography>

            <div className="secrets">
              <WarningIcon sx={{ color: "#ff9800", flexShrink: 0 }} />
              <Typography>
                Keep your secrets secure and do not share them publicly. Secrets
                are encrypted in the database.
              </Typography>
            </div>

            {safeSecrets.length === 0 ? (
              <Typography sx={{ textAlign: "center", padding: "2em" }}>
                No secrets available. Contact your administrator to configure
                available secrets.
              </Typography>
            ) : (
              <>
                {/* Configured Secrets Section */}
                {secretsByStatus.configured.length > 0 && (
                  <div className="settings-section">
                    <Typography variant="h2">Configured Secrets</Typography>
                    {secretsByStatus.configured.map((secret: any) => (
                      <div
                        key={secret.key}
                        id={`secret-${secret.key}`}
                        className="settings-item large"
                        style={{
                          display: "flex",
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "1em"
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, marginBottom: "0.25em" }}
                          >
                            <code
                              style={{ color: "var(--palette-primary-main)" }}
                            >
                              {secret.key}
                            </code>
                          </Typography>
                          {secret.description && (
                            <Typography className="description">
                              {secret.description}
                            </Typography>
                          )}
                          <Typography
                            variant="caption"
                            sx={{
                              opacity: 0.7,
                              marginTop: "0.5em",
                              display: "block"
                            }}
                          >
                            Updated:{" "}
                            {new Date(secret.updated_at).toLocaleDateString()}
                          </Typography>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "0.5em",
                            flexShrink: 0
                          }}
                        >
                          <Tooltip title="Update secret">
                            <IconButton
                              size="small"
                              onClick={() => handleOpenEditDialog(secret)}
                              disabled={updateMutation.isPending}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete secret">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDelete(secret.key)}
                              disabled={deleteMutation.isPending}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Unconfigured Secrets Section */}
                {secretsByStatus.unconfigured.length > 0 && (
                  <div className="settings-section">
                    <Typography variant="h2">Available Secrets</Typography>
                    {secretsByStatus.unconfigured.map((secret: any) => (
                      <div
                        key={secret.key}
                        id={`secret-${secret.key}`}
                        className="settings-item large"
                        style={{
                          display: "flex",
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "1em"
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, marginBottom: "0.25em" }}
                          >
                            <code
                              style={{ color: "var(--palette-primary-main)" }}
                            >
                              {secret.key}
                            </code>
                          </Typography>
                          <Chip
                            label="Not set"
                            size="small"
                            variant="outlined"
                            sx={{ marginTop: "0.5em" }}
                          />
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "0.5em",
                            flexShrink: 0
                          }}
                        >
                          <Tooltip title="Set secret">
                            <IconButton
                              size="small"
                              onClick={() => handleOpenEditDialog(secret)}
                              disabled={updateMutation.isPending}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <Dialog
        open={openDialog}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: "12px",
            backgroundImage: "none"
          }
        }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "0.75em",
            paddingBottom: "1em",
            fontSize: "1.25rem",
            fontWeight: 600,
            background: `linear-gradient(135deg, ${theme.vars.palette.primary.main}15, ${theme.vars.palette.primary.main}08)`,
            borderBottom: `1px solid ${theme.vars.palette.divider}`
          }}
        >
          <LockIcon sx={{ color: "var(--palette-primary-main)" }} />
          {editingSecret?.is_configured ? "Update Secret" : "Set Secret"}
        </DialogTitle>
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: "1.5em",
            paddingTop: "1.5em",
            paddingBottom: "1.5em"
          }}
        >
          <Box>
            <TextField
              disabled={true}
              label="Key"
              value={formData.key}
              fullWidth
              helperText="This is the secret name — update the value below"
              variant="outlined"
            />
          </Box>

          <Box>
            <TextField
              label="Value"
              type="password"
              value={formData.value}
              onChange={(e) =>
                setFormData({ ...formData, value: e.target.value })
              }
              fullWidth
              placeholder="Enter new secret value"
              multiline
              rows={4}
              autoFocus
              variant="outlined"
              sx={{
                "& .MuiOutlinedInput-root": {
                  fontFamily: "monospace",
                  fontSize: "0.9em",
                  letterSpacing: "0.05em"
                }
              }}
            />
            <Typography
              variant="caption"
              sx={{
                display: "block",
                marginTop: "0.5em",
                opacity: 0.7
              }}
            >
              Keep this value secure and do not share it publicly.
            </Typography>
          </Box>
        </DialogContent>

        <Divider />

        <DialogActions
          sx={{
            padding: "1.25em",
            gap: "0.75em",
            justifyContent: "flex-end"
          }}
        >
          <Button
            onClick={handleClose}
            sx={{
              textTransform: "none",
              fontSize: "0.95rem",
              padding: "0.6em 1.5em"
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={updateMutation.isPending || !formData.value}
            sx={{
              textTransform: "none",
              fontSize: "0.95rem",
              padding: "0.6em 2em",
              fontWeight: 600,
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
              "&:hover:not(:disabled)": {
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)",
                transform: "translateY(-1px)"
              },
              transition: "all 0.2s ease"
            }}
          >
            {updateMutation.isPending
              ? "Saving..."
              : editingSecret?.is_configured
              ? "Update"
              : "Set"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setSecretToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="Delete Secret"
        content={`Are you sure you want to delete the secret "${secretToDelete}"?`}
        confirmText="Delete"
        cancelText="Cancel"
      />
    </>
  );
};

/**
 * Generate sidebar sections for secrets management
 * Groups secrets by their type/category for navigation
 */
export const getSecretsSidebarSections = () => {
  const store = useSecretsStore.getState();
  const secrets = store.secrets;

  if (!secrets || secrets.length === 0) {
    return [
      {
        category: "Secrets",
        items: [{ id: "no-secrets", label: "No Secrets" }]
      }
    ];
  }

  // Group secrets by configured/unconfigured status
  const configured = secrets.filter((s: any) => s.is_configured);
  const unconfigured = secrets.filter((s: any) => !s.is_configured);

  const sections = [];

  if (configured.length > 0) {
    sections.push({
      category: "Configured Secrets",
      items: configured.map((secret: any) => ({
        id: `secret-${secret.key}`,
        label: secret.key
          .replace(/_/g, " ")
          .toLowerCase()
          .replace(/\b\w/g, (char: string) => char.toUpperCase())
      }))
    });
  }

  if (unconfigured.length > 0) {
    sections.push({
      category: "Available Secrets",
      items: unconfigured.map((secret: any) => ({
        id: `secret-${secret.key}`,
        label: secret.key
          .replace(/_/g, " ")
          .toLowerCase()
          .replace(/\b\w/g, (char: string) => char.toUpperCase())
      }))
    });
  }

  return sections.length > 0
    ? sections
    : [
        {
          category: "Secrets",
          items: [{ id: "no-secrets", label: "No Secrets" }]
        }
      ];
};

export default SecretsMenu;
