/** @jsxImportSource @emotion/react */
import React, { useState, useCallback, useMemo, memo } from "react";
import {
  Typography,
  Box,
  TextField,
  Button,
  IconButton,
  CircularProgress,
  Collapse,
  Alert
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SaveIcon from "@mui/icons-material/Save";
import { css } from "@emotion/react";
import { useTheme, Theme } from "@mui/material/styles";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import useSecretsStore from "../../stores/SecretsStore";
import { useNotificationStore } from "../../stores/NotificationStore";

// Provider configuration for the 5 most popular providers
const PROVIDERS = [
  {
    key: "OPENAI_API_KEY",
    name: "OpenAI",
    description: "GPT-4, GPT-4o, DALL-E, and more",
    link: "https://platform.openai.com/api-keys",
    linkText: "Get API Key",
    placeholder: "sk-..."
  },
  {
    key: "ANTHROPIC_API_KEY",
    name: "Anthropic",
    description: "Claude 3.5 Sonnet, Claude 3 Opus",
    link: "https://console.anthropic.com/",
    linkText: "Get API Key",
    placeholder: "sk-ant-..."
  },
  {
    key: "GEMINI_API_KEY",
    name: "Google Gemini",
    description: "Gemini Pro, Gemini Flash",
    link: "https://aistudio.google.com/app/apikey",
    linkText: "Get API Key",
    placeholder: "AI..."
  },
  {
    key: "OPENROUTER_API_KEY",
    name: "OpenRouter",
    description: "Access multiple AI models via one API",
    link: "https://openrouter.ai/keys",
    linkText: "Get API Key",
    placeholder: "sk-or-..."
  },
  {
    key: "HF_TOKEN",
    name: "Hugging Face",
    description: "Inference API and model downloads",
    link: "https://huggingface.co/settings/tokens",
    linkText: "Get Token",
    placeholder: "hf_..."
  }
] as const;

type ProviderKey = (typeof PROVIDERS)[number]["key"];

const panelStyles = (theme: Theme) =>
  css({
    "&": {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      padding: "0.75em"
    },
    ".scrollable-content": {
      flex: 1,
      overflowY: "auto",
      overflowX: "hidden"
    },
    ".provider-setup-container": {
      padding: "1em"
    },
    ".provider-card": {
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      padding: "16px",
      marginBottom: "12px",
      background: theme.vars.palette.grey[900],
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      borderRadius: "12px",
      transition: "all 0.2s ease"
    },
    ".provider-card:hover": {
      borderColor: theme.vars.palette.grey[600],
      background: theme.vars.palette.grey[850]
    },
    ".provider-card.configured": {
      borderColor: theme.vars.palette.success.main,
      borderLeftWidth: "3px"
    },
    ".provider-card-header": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: "12px"
    },
    ".provider-info": {
      flex: 1,
      minWidth: 0
    },
    ".provider-title": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      margin: "0 0 4px 0",
      fontSize: "15px",
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    ".provider-description": {
      margin: 0,
      fontSize: "13px",
      color: theme.vars.palette.text.secondary,
      lineHeight: 1.4
    },
    ".provider-link": {
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      gap: "4px",
      fontSize: "12px",
      fontWeight: 500,
      color: theme.vars.palette.primary.main,
      textDecoration: "none",
      padding: "4px 8px",
      borderRadius: "6px",
      background: `${theme.vars.palette.primary.main}15`,
      transition: "all 0.2s",
      "&:hover": {
        background: `${theme.vars.palette.primary.main}25`,
        color: theme.vars.palette.primary.light
      }
    },
    ".provider-input-container": {
      display: "flex",
      gap: "8px",
      alignItems: "flex-start"
    },
    ".provider-input": {
      flex: 1
    },
    ".save-all-container": {
      marginTop: "16px",
      display: "flex",
      justifyContent: "flex-end"
    },
    ".collapse-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      cursor: "pointer",
      padding: "8px 12px",
      borderRadius: "8px",
      marginBottom: "8px",
      background: theme.vars.palette.grey[900],
      "&:hover": {
        background: theme.vars.palette.grey[850]
      }
    },
    ".section-title": {
      display: "flex",
      alignItems: "center",
      gap: "8px"
    },
    ".configured-count": {
      fontSize: "12px",
      color: theme.vars.palette.text.secondary,
      background: theme.vars.palette.grey[800],
      padding: "2px 8px",
      borderRadius: "12px"
    }
  });

