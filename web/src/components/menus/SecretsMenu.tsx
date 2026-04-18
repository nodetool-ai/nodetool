/** @jsxImportSource @emotion/react */
import DeleteIcon from "@mui/icons-material/Delete";
import { EditButton } from "../ui_primitives/EditButton";
import WarningIcon from "@mui/icons-material/Warning";
import { Box } from "@mui/material";
import { FlexColumn, FlexRow, TextInput, Text, Caption, Tooltip, Dialog, ToolbarIconButton, Divider } from "../ui_primitives";
import LockIcon from "@mui/icons-material/Lock";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import useSecretsStore from "../../stores/SecretsStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useState, useCallback, useMemo, memo } from "react";
import { useTheme } from "@mui/material/styles";
import { getSharedSettingsStyles } from "./sharedSettingsStyles";
import ConfirmDialog from "../dialogs/ConfirmDialog";
import { SecretResponse } from "../../stores/ApiTypes";

interface SecretFormData {
  key: string;
  value: string;
}

interface SecretsMenuProps {
  searchTerm?: string;
}

const SecretsMenu = memo(({ searchTerm: externalSearchTerm }: SecretsMenuProps) => {
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
  const searchTerm = externalSearchTerm ?? "";

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

  const handleDeleteClick = useCallback((event: React.MouseEvent) => {
    const target = event.currentTarget as HTMLElement;
    const secretKey = target.dataset.secretKey;
    if (!secretKey) {
      return;
    }

    setSecretToDelete(secretKey);
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
        <Text sx={{ textAlign: "center", padding: "2em" }}>
          Loading secrets...
        </Text>
      )}
      {isSuccess && (
        <div className="secrets-content" css={getSharedSettingsStyles(theme)}>
          <FlexColumn className="settings-main-content" gap={1}>
            <FlexRow className="secrets" align="center" gap={0.5} sx={{ marginBottom: "0.5em" }}>
              <WarningIcon sx={{ fontSize: 16, color: "text.disabled", flexShrink: 0 }} />
              <Caption>
                Secrets are encrypted in the database.
              </Caption>
            </FlexRow>

            {safeSecrets.length === 0 ? (
              <Text sx={{ textAlign: "center", padding: "2em" }}>
                No secrets available. Contact your administrator to configure
                available secrets.
              </Text>
            ) : secretsByStatus.configured.length === 0 && secretsByStatus.unconfigured.length === 0 ? (
              <Text sx={{ textAlign: "center", padding: "2em" }}>
                No secrets found matching &quot;{searchTerm}&quot;
              </Text>
            ) : (
              <>
                {/* All secrets — configured first, then unconfigured */}
                {secretsByStatus.configured.length > 0 && (
                  <FlexColumn className="settings-section">
                    <Caption
                      sx={{
                        opacity: 0.7,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        marginBottom: "0.25em"
                      }}
                    >
                      Set API Keys
                    </Caption>
                    {secretsByStatus.configured.map((secret: SecretResponse) => (
                      <FlexRow
                        key={secret.key}
                        id={`secret-${secret.key}`}
                        align="center"
                        justify="space-between"
                        gap={1}
                        fullWidth
                        sx={{
                          padding: "0.6em 0",
                          borderBottom: `1px solid ${theme.vars.palette.divider}`,
                          "&:last-child": { borderBottom: "none" }
                        }}
                      >
                        <FlexColumn sx={{ flex: 1 }}>
                          <FlexRow align="center" gap={1} sx={{ marginBottom: "0.25em" }}>
                            <Text
                              size="small"
                              weight={600}
                            >
                              <code
                                style={{ color: "var(--palette-primary-main)" }}
                              >
                                {secret.key}
                              </code>
                            </Text>
                            <Caption
                              component="span"
                              sx={{
                                opacity: 0.5,
                                whiteSpace: "nowrap",
                                fontSize: `${theme.fontSizeTiny} !important`,
                                lineHeight: 1
                              }}
                            >
                              {secret.updated_at
                                ? new Date(secret.updated_at).toLocaleDateString()
                                : "Never"}
                            </Caption>
                          </FlexRow>
                          {secret.description && (
                            <Text className="description">
                              {secret.description}
                            </Text>
                          )}
                        </FlexColumn>
                        <FlexRow gap={0.5} sx={{ flexShrink: 0 }}>
                          <EditButton
                            onClick={() => {
                              setEditingSecret(secret);
                              setFormData({ key: secret.key, value: "" });
                              setOpenDialog(true);
                            }}
                            tooltip={`Update secret ${secret.key}`}
                            disabled={updateMutation.isPending}
                          />
                          <ToolbarIconButton
                            icon={<DeleteIcon fontSize="small" />}
                            tooltip="Delete secret"
                            size="small"
                            color="error"
                            onClick={handleDeleteClick}
                            data-secret-key={secret.key}
                            disabled={deleteMutation.isPending}
                            aria-label={`Delete secret ${secret.key}`}
                          />
                        </FlexRow>
                      </FlexRow>
                    ))}
                  </FlexColumn>
                )}

                {secretsByStatus.configured.length > 0 &&
                  secretsByStatus.unconfigured.length > 0 && (
                    <Divider
                      spacing="compact"
                      color="subtle"
                      aria-label="Configured and unconfigured API keys separator"
                    />
                  )}

                {/* Unconfigured Secrets Section */}
                {secretsByStatus.unconfigured.length > 0 && (
                  <FlexColumn className="settings-section">
                    <Caption
                      sx={{
                        opacity: 0.7,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        marginBottom: "0.25em"
                      }}
                    >
                      Unset API Keys
                    </Caption>
                    {secretsByStatus.unconfigured.map((secret: SecretResponse) => (
                      <FlexRow
                        key={secret.key}
                        id={`secret-${secret.key}`}
                        align="center"
                        justify="space-between"
                        gap={1}
                        fullWidth
                        sx={{
                          padding: "0.6em 0",
                          borderBottom: `1px solid ${theme.vars.palette.divider}`,
                          "&:last-child": { borderBottom: "none" }
                        }}
                      >
                        <FlexColumn sx={{ flex: 1 }}>
                          <Text
                            size="small"
                            weight={600}
                            sx={{ marginBottom: "0.25em" }}
                          >
                            <code
                              style={{ color: "var(--palette-primary-main)" }}
                            >
                              {secret.key}
                            </code>
                          </Text>
                          {secret.description && (
                            <Text className="description">
                              {secret.description}
                            </Text>
                          )}
                          <Caption
                            sx={{
                              opacity: 0.5,
                              fontStyle: "italic",
                              marginTop: "0.25em"
                            }}
                          >
                            Not set
                          </Caption>
                        </FlexColumn>
                        <FlexRow gap={0.5} sx={{ flexShrink: 0 }}>
                          <EditButton
                            onClick={() => {
                              setEditingSecret(secret);
                              setFormData({ key: secret.key, value: "" });
                              setOpenDialog(true);
                            }}
                            tooltip={`Set secret ${secret.key}`}
                            disabled={updateMutation.isPending}
                          />
                        </FlexRow>
                      </FlexRow>
                    ))}
                  </FlexColumn>
                )}
              </>
            )}
          </FlexColumn>
        </div>
      )}

      <Dialog
        open={openDialog}
        onClose={handleClose}
        fullWidth
        title={
          <>
            <LockIcon sx={{ color: "var(--palette-primary-main)" }} />
            {editingSecret?.is_configured ? "Update" : "Set"} {formData.key || "Secret"}
          </>
        }
        onConfirm={handleSave}
        onCancel={handleClose}
        confirmText={
          updateMutation.isPending
            ? "Saving..."
            : editingSecret?.is_configured
              ? "Update"
              : "Set"
        }
        cancelText="Cancel"
        confirmDisabled={updateMutation.isPending || !formData.value}
        isLoading={updateMutation.isPending}
        sx={{
          "& .MuiPaper-root": {
            borderRadius: "var(--rounded-xl)",
            backgroundImage: "none",
          }
        }}
      >
        <Box sx={{ marginTop: "1.5em" }}>
          <TextInput
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
            size="small"
          />
          <Caption
            sx={{
              display: "block",
              marginTop: "0.5em",
              opacity: 0.7
            }}
          >
            Keep this value secure and do not share it publicly.
          </Caption>
        </Box>
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
