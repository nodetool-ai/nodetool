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
  Chip
} from "@mui/material";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import useSecretsStore from "../../stores/SecretsStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useState, useCallback, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import { getSharedSettingsStyles } from "./sharedSettingsStyles";

interface SecretFormData {
  key: string;
  value: string;
  description: string;
}

const SecretsMenu = () => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const {
    fetchSecrets,
    updateSecret,
    deleteSecret
  } = useSecretsStore();
  const { addNotification } = useNotificationStore();

  const [openDialog, setOpenDialog] = useState(false);
  const [editingSecret, setEditingSecret] = useState<any | null>(null);
  const [formData, setFormData] = useState<SecretFormData>({
    key: "",
    value: "",
    description: ""
  });

  const { data: secrets = [], isLoading, isSuccess } = useQuery({
    queryKey: ["secrets"],
    queryFn: () => fetchSecrets()
  });

  // Group secrets by configured/unconfigured status
  const secretsByStatus = useMemo(() => {
    const configured = secrets.filter((s: any) => s.is_configured);
    const unconfigured = secrets.filter((s: any) => !s.is_configured);
    return { configured, unconfigured };
  }, [secrets]);

  const updateMutation = useMutation({
    mutationFn: () =>
      updateSecret(
        editingSecret.key,
        formData.value,
        formData.description
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["secrets"] });
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
    setFormData({ key: "", value: "", description: "" });
    setEditingSecret(null);
    setOpenDialog(false);
  };

  const handleOpenEditDialog = (secret: any) => {
    setEditingSecret(secret);
    setFormData({
      key: secret.key,
      value: "",
      description: secret.description || ""
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
    if (window.confirm(`Are you sure you want to delete the secret "${key}"?`)) {
      deleteMutation.mutate(key);
    }
  };

  return (
    <>
      {isLoading && (
        <Typography sx={{ textAlign: "center", padding: "2em" }}>
          Loading secrets...
        </Typography>
      )}
      {isSuccess && (
        <div
          className="secrets-content"
          css={getSharedSettingsStyles(theme)}
        >
          <div className="settings-main-content">
            <Typography variant="h1">Secrets Management</Typography>

            <div className="secrets">
              <WarningIcon sx={{ color: "#ff9800", flexShrink: 0 }} />
              <Typography>
                Keep your secrets secure and do not share them publicly. Secrets
                are encrypted in the database.
              </Typography>
            </div>

            {secrets.length === 0 ? (
              <Typography sx={{ textAlign: "center", padding: "2em" }}>
                No secrets available. Contact your administrator to configure available secrets.
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
                            <code style={{ color: "var(--palette-primary-main)" }}>
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
                            sx={{ opacity: 0.7, marginTop: "0.5em", display: "block" }}
                          >
                            Updated: {new Date(secret.updated_at).toLocaleDateString()}
                          </Typography>
                        </div>
                        <div style={{ display: "flex", gap: "0.5em", flexShrink: 0 }}>
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
                            <code style={{ color: "var(--palette-primary-main)" }}>
                              {secret.key}
                            </code>
                          </Typography>
                          {secret.description && (
                            <Typography className="description">
                              {secret.description}
                            </Typography>
                          )}
                          <Chip
                            label="Not set"
                            size="small"
                            variant="outlined"
                            sx={{ marginTop: "0.5em" }}
                          />
                        </div>
                        <div style={{ display: "flex", gap: "0.5em", flexShrink: 0 }}>
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

      <Dialog open={openDialog} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingSecret?.is_configured ? "Update Secret" : "Set Secret"}
        </DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: "1em", marginTop: "0.5em" }}>
          <TextField
            disabled={true}
            label="Key"
            value={formData.key}
            fullWidth
            helperText="Secret key cannot be changed"
          />
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
            rows={3}
            autoFocus
          />
          <TextField
            label="Description (optional)"
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            fullWidth
            placeholder="e.g., My API key for external service"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={
              updateMutation.isPending ||
              !formData.value
            }
          >
            {editingSecret?.is_configured ? "Update" : "Set"}
          </Button>
        </DialogActions>
      </Dialog>
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
        label: secret.key.replace(/_/g, " ")
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
        label: secret.key.replace(/_/g, " ")
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