const ProviderSetupPanel: React.FC = () => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const secrets = useSecretsStore((state) => state.secrets);
  const fetchSecrets = useSecretsStore((state) => state.fetchSecrets);
  const updateSecret = useSecretsStore((state) => state.updateSecret);
  const addNotification = useNotificationStore((state) => state.addNotification);

  const [isExpanded, setIsExpanded] = useState(true);
  const [apiKeys, setApiKeys] = useState<Record<ProviderKey, string>>({
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    GEMINI_API_KEY: "",
    OPENROUTER_API_KEY: "",
    HF_TOKEN: ""
  });
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Fetch secrets on mount
  const { isLoading } = useQuery({
    queryKey: ["secrets"],
    queryFn: () => fetchSecrets(),
    staleTime: 30000
  });

  // Get configured status from secrets
  const configuredKeys = useMemo(() => {
    const configured = new Set<string>();
    if (secrets) {
      secrets.forEach((secret) => {
        if (
          secret.is_configured &&
          PROVIDERS.some((p) => p.key === secret.key)
        ) {
          configured.add(secret.key);
        }
      });
    }
    return configured;
  }, [secrets]);

  const configuredCount = configuredKeys.size;

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      await updateSecret(key, value);
    },
    onSuccess: (_, variables) => {
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
        content: `${
          PROVIDERS.find((p) => p.key === variables.key)?.name || variables.key
        } API key saved`,
        alert: true
      });
      // Clear the input after successful save
      setApiKeys((prev) => ({ ...prev, [variables.key as ProviderKey]: "" }));
    },
    onError: (error: any, variables) => {
      addNotification({
        type: "error",
        content: `Failed to save ${variables.key}: ${error.message}`,
        dismissable: true
      });
    },
    onSettled: () => {
      setSavingKey(null);
    }
  });

  const handleSaveKey = useCallback(
    (key: ProviderKey) => {
      const value = apiKeys[key] || "";
      if (!value.trim()) {
        addNotification({
          type: "error",
          content: "Please enter an API key",
          dismissable: true
        });
        return;
      }
      setSavingKey(key);
      updateMutation.mutate({ key, value: value.trim() });
    },
    [apiKeys, updateMutation, addNotification]
  );

  const _handleKeyChange = useCallback((key: ProviderKey, value: string) => {
    setApiKeys((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleOpenLink = useCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleProviderSave = useCallback((providerKey: ProviderKey) => {
    handleSaveKey(providerKey);
  }, [handleSaveKey]);

  const handleProviderLink = useCallback((url: string, e: React.MouseEvent) => {
    e.preventDefault();
    handleOpenLink(url);
  }, [handleOpenLink]);

  return (
    <Box css={panelStyles(theme)} className="provider-setup-panel">
      <div className="scrollable-content">
        <Box className="provider-setup-container">
          <div
            className="collapse-header"
            onClick={handleToggleExpand}
          >
            <div className="section-title">
              <Typography
                variant="h6"
                sx={{ fontSize: "1em", fontWeight: 600 }}
              >
                AI Provider Setup
              </Typography>
              <span className="configured-count">
                {configuredCount}/{PROVIDERS.length} configured
              </span>
            </div>
            <IconButton size="small">
              {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </div>

          <Collapse in={isExpanded}>
            {isLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                <CircularProgress size={32} />
              </Box>
            ) : (
              <>
                <Typography
                  variant="body2"
                  sx={{ mb: 2, color: "text.secondary" }}
                >
                  Configure API keys for AI providers. Keys are encrypted and
                  stored securely.
                </Typography>

                {PROVIDERS.map((provider) => {
                  const isConfigured = configuredKeys.has(provider.key);
                  const isSaving = savingKey === provider.key;
                  const hasInput =
                    (apiKeys[provider.key] || "").trim().length > 0;

                  return (
                    <div
                      key={provider.key}
                      className={`provider-card ${
                        isConfigured ? "configured" : ""
                      }`}
                    >
                      <div className="provider-card-header">
                        <div className="provider-info">
                          <h4 className="provider-title">
                            {provider.name}
                            {isConfigured && (
                              <CheckCircleIcon
                                sx={{ fontSize: 16, color: "success.main" }}
                              />
                            )}
                          </h4>
                          <p className="provider-description">
                            {provider.description}
                          </p>
                        </div>
                        <a
                          href={provider.link}
                          className="provider-link"
                          onClick={handleProviderLink.bind(null, provider.link)}
                        >
                          {provider.linkText}
                          <OpenInNewIcon sx={{ fontSize: 14 }} />
                        </a>
                      </div>

                        <div className="provider-input-container">
                          <TextField
                            type="password"
                            size="small"
                            fullWidth
                            value={apiKeys[provider.key] || ""}
                            onChange={(e) =>
                              _handleKeyChange(provider.key, e.target.value)
                            }
                            placeholder={
                              isConfigured ? "••••••••••••" : provider.placeholder
                            }
                          />
                          <Button
                            variant="contained"
                            size="small"
                            onClick={handleProviderSave.bind(null, provider.key)}
                            disabled={!hasInput || isSaving}
                            startIcon={
                              isSaving ? (
                                <CircularProgress size={16} />
                              ) : (
                                <SaveIcon />
                              )
                            }
                            sx={{ minWidth: "100px" }}
                          >
                            {isSaving
                              ? "Saving..."
                              : isConfigured
                              ? "Update"
                              : "Save"}
                          </Button>
                        </div>
                    </div>
                  );
                })}

                {configuredCount === 0 && (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    No providers configured yet. Add at least one API key to use
                    remote AI models.
                  </Alert>
                )}

                {configuredCount > 0 && configuredCount < PROVIDERS.length && (
                  <Alert severity="success" sx={{ mt: 2 }}>
                    {configuredCount} provider{configuredCount > 1 ? "s" : ""}{" "}
                    configured! You can add more providers anytime.
                  </Alert>
                )}

                {configuredCount === PROVIDERS.length && (
                  <Alert severity="success" sx={{ mt: 2 }}>
                    All providers configured! You have access to all supported
                    AI models.
                  </Alert>
                )}
              </>
            )}
          </Collapse>
        </Box>
      </div>
    </Box>
  );
};

export default memo(ProviderSetupPanel);
