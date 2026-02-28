/** @jsxImportSource @emotion/react */
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SearchIcon from "@mui/icons-material/Search";
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
  Divider,
  InputAdornment
} from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import useSecretsStore from "../../stores/SecretsStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useState, useCallback, useMemo, memo, useEffect } from "react";
import { useTheme } from "@mui/material/styles";
import { getSharedSettingsStyles } from "./sharedSettingsStyles";
import ConfirmDialog from "../dialogs/ConfirmDialog";
import { SecretResponse } from "../../stores/ApiTypes";

interface SecretFormData {
  key: string;
  value: string;
}

const SecretsMenu = memo(() => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const secrets = useSecretsStore((state) => state.secrets);
  const storeLoading = useSecretsStore((state) => state.isLoading);
  const fetchSecrets = useSecretsStore((state) => state.fetchSecrets);
  const updateSecret = useSecretsStore((state) => state.updateSecret);
  const deleteSecret = useSecretsStore((state) => state.deleteSecret);
  const addNotification = useNotificationStore((state) => state.addNotification);
  const safeSecrets = useMemo(() => secrets ?? [], [secrets]);

  const [openDialog, setOpenDialog] = useState(false);
  const [editingSecret, setEditingSecret] = useState<SecretResponse | null>(null);
  const [formData, setFormData] = useState<SecretFormData>({
    key: "",
    value: ""
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [secretToDelete, setSecretToDelete] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const searchFilter = useSettingsStore((state) => state.searchFilter);

  // Sync searchFilter from store into local searchTerm when it changes
  useEffect(() => {
    if (searchFilter) {
      setSearchTerm(searchFilter);
    }
  }, [searchFilter]);

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
    const lowerSearchTerm = searchTerm.toLowerCase().trim();
    const filterSecrets = (secrets: SecretResponse[]) => {
      if (!lowerSearchTerm) { return secrets; }
      return secrets.filter(
        (s: SecretResponse) =>
          s.key.toLowerCase().includes(lowerSearchTerm) ||
          (s.description && s.description.toLowerCase().includes(lowerSearchTerm))
      );
    };
    const configured = filterSecrets(safeSecrets.filter((s: SecretResponse) => s.is_configured));
    const unconfigured = filterSecrets(safeSecrets.filter((s: SecretResponse) => !s.is_configured));
    return { configured, unconfigured };
  }, [safeSecrets, searchTerm]);

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingSecret) {
        throw new Error("No secret selected for editing");
      }
      return updateSecret(editingSecret.key, formData.value);
    },
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
    onError: (error: Error) => {
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
    onError: (error: Error) => {
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

  const handleOpenEditDialog = useCallback((secret: SecretResponse) => (_event: React.MouseEvent) => {
    setEditingSecret(secret);
    setFormData({
      key: secret.key,
      value: ""
    });
    setOpenDialog(true);
  }, []);

  const handleDeleteClick = useCallback((key: string) => (_event: React.MouseEvent) => {
    setSecretToDelete(key);
    setDeleteDialogOpen(true);
  }, []);

  const confirmDelete = () => {
    if (secretToDelete) {
      deleteMutation.mutate(secretToDelete);
    }
    setDeleteDialogOpen(false);
    setSecretToDelete(null);
  };

  const handleClose = useCallback(() => {
    resetForm();
  }, []);

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

            <div className="secrets-search-container">
              <TextField
                placeholder="Search secrets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                size="small"
                fullWidth
                aria-label="Search secrets"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: "text.disabled" }} />
                    </InputAdornment>
                  )
                }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: "10px",
                    backgroundColor: "action.hover"
                  }
                }}
              />
            </div>

            <div className="secrets">
              <WarningIcon sx={{ color: (theme) => theme.vars.palette.warning.main, flexShrink: 0 }} />
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
            ) : secretsByStatus.configured.length === 0 && secretsByStatus.unconfigured.length === 0 ? (
              <Typography sx={{ textAlign: "center", padding: "2em" }}>
                No secrets found matching &quot;{searchTerm}&quot;
              </Typography>
            ) : (
              <>
                {/* Configured Secrets Section */}
                {secretsByStatus.configured.length > 0 && (
                  <div className="settings-section">
                    <Typography variant="h2">Configured Secrets</Typography>
                    {secretsByStatus.configured.map((secret: SecretResponse) => (
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
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5em",
                              marginBottom: "0.25em"
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 600 }}
                            >
                              <code
                                style={{ color: "var(--palette-primary-main)" }}
                              >
                                {secret.key}
                              </code>
                            </Typography>
                            <Typography
                              component="span"
                              sx={{
                                opacity: 0.7,
                                whiteSpace: "nowrap",
                                fontSize: `${theme.fontSizeTiny} !important`,
                                lineHeight: 1
                              }}
                            >
                              {secret.updated_at
                                ? new Date(secret.updated_at).toLocaleDateString()
                                : "Never"}
                            </Typography>
                          </div>
                          {secret.description && (
                            <Typography className="description">
                              {secret.description}
                            </Typography>
                          )}
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
                              onClick={handleOpenEditDialog(secret)}
                              disabled={updateMutation.isPending}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete secret">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={handleDeleteClick(secret.key)}
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
                    {secretsByStatus.unconfigured.map((secret: SecretResponse) => (
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
                              onClick={handleOpenEditDialog(secret)}
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
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: "12px",
            backgroundImage: "none",
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
          {editingSecret?.is_configured ? "Update" : "Set"} {formData.key || "Secret"}
        </DialogTitle>
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: "1.5em",
          }}
        >
          <Box sx={{ marginTop: "1.5em" }}>
            <TextField
              label="Value"
              type="password"
              value={formData.value}
              onChange={(e) =>
                setFormData({ ...formData, value: e.target.value })
              }
              fullWidth
              placeholder="Enter new secret value"
              autoFocus
              variant="outlined"
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
              boxShadow: (theme) => `0 2px 8px ${theme.vars.palette.grey[900]}26`,
              "&:hover:not(:disabled)": {
                boxShadow: (theme) => `0 4px 12px ${theme.vars.palette.grey[900]}33`,
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
        onClose={handleClose}
        onConfirm={confirmDelete}
        title="Delete Secret"
        content={`Are you sure you want to delete the secret "${secretToDelete}"?`}
        confirmText="Delete"
        cancelText="Cancel"
      />
    </>
  );
});
SecretsMenu.displayName = "SecretsMenu";

export default memo(SecretsMenu);
