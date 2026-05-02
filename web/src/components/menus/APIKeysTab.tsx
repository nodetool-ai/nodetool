/** @jsxImportSource @emotion/react */
import React, { memo, useState, useCallback, useMemo } from "react";
import { Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import DeleteIcon from "@mui/icons-material/Delete";
import LockIcon from "@mui/icons-material/Lock";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ModelTrainingIcon from "@mui/icons-material/ModelTraining";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import CardGiftcardIcon from "@mui/icons-material/CardGiftcard";
import ShieldIcon from "@mui/icons-material/Shield";

import useSecretsStore from "../../stores/SecretsStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import type { SecretResponse } from "../../stores/ApiTypes";
import {
  FlexColumn,
  FlexRow,
  Text,
  Caption,
  Tooltip,
  EditorButton,
  Dialog,
  TextInput,
  Card,
  Chip
} from "../ui_primitives";
import { ToolbarIconButton } from "../ui_primitives/ToolbarIconButton";
import ConfirmDialog from "../dialogs/ConfirmDialog";

// Provider icons from @lobehub/icons-static-svg
import openaiIcon from "@lobehub/icons-static-svg/icons/openai.svg";
import anthropicIcon from "@lobehub/icons-static-svg/icons/anthropic.svg";
import openrouterIcon from "@lobehub/icons-static-svg/icons/openrouter.svg";
import cerebrasColorIcon from "@lobehub/icons-static-svg/icons/cerebras-color.svg";
import togetherColorIcon from "@lobehub/icons-static-svg/icons/together-color.svg";
import deepseekColorIcon from "@lobehub/icons-static-svg/icons/deepseek-color.svg";
import groqIcon from "@lobehub/icons-static-svg/icons/groq.svg";
import mistralColorIcon from "@lobehub/icons-static-svg/icons/mistral-color.svg";
import geminiColorIcon from "@lobehub/icons-static-svg/icons/gemini-color.svg";
import xaiIcon from "@lobehub/icons-static-svg/icons/xai.svg";
import huggingfaceColorIcon from "@lobehub/icons-static-svg/icons/huggingface-color.svg";
import replicateIcon from "@lobehub/icons-static-svg/icons/replicate.svg";
import falColorIcon from "@lobehub/icons-static-svg/icons/fal-color.svg";
import elevenlabsIcon from "@lobehub/icons-static-svg/icons/elevenlabs.svg";
import moonshotIcon from "@lobehub/icons-static-svg/icons/moonshot.svg";


interface ProviderMeta {
  key: string;
  name: string;
  description: string;
  category: "recommended" | "other";
  tag?: string;
  docsUrl: string;
  icon: string;
  /** Mono (single-color black) icon — needs inversion in dark mode to be visible. */
  mono?: boolean;
}

const PROVIDER_META: ProviderMeta[] = [
  {
    key: "OPENAI_API_KEY",
    name: "OpenAI",
    description: "GPT models, images, embeddings, and more.",
    category: "recommended",
    tag: "Popular",
    docsUrl: "https://platform.openai.com/docs",
    icon: openaiIcon,
    mono: true
  },
  {
    key: "ANTHROPIC_API_KEY",
    name: "Anthropic",
    description: "Claude models for advanced reasoning.",
    category: "recommended",
    docsUrl: "https://docs.anthropic.com",
    icon: anthropicIcon,
    mono: true
  },
  {
    key: "OPENROUTER_API_KEY",
    name: "OpenRouter",
    description: "Access multiple AI models through one API.",
    category: "recommended",
    docsUrl: "https://openrouter.ai/docs",
    icon: openrouterIcon,
    mono: true
  },
  {
    key: "CEREBRAS_API_KEY",
    name: "Cerebras",
    description: "Fast LLM inference on Cerebras hardware.",
    category: "other",
    docsUrl: "https://docs.cerebras.ai/",
    icon: cerebrasColorIcon
  },
  {
    key: "TOGETHER_API_KEY",
    name: "Together AI",
    description: "Open-source models through Together API.",
    category: "other",
    docsUrl: "https://docs.together.ai/",
    icon: togetherColorIcon
  },
  {
    key: "DEEPSEEK_API_KEY",
    name: "DeepSeek",
    description: "State-of-the-art open models.",
    category: "other",
    docsUrl: "https://platform.deepseek.com/docs",
    icon: deepseekColorIcon
  },
  {
    key: "GROQ_API_KEY",
    name: "Groq",
    description: "Ultra-fast LLM inference on LPU hardware.",
    category: "other",
    docsUrl: "https://console.groq.com/docs",
    icon: groqIcon,
    mono: true
  },
  {
    key: "MISTRAL_API_KEY",
    name: "Mistral",
    description: "Mistral AI models and embeddings.",
    category: "other",
    docsUrl: "https://docs.mistral.ai/",
    icon: mistralColorIcon
  },
  {
    key: "GEMINI_API_KEY",
    name: "Gemini",
    description: "Google Gemini AI models and services.",
    category: "other",
    docsUrl: "https://ai.google.dev/docs",
    icon: geminiColorIcon
  },
  {
    key: "XAI_API_KEY",
    name: "xAI",
    description: "Grok models via xAI's API.",
    category: "other",
    docsUrl: "https://docs.x.ai/",
    icon: xaiIcon,
    mono: true
  },
  {
    key: "HF_TOKEN",
    name: "HuggingFace",
    description: "Inference providers and model hub access.",
    category: "other",
    docsUrl: "https://huggingface.co/docs",
    icon: huggingfaceColorIcon
  },
  {
    key: "REPLICATE_API_TOKEN",
    name: "Replicate",
    description: "Run models on Replicate's cloud infrastructure.",
    category: "other",
    docsUrl: "https://replicate.com/docs",
    icon: replicateIcon,
    mono: true
  },
  {
    key: "FAL_API_KEY",
    name: "FAL",
    description: "Serverless AI image and video generation.",
    category: "other",
    docsUrl: "https://fal.ai/docs",
    icon: falColorIcon
  },
  {
    key: "ELEVENLABS_API_KEY",
    name: "ElevenLabs",
    description: "High-quality text-to-speech services.",
    category: "other",
    docsUrl: "https://elevenlabs.io/docs",
    icon: elevenlabsIcon,
    mono: true
  },
  {
    key: "KIMI_API_KEY",
    name: "Kimi",
    description: "Moonshot AI models via Kimi API.",
    category: "other",
    docsUrl: "https://platform.moonshot.cn/docs",
    icon: moonshotIcon,
    mono: true
  }
];

const getProviderMeta = (key: string): ProviderMeta | undefined =>
  PROVIDER_META.find((p) => p.key === key);

const SETTING_LINKS: Record<string, string> = {
  OPENAI_API_KEY: "https://platform.openai.com/api-keys",
  ANTHROPIC_API_KEY: "https://console.anthropic.com/",
  GEMINI_API_KEY: "https://aistudio.google.com/app/apikey",
  OPENROUTER_API_KEY: "https://openrouter.ai/keys",
  HF_TOKEN: "https://huggingface.co/settings/tokens",
  REPLICATE_API_TOKEN: "https://replicate.com/account/api-tokens",
  ELEVENLABS_API_KEY: "https://elevenlabs.io/subscription",
  FAL_API_KEY: "https://fal.ai/dashboard/keys",
  CEREBRAS_API_KEY: "https://cloud.cerebras.ai/",
  TOGETHER_API_KEY: "https://api.together.ai/settings/api-keys",
  DEEPSEEK_API_KEY: "https://platform.deepseek.com/api-keys",
  GROQ_API_KEY: "https://console.groq.com/keys",
  MISTRAL_API_KEY: "https://console.mistral.ai/api-keys",
  XAI_API_KEY: "https://console.x.ai/",
  KIMI_API_KEY: "https://platform.moonshot.cn/console/api-keys"
};

/* ------------------------------------------------------------------ */
//  Provider card
/* ------------------------------------------------------------------ */

interface ProviderCardProps {
  secret: SecretResponse;
  meta: ProviderMeta;
  onConnect: (secret: SecretResponse) => void;
  onManage: (secret: SecretResponse) => void;
  onDelete: (secret: SecretResponse) => void;
}

const ProviderCard = memo(function ProviderCard({
  secret,
  meta,
  onConnect,
  onManage,
  onDelete
}: ProviderCardProps) {
  const theme = useTheme();
  const isConnected = secret.is_configured;

  const handleConnect = useCallback(() => {
    onConnect(secret);
  }, [onConnect, secret]);

  const handleManage = useCallback(() => {
    onManage(secret);
  }, [onManage, secret]);

  const handleDelete = useCallback(() => {
    onDelete(secret);
  }, [onDelete, secret]);

  return (
    <Card
      variant="outlined"
      padding="compact"
      sx={{
        display: "flex",
        alignItems: "stretch",
        gap: "0.75rem",
        borderRadius: "var(--rounded-lg)",
        border: `1px solid ${theme.vars.palette.divider}`,
        backgroundColor: theme.vars.palette.background.paper,
        transition: "border-color 0.2s ease, background-color 0.2s ease",
        "&:hover": {
          borderColor: theme.vars.palette.grey[700],
          backgroundColor: theme.vars.palette.action.hover
        }
      }}
    >
      {/* Icon */}
      <FlexRow
        align="center"
        justify="center"
        sx={{
          width: 48,
          height: 48,
          minWidth: 48,
          borderRadius: "var(--rounded-lg)",
          backgroundColor: theme.vars.palette.background.default,
          overflow: "hidden",
          marginTop: "2px"
        }}
      >
        <Box
          component="img"
          src={meta.icon}
          alt={meta.name}
          sx={{
            width: 28,
            height: 28,
            objectFit: "contain",
            ...(meta.mono && theme.applyStyles("dark", {
              filter: "invert(1)"
            }))
          }}
        />
      </FlexRow>

      {/* Info */}
      <FlexColumn sx={{ flex: 1, minWidth: 0, gap: "2px", justifyContent: "center" }}>
        <FlexRow align="center" gap={0.5}>
          <Text size="small" weight={600}>
            {meta.name}
          </Text>
          {meta.tag && (
            <Chip
              label={meta.tag}
              compact
              variant="outlined"
              color="primary"
              sx={{
                height: 18,
                fontSize: theme.fontSizeTinyer,
                fontWeight: 600,
                borderColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.4)`
              }}
            />
          )}
        </FlexRow>
        <Caption sx={{ opacity: 0.55, lineHeight: 1.4 }}>
          {meta.description}
        </Caption>
      </FlexColumn>

      {/* Status + Actions — right-aligned, vertically distributed */}
      <FlexColumn
        align="flex-end"
        justify="space-between"
        gap={0.25}
        sx={{ flexShrink: 0, minHeight: "100%" }}
      >
        <FlexColumn align="flex-end" gap={0.25}>
          <FlexRow align="center" gap={0.5}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: isConnected
                  ? theme.vars.palette.success.main
                  : theme.vars.palette.error.main,
                display: "inline-block"
              }}
            />
            <Caption
              sx={{
                color: isConnected
                  ? theme.vars.palette.success.main
                  : theme.vars.palette.error.main,
                fontWeight: 500,
                fontSize: theme.fontSizeTiny
              }}
            >
              {isConnected ? "Connected" : "Not connected"}
            </Caption>
          </FlexRow>
          {isConnected && secret.updated_at && (
            <Caption sx={{ opacity: 0.45, fontSize: theme.fontSizeTinyer }}>
              Last used{" "}
              {new Date(secret.updated_at).toLocaleDateString()}
            </Caption>
          )}
          {!isConnected && (
            <Caption sx={{ opacity: 0.45, fontSize: theme.fontSizeTinyer }}>
              Add your API key to get started.
            </Caption>
          )}
        </FlexColumn>

        <FlexRow align="center" gap={0.5} sx={{ marginTop: "4px" }}>
          <EditorButton
            density="compact"
            variant="text"
            size="small"
            endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
            onClick={() => window.open(meta.docsUrl, "_blank", "noopener,noreferrer")}
          >
            Docs
          </EditorButton>

          {isConnected ? (
            <>
              <EditorButton
                density="compact"
                variant="outlined"
                size="small"
                onClick={handleManage}
              >
                Manage
              </EditorButton>
              <Tooltip title="Delete key">
                <ToolbarIconButton
                  icon={<DeleteIcon fontSize="small" />}
                  size="small"
                  color="error"
                  onClick={handleDelete}
                  aria-label={`Delete ${meta.name} API key`}
                />
              </Tooltip>
            </>
          ) : (
            <EditorButton
              density="compact"
              variant="contained"
              size="small"
              onClick={handleConnect}
            >
              Connect
            </EditorButton>
          )}
        </FlexRow>
      </FlexColumn>
    </Card>
  );
});

/* ------------------------------------------------------------------ */
//  Get Started banner
/* ------------------------------------------------------------------ */

const GetStartedBanner = memo(function GetStartedBanner({
  theme
}: {
  theme: Theme;
}) {
  return (
    <Card
      variant="outlined"
      padding="comfortable"
      sx={{
        borderRadius: "var(--rounded-xl)",
        border: `1px solid ${theme.vars.palette.divider}`,
        backgroundColor: theme.vars.palette.background.paper,
        marginBottom: "1.5rem"
      }}
    >
      <FlexRow justify="space-between" align="flex-start" gap={2} wrap>
        <FlexColumn sx={{ maxWidth: 280 }}>
          <Text size="normal" weight={600} sx={{ marginBottom: "4px" }}>
            Get started
          </Text>
          <Caption sx={{ opacity: 0.6, lineHeight: 1.5 }}>
            Connect a provider to unlock powerful models and features.
          </Caption>
        </FlexColumn>

        <FlexRow gap={2} align="flex-start" sx={{ flexWrap: "wrap" }}>
          {[
            {
              num: 1,
              title: "Choose a provider",
              desc: "Select the provider you want to use."
            },
            {
              num: 2,
              title: "Add your API key",
              desc: "Paste your key securely and test the connection."
            },
            {
              num: 3,
              title: "Start building",
              desc: "Use models in the editor and build workflows."
            }
          ].map((step) => (
            <FlexRow key={step.num} align="flex-start" gap={1}>
              <FlexRow
                align="center"
                justify="center"
                sx={{
                  width: 28,
                  height: 28,
                  minWidth: 28,
                  borderRadius: "50%",
                  border: `1px solid ${theme.vars.palette.divider}`,
                  fontSize: theme.fontSizeSmall,
                  fontWeight: 600,
                  color: theme.vars.palette.text.secondary
                }}
              >
                {step.num}
              </FlexRow>
              <FlexColumn sx={{ maxWidth: 160 }}>
                <Text size="tiny" weight={600}>
                  {step.title}
                </Text>
                <Caption sx={{ opacity: 0.5, lineHeight: 1.4, fontSize: theme.fontSizeTinyer }}>
                  {step.desc}
                </Caption>
              </FlexColumn>
            </FlexRow>
          ))}
        </FlexRow>
      </FlexRow>
    </Card>
  );
});

/* ------------------------------------------------------------------ */
//  Section title with count
/* ------------------------------------------------------------------ */

const SectionTitle = memo(function SectionTitle({
  title,
  count,
  theme
}: {
  title: string;
  count: number;
  theme: Theme;
}) {
  return (
    <FlexRow align="center" gap={0.75} sx={{ marginBottom: "0.75rem" }}>
      <Text size="normal" weight={600}>
        {title}
      </Text>
      <Caption
        sx={{
          fontSize: theme.fontSizeTiny,
          opacity: 0.5,
          fontWeight: 600,
          backgroundColor: theme.vars.palette.action.selected,
          padding: "1px 8px",
          borderRadius: "var(--rounded-sm)"
        }}
      >
        {count}
      </Caption>
    </FlexRow>
  );
});

/* ------------------------------------------------------------------ */
//  Main content
/* ------------------------------------------------------------------ */

export interface APIKeysTabContentProps {
  searchTerm?: string;
}

export const APIKeysTabContent = memo(function APIKeysTabContent({
  searchTerm = ""
}: APIKeysTabContentProps) {
  const theme = useTheme();
  const secrets = useSecretsStore((state) => state.secrets);
  const safeSecrets = useMemo(() => secrets ?? [], [secrets]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSecret, setEditingSecret] = useState<SecretResponse | null>(null);
  const [formValue, setFormValue] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [secretToDelete, setSecretToDelete] = useState<SecretResponse | null>(null);

  const addNotification = useNotificationStore((state) => state.addNotification);
  const updateSecret = useSecretsStore((state) => state.updateSecret);
  const deleteSecret = useSecretsStore((state) => state.deleteSecret);

  const lowerSearch = searchTerm.toLowerCase().trim();

  // Match secrets to known provider metadata
  const matchedProviders = useMemo(() => {
    const results: { secret: SecretResponse; meta: ProviderMeta }[] = [];
    for (const secret of safeSecrets) {
      const meta = getProviderMeta(secret.key);
      if (meta) {
        if (!lowerSearch || meta.name.toLowerCase().includes(lowerSearch) || meta.description.toLowerCase().includes(lowerSearch)) {
          results.push({ secret, meta });
        }
      }
    }
    return results;
  }, [safeSecrets, lowerSearch]);

  const recommended = matchedProviders.filter((p) => p.meta.category === "recommended");
  const others = matchedProviders.filter((p) => p.meta.category === "other");

  // Also show unconfigured providers from our meta list that aren't in secrets
  const configuredKeys = useMemo(
    () => new Set(safeSecrets.map((s) => s.key)),
    [safeSecrets]
  );
  const unconfiguredMeta = useMemo(() => {
    return PROVIDER_META.filter(
      (p) =>
        !configuredKeys.has(p.key) &&
        (!lowerSearch ||
          p.name.toLowerCase().includes(lowerSearch) ||
          p.description.toLowerCase().includes(lowerSearch))
    );
  }, [configuredKeys, lowerSearch]);

  const unconfiguredRecommended = unconfiguredMeta.filter((p) => p.category === "recommended");
  const unconfiguredOthers = unconfiguredMeta.filter((p) => p.category === "other");

  const handleConnect = useCallback((secret: SecretResponse) => {
    setEditingSecret(secret);
    setFormValue("");
    setDialogOpen(true);
  }, []);

  const handleManage = useCallback((secret: SecretResponse) => {
    setEditingSecret(secret);
    setFormValue("");
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback((secret: SecretResponse) => {
    setSecretToDelete(secret);
    setDeleteDialogOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editingSecret || !formValue) {
      addNotification({
        type: "error",
        content: "Secret value is required",
        dismissable: true
      });
      return;
    }
    try {
      await updateSecret(editingSecret.key, formValue);
      addNotification({
        type: "success",
        content: `${getProviderMeta(editingSecret.key)?.name || editingSecret.key} API key updated`,
        alert: true
      });
      setDialogOpen(false);
      setEditingSecret(null);
      setFormValue("");
    } catch (err) {
      addNotification({
        type: "error",
        content: `Failed to update secret: ${err instanceof Error ? err.message : String(err)}`,
        dismissable: true
      });
    }
  }, [editingSecret, formValue, updateSecret, addNotification]);

  const confirmDelete = useCallback(async () => {
    if (!secretToDelete) return;
    try {
      await deleteSecret(secretToDelete.key);
      addNotification({
        type: "success",
        content: `${getProviderMeta(secretToDelete.key)?.name || secretToDelete.key} API key deleted`,
        alert: true
      });
    } catch (err) {
      addNotification({
        type: "error",
        content: `Failed to delete secret: ${err instanceof Error ? err.message : String(err)}`,
        dismissable: true
      });
    }
    setDeleteDialogOpen(false);
    setSecretToDelete(null);
  }, [secretToDelete, deleteSecret, addNotification]);

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    setEditingSecret(null);
    setFormValue("");
  }, []);

  const handleCloseDelete = useCallback(() => {
    setDeleteDialogOpen(false);
    setSecretToDelete(null);
  }, []);

  const allRecommended = [...recommended, ...unconfiguredRecommended.map((meta) => ({
    secret: {
      key: meta.key,
      is_configured: false,
      description: meta.description,
      user_id: null,
      created_at: null,
      updated_at: null
    } as SecretResponse,
    meta
  }))];

  const allOthers = [...others, ...unconfiguredOthers.map((meta) => ({
    secret: {
      key: meta.key,
      is_configured: false,
      description: meta.description,
      user_id: null,
      created_at: null,
      updated_at: null
    } as SecretResponse,
    meta
  }))];

  const hasContent = allRecommended.length > 0 || allOthers.length > 0;

  return (
    <FlexColumn sx={{ gap: "1.5rem" }}>
      <GetStartedBanner theme={theme} />

      {!hasContent && lowerSearch && (
        <Text sx={{ textAlign: "center", padding: "2em", opacity: 0.6 }}>
          No providers found matching &quot;{searchTerm}&quot;
        </Text>
      )}

      {allRecommended.length > 0 && (
        <div>
          <SectionTitle
            title="Recommended Providers"
            count={allRecommended.length}
            theme={theme}
          />
          <FlexColumn sx={{ gap: "0.6rem" }}>
            {allRecommended.map(({ secret, meta }) => (
              <ProviderCard
                key={meta.key}
                secret={secret}
                meta={meta}
                onConnect={handleConnect}
                onManage={handleManage}
                onDelete={handleDelete}
              />
            ))}
          </FlexColumn>
        </div>
      )}

      {allOthers.length > 0 && (
        <div>
          <SectionTitle
            title="Other Providers"
            count={allOthers.length}
            theme={theme}
          />
          <FlexColumn sx={{ gap: "0.6rem" }}>
            {allOthers.map(({ secret, meta }) => (
              <ProviderCard
                key={meta.key}
                secret={secret}
                meta={meta}
                onConnect={handleConnect}
                onManage={handleManage}
                onDelete={handleDelete}
              />
            ))}
          </FlexColumn>
        </div>
      )}

      {/* Edit / Connect dialog */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        fullWidth
        title={
          <FlexRow align="center" gap={1}>
            <LockIcon sx={{ color: "var(--palette-primary-main)", fontSize: 20 }} />
            <Text size="normal" weight={600}>
              {editingSecret?.is_configured ? "Update" : "Connect"}{" "}
              {editingSecret ? getProviderMeta(editingSecret.key)?.name || editingSecret.key : ""}
            </Text>
          </FlexRow>
        }
        onConfirm={handleSave}
        onCancel={handleCloseDialog}
        confirmText={editingSecret?.is_configured ? "Update" : "Connect"}
        cancelText="Cancel"
        confirmDisabled={!formValue}
      >
        <FlexColumn sx={{ marginTop: "1em", gap: "0.75em" }}>
          <TextInput
            label="API Key"
            type="password"
            value={formValue}
            onChange={(e) => setFormValue(e.target.value)}
            fullWidth
            placeholder="Paste your API key here"
            autoFocus
            variant="outlined"
            size="small"
          />
          <Caption sx={{ opacity: 0.6 }}>
            Your key will be encrypted and stored securely. Never share it publicly.
          </Caption>
        </FlexColumn>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={handleCloseDelete}
        onConfirm={confirmDelete}
        title="Delete API Key"
        content={`Are you sure you want to delete the ${secretToDelete ? getProviderMeta(secretToDelete.key)?.name || secretToDelete.key : ""} API key?`}
        confirmText="Delete"
        cancelText="Cancel"
      />
    </FlexColumn>
  );
});

/* ------------------------------------------------------------------ */
//  Security notice (rendered in left sidebar footer)
/* ------------------------------------------------------------------ */

export const SecurityNotice = memo(function SecurityNotice() {
  const theme = useTheme();
  return (
    <Card
      variant="outlined"
      padding="normal"
      sx={{
        borderRadius: "var(--rounded-lg)",
        border: `1px solid ${theme.vars.palette.divider}`,
        backgroundColor: `rgba(${theme.vars.palette.success.mainChannel} / 0.06)`
      }}
    >
      <FlexRow align="flex-start" gap={1}>
        <ShieldIcon
          sx={{
            fontSize: 18,
            color: theme.vars.palette.success.main,
            marginTop: "2px",
            flexShrink: 0
          }}
        />
        <FlexColumn sx={{ minWidth: 0 }}>
          <Text size="tiny" weight={600}>
            Your secrets are safe
          </Text>
          <Caption sx={{ opacity: 0.6, lineHeight: 1.4, marginTop: "2px", fontSize: theme.fontSizeTinyer }}>
            All API keys are encrypted in the database and never exposed.
          </Caption>
          <EditorButton
            density="compact"
            variant="text"
            size="small"
            endIcon={<OpenInNewIcon sx={{ fontSize: 12 }} />}
            onClick={() =>
              window.open(
                "https://github.com/nodetool-ai/nodetool/blob/main/docs/security.md",
                "_blank",
                "noopener,noreferrer"
              )
            }
            sx={{ alignSelf: "flex-start", marginTop: "4px", fontSize: theme.fontSizeTiny }}
          >
            Learn more
          </EditorButton>
        </FlexColumn>
      </FlexRow>
    </Card>
  );
});

/* ------------------------------------------------------------------ */
//  Right sidebar
/* ------------------------------------------------------------------ */

export const APIKeysRightSidebar = memo(function APIKeysRightSidebar() {
  const theme = useTheme();

  const quickLinks = [
    {
      icon: <ModelTrainingIcon sx={{ fontSize: 18 }} />,
      title: "Supported Models",
      subtitle: "See models by provider",
      href: "https://docs.nodetool.ai/models-and-providers"
    },
    {
      icon: <MenuBookIcon sx={{ fontSize: 18 }} />,
      title: "API Documentation",
      subtitle: "Provider guides & links",
      href: "https://docs.nodetool.ai/providers"
    },
    {
      icon: <HelpOutlineIcon sx={{ fontSize: 18 }} />,
      title: "Troubleshooting",
      subtitle: "Common issues & fixes",
      href: "https://docs.nodetool.ai/troubleshooting.html"
    }
  ];

  return (
    <FlexColumn
      sx={{
        width: 280,
        minWidth: 280,
        padding: "1.5rem 1rem 1.5rem 0",
        gap: "1rem",
        overflowY: "auto",
        overflowX: "hidden"
      }}
    >
      {/* Quick Links */}
      <Card
        variant="outlined"
        padding="normal"
        sx={{
          borderRadius: "var(--rounded-lg)",
          border: `1px solid ${theme.vars.palette.divider}`
        }}
      >
        <Text size="small" weight={600} sx={{ marginBottom: "0.75rem" }}>
          Quick Links
        </Text>
        <FlexColumn sx={{ gap: "2px" }}>
          {quickLinks.map((link) => (
            <FlexRow
              key={link.title}
              align="center"
              gap={0.75}
              sx={{
                padding: "8px 10px",
                borderRadius: "var(--rounded-md)",
                cursor: "pointer",
                transition: "background-color 0.15s ease",
                "&:hover": {
                  backgroundColor: theme.vars.palette.action.hover
                }
              }}
              onClick={() => {
                if (link.href.startsWith("http")) {
                  window.open(link.href, "_blank", "noopener,noreferrer");
                } else {
                  window.location.href = link.href;
                }
              }}
            >
              <FlexRow
                align="center"
                justify="center"
                sx={{
                  color: theme.vars.palette.primary.main,
                  fontSize: 18,
                  width: 22,
                  flexShrink: 0
                }}
              >
                {link.icon}
              </FlexRow>
              <FlexColumn sx={{ flex: 1, minWidth: 0 }}>
                <Text size="tiny" weight={500}>
                  {link.title}
                </Text>
                <Caption sx={{ opacity: 0.5, fontSize: theme.fontSizeTinyer, lineHeight: 1.3 }}>
                  {link.subtitle}
                </Caption>
              </FlexColumn>
              <Text
                sx={{
                  color: theme.vars.palette.text.secondary,
                  fontSize: 16,
                  flexShrink: 0,
                  marginLeft: "4px"
                }}
              >
                ›
              </Text>
            </FlexRow>
          ))}
        </FlexColumn>
      </Card>

      {/* Promo card */}
      <Card
        variant="outlined"
        padding="normal"
        sx={{
          borderRadius: "var(--rounded-lg)",
          border: `1px solid ${theme.vars.palette.divider}`,
          background: `linear-gradient(135deg, rgba(${theme.vars.palette.primary.mainChannel} / 0.08) 0%, rgba(${theme.vars.palette.primary.mainChannel} / 0.02) 100%)`
        }}
      >
        <FlexRow align="center" gap={1} sx={{ marginBottom: "0.5rem" }}>
          <CardGiftcardIcon
            sx={{ color: theme.vars.palette.primary.main, fontSize: 20 }}
          />
          <Text size="small" weight={600}>
            Need API credits?
          </Text>
        </FlexRow>
        <Caption sx={{ opacity: 0.6, lineHeight: 1.5, marginBottom: "0.75rem" }}>
          Get free credits and offers from our partner providers.
        </Caption>
        <EditorButton
          density="compact"
          variant="outlined"
          size="small"
          fullWidth
          endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
          onClick={() =>
            window.open(
              "https://openrouter.ai/",
              "_blank",
              "noopener,noreferrer"
            )
          }
        >
          View offers
        </EditorButton>
      </Card>
    </FlexColumn>
  );
});
