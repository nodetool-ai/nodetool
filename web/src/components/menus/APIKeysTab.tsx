/** @jsxImportSource @emotion/react */
import React, { memo, useState, useCallback, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import DeleteIcon from "@mui/icons-material/Delete";
import LockIcon from "@mui/icons-material/Lock";
import LoginIcon from "@mui/icons-material/Login";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ModelTrainingIcon from "@mui/icons-material/ModelTraining";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import CardGiftcardIcon from "@mui/icons-material/CardGiftcard";
import ShieldIcon from "@mui/icons-material/Shield";

import useSecretsStore from "../../stores/SecretsStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useOAuthConnection } from "../../hooks/useOAuthConnection";
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
  Chip,
  Box,
  EmptyState,
  CollapsibleSection,
  BORDER_RADIUS,
  MOTION,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import { ToolbarIconButton } from "../ui_primitives";
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
import topazlabsIcon from "@lobehub/icons-static-svg/icons/topazlabs.svg";
import atlascloudIcon from "@lobehub/icons-static-svg/icons/atlascloud.svg";
import zhipuColorIcon from "@lobehub/icons-static-svg/icons/zhipu-color.svg";
import minimaxColorIcon from "@lobehub/icons-static-svg/icons/minimax-color.svg";
import meshyColorIcon from "@lobehub/icons-static-svg/icons/meshy-color.svg";
import githubIcon from "@lobehub/icons-static-svg/icons/github.svg";
import googleColorIcon from "@lobehub/icons-static-svg/icons/google-color.svg";
import evolinkIcon from "../../icons/evolink.svg";
import gmiIcon from "../../icons/gmi.svg";


interface ProviderMeta {
  key: string;
  name: string;
  description: string;
  section: "popular" | "language" | "media" | "gateways" | "search" | "compute" | "advanced";
  tag?: string;
  docsUrl: string;
  icon?: string;
  /** Mono (single-color black) icon — needs inversion in dark mode to be visible. */
  mono?: boolean;
  /** Extra hint rendered under the description (e.g. required key scope). */
  note?: string;
  /** Provider supports OAuth sign-in in place of (or alongside) an API key. */
  oauth?: "openai" | "hf";
  /** Multi-field credentials (e.g. login + password). Single-field providers omit this. */
  fields?: Array<{ key: string; label: string; secret?: boolean }>;
}

const PROVIDER_META: ProviderMeta[] = [
  {
    key: "OPENAI_API_KEY",
    name: "OpenAI",
    description: "GPT models, images, embeddings, and more.",
    section: "popular",
    tag: "Popular",
    docsUrl: "https://platform.openai.com/docs",
    icon: openaiIcon,
    mono: true,
    oauth: "openai"
  },
  {
    key: "ANTHROPIC_API_KEY",
    name: "Anthropic",
    description: "Claude models for advanced reasoning.",
    section: "popular",
    docsUrl: "https://docs.anthropic.com",
    icon: anthropicIcon,
    mono: true
  },
  {
    key: "OPENROUTER_API_KEY",
    name: "OpenRouter",
    description: "Access multiple AI models through one API.",
    section: "popular",
    docsUrl: "https://openrouter.ai/docs",
    icon: openrouterIcon,
    mono: true
  },
  {
    key: "GEMINI_API_KEY",
    name: "Gemini",
    description: "Google Gemini AI models and services.",
    section: "popular",
    docsUrl: "https://ai.google.dev/docs",
    icon: geminiColorIcon
  },
  {
    key: "GROQ_API_KEY",
    name: "Groq",
    description: "Ultra-fast LLM inference on LPU hardware.",
    section: "language",
    docsUrl: "https://console.groq.com/docs",
    icon: groqIcon,
    mono: true
  },
  {
    key: "MISTRAL_API_KEY",
    name: "Mistral",
    description: "Mistral AI models and embeddings.",
    section: "language",
    docsUrl: "https://docs.mistral.ai/",
    icon: mistralColorIcon
  },
  {
    key: "DEEPSEEK_API_KEY",
    name: "DeepSeek",
    description: "State-of-the-art open models.",
    section: "language",
    docsUrl: "https://platform.deepseek.com/docs",
    icon: deepseekColorIcon
  },
  {
    key: "XAI_API_KEY",
    name: "xAI",
    description: "Grok models via xAI's API.",
    section: "language",
    docsUrl: "https://docs.x.ai/",
    icon: xaiIcon,
    mono: true
  },
  {
    key: "CEREBRAS_API_KEY",
    name: "Cerebras",
    description: "Fast LLM inference on Cerebras hardware.",
    section: "language",
    docsUrl: "https://docs.cerebras.ai/",
    icon: cerebrasColorIcon
  },
  {
    key: "TOGETHER_API_KEY",
    name: "Together AI",
    description: "Open-source models through Together API.",
    section: "language",
    docsUrl: "https://docs.together.ai/",
    icon: togetherColorIcon
  },
  {
    key: "KIMI_API_KEY",
    name: "Kimi",
    description: "Moonshot AI models via Kimi API.",
    section: "language",
    docsUrl: "https://platform.moonshot.cn/docs",
    icon: moonshotIcon,
    mono: true
  },
  {
    key: "ZHIPU_API_KEY",
    name: "Z.AI",
    description: "GLM models via Z.AI's OpenAI-compatible API.",
    section: "language",
    docsUrl: "https://open.bigmodel.cn/",
    icon: zhipuColorIcon
  },
  {
    key: "MINIMAX_API_KEY",
    name: "MiniMax",
    description: "MiniMax AI models.",
    section: "language",
    docsUrl: "https://platform.minimax.chat/",
    icon: minimaxColorIcon
  },
  {
    key: "HF_TOKEN",
    name: "HuggingFace",
    description: "Inference providers and model hub access.",
    section: "language",
    docsUrl: "https://huggingface.co/docs",
    icon: huggingfaceColorIcon,
    oauth: "hf"
  },
  {
    key: "FAL_API_KEY",
    name: "FAL",
    description: "Serverless AI image and video generation.",
    section: "media",
    docsUrl: "https://fal.ai/docs",
    icon: falColorIcon,
    note: 'For exact cost tracking, use an admin key (fal.ai dashboard → Keys → scope "Admin"). NodeTool reads each request\'s actual billing from FAL; a standard key only yields estimates.'
  },
  {
    key: "REPLICATE_API_TOKEN",
    name: "Replicate",
    description: "Run models on Replicate's cloud infrastructure.",
    section: "media",
    docsUrl: "https://replicate.com/docs",
    icon: replicateIcon,
    mono: true
  },
  {
    key: "ELEVENLABS_API_KEY",
    name: "ElevenLabs",
    description: "High-quality text-to-speech services.",
    section: "media",
    docsUrl: "https://elevenlabs.io/docs",
    icon: elevenlabsIcon,
    mono: true
  },
  {
    key: "TOPAZ_API_KEY",
    name: "Topaz",
    description: "Topaz Labs image and video enhancement.",
    section: "media",
    docsUrl: "https://developer.topazlabs.com/",
    icon: topazlabsIcon,
    mono: true
  },
  {
    key: "ATLASCLOUD_API_KEY",
    name: "AtlasCloud",
    description: "GPT Image 2, Nano Banana, and Seedance 2.0 video generation.",
    section: "media",
    docsUrl: "https://www.atlascloud.ai/",
    icon: atlascloudIcon
  },
  {
    key: "REVE_API_KEY",
    name: "Reve",
    description: "Image creation, editing, and remix with strong prompt adherence.",
    section: "media",
    docsUrl: "https://api.reve.com/"
  },
  {
    key: "MESHY_API_KEY",
    name: "Meshy",
    description: "3D model generation.",
    section: "media",
    docsUrl: "https://docs.meshy.ai/",
    icon: meshyColorIcon
  },
  {
    key: "RODIN_API_KEY",
    name: "Rodin",
    description: "Rodin AI 3D model generation.",
    section: "media",
    docsUrl: "https://hyperhuman.deemos.com/"
  },
  {
    key: "EVOLINK_API_KEY",
    name: "Evolink",
    description: "GPT, Claude, Gemini, DeepSeek and more through one gateway.",
    section: "gateways",
    docsUrl: "https://docs.evolink.ai",
    icon: evolinkIcon
  },
  {
    key: "GMI_API_KEY",
    name: "GMI Cloud",
    description: "Open-weight LLMs through GMI's OpenAI-compatible API.",
    section: "gateways",
    docsUrl: "https://docs.gmicloud.ai/",
    icon: gmiIcon
  },
  {
    key: "AKI_API_KEY",
    name: "AKI",
    description: "AKI.IO AI Model Hub.",
    section: "gateways",
    docsUrl: "https://aki.io/"
  },
  {
    key: "AIME_API_KEY",
    name: "Aime",
    description: "Aime AI services.",
    section: "gateways",
    docsUrl: "https://aime.info/"
  },
  {
    key: "KIE_API_KEY",
    name: "Kie.ai",
    description: "Kie.ai unified model access.",
    section: "gateways",
    docsUrl: "https://kie.ai/"
  },
  {
    key: "SERPAPI_API_KEY",
    name: "SerpAPI",
    description: "Web search via SerpAPI.",
    section: "search",
    docsUrl: "https://serpapi.com/"
  },
  {
    key: "APIFY_API_KEY",
    name: "Apify",
    description: "Web search via Apify Google Search Scraper.",
    section: "search",
    docsUrl: "https://docs.apify.com/"
  },
  {
    key: "BRAVE_API_KEY",
    name: "Brave Search",
    description: "Brave Search web API.",
    section: "search",
    docsUrl: "https://brave.com/search/api/"
  },
  {
    key: "DATA_FOR_SEO_LOGIN",
    name: "DataForSEO",
    description: "Web search via DataForSEO.",
    section: "search",
    docsUrl: "https://docs.dataforseo.com/",
    fields: [
      { key: "DATA_FOR_SEO_LOGIN", label: "Login" },
      { key: "DATA_FOR_SEO_PASSWORD", label: "Password", secret: true }
    ]
  },
  {
    key: "RUNPOD_API_KEY",
    name: "RunPod",
    description: "Rent GPU pods to run NodeTool workers.",
    section: "compute",
    docsUrl: "https://docs.runpod.io/"
  },
  {
    key: "VAST_API_KEY",
    name: "Vast.ai",
    description: "Rent marketplace GPUs to run NodeTool workers.",
    section: "compute",
    docsUrl: "https://docs.vast.ai/"
  },
  {
    key: "LLAMA_API_KEY",
    name: "llama.cpp",
    description: "Bearer auth for a local llama-server instance.",
    section: "compute",
    docsUrl: "https://github.com/ggml-org/llama.cpp"
  },
  {
    key: "GOOGLE_MAIL_USER",
    name: "Google Mail",
    description: "Email address and app password for Google mail integration.",
    section: "advanced",
    docsUrl: "https://support.google.com/mail/",
    icon: googleColorIcon,
    fields: [
      { key: "GOOGLE_MAIL_USER", label: "Email address" },
      { key: "GOOGLE_APP_PASSWORD", label: "App password", secret: true }
    ]
  },
  {
    key: "GITHUB_CLIENT_ID",
    name: "GitHub OAuth App",
    description: "OAuth App credentials for GitHub PKCE flow.",
    section: "advanced",
    docsUrl: "https://docs.github.com/en/apps/oauth-apps",
    icon: githubIcon,
    mono: true,
    fields: [
      { key: "GITHUB_CLIENT_ID", label: "Client ID" },
      { key: "GITHUB_CLIENT_SECRET", label: "Client Secret", secret: true }
    ]
  },
  {
    key: "NODE_SUPABASE_KEY",
    name: "NodeSupabase",
    description: "Supabase service key for user-provided nodes.",
    section: "advanced",
    docsUrl: "https://supabase.com/docs"
  },
  {
    key: "TRACELOOP_API_KEY",
    name: "Traceloop",
    description: "OpenLLMetry trace export to Traceloop.",
    section: "advanced",
    docsUrl: "https://www.traceloop.com/docs"
  },
  {
    key: "SERVER_AUTH_TOKEN",
    name: "Server Auth Token",
    description: "Bearer token to secure NodeTool server endpoints.",
    section: "advanced",
    docsUrl: "https://github.com/nodetool-ai/nodetool"
  }
];

const getProviderMeta = (key: string): ProviderMeta | undefined =>
  PROVIDER_META.find((p) => p.key === key);

// For multi-field credentials, find the parent provider (the one with fields array)
const getParentProviderMeta = (key: string): ProviderMeta | undefined => {
  const meta = getProviderMeta(key);
  if (!meta) return undefined;

  // If this key is in a fields array of another provider, return the parent
  for (const provider of PROVIDER_META) {
    if (provider.fields?.some((f) => f.key === key)) {
      return provider;
    }
  }

  return meta;
};

// Check if all fields of a multi-field provider are configured
const areAllFieldsConfigured = (meta: ProviderMeta, configuredKeys: Set<string>): boolean => {
  if (!meta.fields) {
    return configuredKeys.has(meta.key);
  }
  return meta.fields.every((field) => configuredKeys.has(field.key));
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

export const ProviderCard = memo(function ProviderCard({
  secret,
  meta,
  onConnect,
  onManage,
  onDelete
}: ProviderCardProps) {
  const theme = useTheme();
  const oauth = useOAuthConnection(meta.oauth ?? null);
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
        alignItems: "center",
        gap: theme.spacing(3),
        borderRadius: BORDER_RADIUS.lg,
        border: `1px solid ${theme.vars.palette.divider}`,
        backgroundColor: theme.vars.palette.background.paper,
        transition: `${MOTION.border}, ${MOTION.background}`,
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
          borderRadius: BORDER_RADIUS.lg,
          backgroundColor: theme.vars.palette.background.default,
          overflow: "hidden"
        }}
      >
        {meta.icon ? (
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
        ) : (
          <Text size="big" weight={600}>
            {meta.name.charAt(0)}
          </Text>
        )}
      </FlexRow>

      {/* Info */}
      <FlexColumn sx={{ flex: 1, minWidth: 0, gap: getSpacingPx(SPACING.micro), justifyContent: "center" }}>
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
                fontWeight: 600,
                borderColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.4)`
              }}
            />
          )}
        </FlexRow>
        <Caption sx={{ opacity: 0.55, lineHeight: 1.4 }}>
          {meta.description}
        </Caption>
        {meta.note && (
          <Caption
            size="tiny"
            sx={{
              opacity: 0.45,
              lineHeight: 1.4
            }}
          >
            {meta.note}
          </Caption>
        )}
      </FlexColumn>

      {/* Status + Actions — one vertically centered band */}
      <FlexRow align="center" gap={3} sx={{ flexShrink: 0 }}>
        <FlexColumn align="flex-end" gap={1}>
          <FlexRow
            align="center"
            gap={1}
            sx={{
                      padding: theme.spacing(0.5, 2),
              borderRadius: BORDER_RADIUS.pill,
              backgroundColor: `rgba(${
                isConnected
                  ? theme.vars.palette.success.mainChannel
                  : theme.vars.palette.error.mainChannel
              } / 0.1)`
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: BORDER_RADIUS.circle,
                backgroundColor: isConnected
                  ? theme.vars.palette.success.main
                  : theme.vars.palette.error.main,
                display: "inline-block"
              }}
            />
            <Caption
              size="smaller"
              color={isConnected ? "success" : "error"}
              sx={{
                fontWeight: 500,
                lineHeight: 1.6,
                whiteSpace: "nowrap"
              }}
            >
              {isConnected ? "Connected" : "Not connected"}
            </Caption>
          </FlexRow>
          {oauth.isConnected && (
            <FlexRow
              align="center"
              gap={1}
              sx={{
                padding: theme.spacing(0.5, 2),
                borderRadius: BORDER_RADIUS.pill,
                backgroundColor: `rgba(${theme.vars.palette.success.mainChannel} / 0.1)`
              }}
            >
              <Caption
                size="smaller"
                color="success"
                sx={{
                  fontWeight: 500,
                  lineHeight: 1.6,
                  whiteSpace: "nowrap"
                }}
              >
                Connected via OAuth
              </Caption>
            </FlexRow>
          )}
          {isConnected && secret.updated_at && (
            <Caption size="tiny" sx={{ opacity: 0.45, whiteSpace: "nowrap" }}>
              Last used{" "}
              {new Date(secret.updated_at).toLocaleDateString()}
            </Caption>
          )}
          {!isConnected && (
            <Caption size="tiny" sx={{ opacity: 0.45, whiteSpace: "nowrap" }}>
              Add your API key to get started.
            </Caption>
          )}
        </FlexColumn>

        <FlexRow align="center" gap={0.5}>
          <EditorButton
            density="compact"
            variant="text"
            size="small"
            endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
            onClick={() => window.open(meta.docsUrl, "_blank", "noopener,noreferrer")}
          >
            Docs
          </EditorButton>

          {meta.oauth &&
            (oauth.isConnected
              ? oauth.canDisconnect && (
                  <EditorButton
                    density="compact"
                    variant="text"
                    size="small"
                    startIcon={<LinkOffIcon sx={{ fontSize: 14 }} />}
                    onClick={oauth.disconnect}
                  >
                    Disconnect
                  </EditorButton>
                )
              : (
                  <EditorButton
                    density="compact"
                    variant="outlined"
                    size="small"
                    startIcon={<LoginIcon sx={{ fontSize: 14 }} />}
                    onClick={oauth.connect}
                    disabled={oauth.isConnecting}
                  >
                    {oauth.isConnecting
                      ? "Connecting…"
                      : `Sign in with ${meta.name}`}
                  </EditorButton>
                ))}

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
      </FlexRow>
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
        borderRadius: BORDER_RADIUS.xl,
        border: `1px solid ${theme.vars.palette.divider}`,
        backgroundColor: theme.vars.palette.background.paper,
        marginBottom: theme.spacing(6)
      }}
    >
      <FlexRow justify="space-between" align="flex-start" gap={2} wrap>
        <FlexColumn sx={{ maxWidth: 280 }}>
          <Text size="normal" weight={600} sx={{ marginBottom: theme.spacing(1) }}>
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
                  borderRadius: BORDER_RADIUS.circle,
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
    <FlexRow align="center" gap={0.75} sx={{ marginBottom: theme.spacing(3) }}>
      <Text size="normal" weight={600}>
        {title}
      </Text>
      <Caption
        size="small"
        sx={{
          opacity: 0.5,
          fontWeight: 600,
          backgroundColor: theme.vars.palette.action.selected,
          padding: theme.spacing(0.5, 2),
          borderRadius: BORDER_RADIUS.sm
        }}
      >
        {count}
      </Caption>
    </FlexRow>
  );
});

/* ------------------------------------------------------------------ */
//  Constants
/* ------------------------------------------------------------------ */

const SECTION_ORDER = ["popular", "language", "media", "gateways", "search", "compute", "advanced"] as const;
const SECTION_TITLES: Record<string, string> = {
  popular: "Popular",
  language: "Language Models",
  media: "Media Generation",
  gateways: "Gateways & Hubs",
  search: "Web Search",
  compute: "Compute & Local",
  advanced: "Services & Advanced"
};

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
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [secretToDelete, setSecretToDelete] = useState<SecretResponse | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const addNotification = useNotificationStore((state) => state.addNotification);
  const updateSecret = useSecretsStore((state) => state.updateSecret);
  const deleteSecret = useSecretsStore((state) => state.deleteSecret);

  const lowerSearch = searchTerm.toLowerCase().trim();

  // Get all configured keys
  const configuredKeys = useMemo(
    () => new Set(safeSecrets.map((s) => s.key)),
    [safeSecrets]
  );

  // Match providers that should be displayed (excluding child fields of multi-field providers)
  const matchedProviders = useMemo(() => {
    const results: { secret: SecretResponse; meta: ProviderMeta }[] = [];
    const processed = new Set<string>();

    for (const secret of safeSecrets) {
      // For multi-field providers, only process the parent
      const meta = getParentProviderMeta(secret.key);
      if (!meta || processed.has(meta.key)) continue;

      // If it's a multi-field provider, create a synthetic secret that represents all fields
      if (meta.fields) {
        const isConfigured = areAllFieldsConfigured(meta, configuredKeys);
        if (!lowerSearch || meta.name.toLowerCase().includes(lowerSearch) || meta.description.toLowerCase().includes(lowerSearch)) {
          results.push({
            secret: {
              key: meta.key,
              is_configured: isConfigured,
              description: meta.description,
              user_id: null,
              created_at: null,
              updated_at: null
            } as SecretResponse,
            meta
          });
          processed.add(meta.key);
        }
      } else {
        // Single-field provider
        if (!lowerSearch || meta.name.toLowerCase().includes(lowerSearch) || meta.description.toLowerCase().includes(lowerSearch)) {
          results.push({ secret, meta });
          processed.add(meta.key);
        }
      }
    }

    return results;
  }, [safeSecrets, lowerSearch, configuredKeys]);

  // Connected providers float to their own section at the top.
  const connected = useMemo(
    () => matchedProviders.filter((p) => p.secret.is_configured),
    [matchedProviders]
  );

  // Unconfigured providers from our meta list that aren't in secrets
  const unconfiguredMeta = useMemo(() => {
    return PROVIDER_META.filter(
      (p) =>
        !areAllFieldsConfigured(p, configuredKeys) &&
        (!lowerSearch ||
          p.name.toLowerCase().includes(lowerSearch) ||
          p.description.toLowerCase().includes(lowerSearch))
    );
  }, [configuredKeys, lowerSearch]);

  // Group unconfigured by section
  const unconfiguredBySection = useMemo(() => {
    const groups: Record<string, ProviderMeta[]> = {
      popular: [],
      language: [],
      media: [],
      gateways: [],
      search: [],
      compute: [],
      advanced: []
    };
    for (const meta of unconfiguredMeta) {
      groups[meta.section].push(meta);
    }
    return groups;
  }, [unconfiguredMeta]);

  // Group matched (configured) by section
  const configuredBySection = useMemo(() => {
    const groups: Record<string, Array<{ secret: SecretResponse; meta: ProviderMeta }>> = {
      popular: [],
      language: [],
      media: [],
      gateways: [],
      search: [],
      compute: [],
      advanced: []
    };
    for (const item of matchedProviders.filter((p) => !p.secret.is_configured)) {
      groups[item.meta.section].push(item);
    }
    return groups;
  }, [matchedProviders]);

  const handleConnect = useCallback((secret: SecretResponse) => {
    const meta = getParentProviderMeta(secret.key);
    setEditingSecret(secret);
    setFormValue("");
    if (meta?.fields) {
      setFormValues({});
    }
    setDialogOpen(true);
  }, []);

  const handleManage = useCallback((secret: SecretResponse) => {
    const meta = getParentProviderMeta(secret.key);
    setEditingSecret(secret);
    setFormValue("");
    if (meta?.fields) {
      setFormValues({});
    }
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback((secret: SecretResponse) => {
    setSecretToDelete(secret);
    setDeleteDialogOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editingSecret) return;

    const meta = getParentProviderMeta(editingSecret.key);

    try {
      if (meta?.fields) {
        // Multi-field provider: update all fields
        if (!meta.fields.every((f) => formValues[f.key])) {
          addNotification({
            type: "error",
            content: "All fields are required",
            dismissable: true
          });
          return;
        }
        for (const field of meta.fields) {
          await updateSecret(field.key, formValues[field.key]);
        }
      } else {
        // Single-field provider
        if (!formValue) {
          addNotification({
            type: "error",
            content: "Secret value is required",
            dismissable: true
          });
          return;
        }
        await updateSecret(editingSecret.key, formValue);
      }

      addNotification({
        type: "success",
        content: `${meta?.name || editingSecret.key} API key updated`,
        alert: true
      });
      setDialogOpen(false);
      setEditingSecret(null);
      setFormValue("");
      setFormValues({});
    } catch (err) {
      addNotification({
        type: "error",
        content: `Failed to update secret: ${err instanceof Error ? err.message : String(err)}`,
        dismissable: true
      });
    }
  }, [editingSecret, formValue, formValues, updateSecret, addNotification]);

  const confirmDelete = useCallback(async () => {
    if (!secretToDelete) return;
    try {
      const meta = getParentProviderMeta(secretToDelete.key);
      if (meta?.fields) {
        // Multi-field provider: delete all fields
        for (const field of meta.fields) {
          await deleteSecret(field.key);
        }
      } else {
        // Single-field provider
        await deleteSecret(secretToDelete.key);
      }
      addNotification({
        type: "success",
        content: `${meta?.name || secretToDelete.key} API key deleted`,
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
    setFormValues({});
  }, []);

  const handleCloseDelete = useCallback(() => {
    setDeleteDialogOpen(false);
    setSecretToDelete(null);
  }, []);

  // Force advanced section open while searching
  const forceAdvancedOpen = lowerSearch.length > 0;

  const hasContent = useMemo(() => {
    if (connected.length > 0) return true;
    for (const sectionKey of SECTION_ORDER) {
      const configured = configuredBySection[sectionKey] || [];
      const unconfigured = unconfiguredBySection[sectionKey] || [];
      if (configured.length > 0 || unconfigured.length > 0) return true;
    }
    return false;
  }, [connected, configuredBySection, unconfiguredBySection]);

  return (
    <FlexColumn sx={{ gap: "1.5rem" }}>
      <GetStartedBanner theme={theme} />

      {!hasContent && lowerSearch && (
        <EmptyState
          variant="no-results"
          title="No providers found"
          description={`No providers match "${searchTerm}"`}
        />
      )}

      {connected.length > 0 && (
        <div>
          <SectionTitle
            title="Connected Providers"
            count={connected.length}
            theme={theme}
          />
          <FlexColumn sx={{ gap: theme.spacing(2) }}>
            {connected.map(({ secret, meta }) => (
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

      {SECTION_ORDER.map((sectionKey) => {
        const configured = configuredBySection[sectionKey] || [];
        const unconfigured = unconfiguredBySection[sectionKey] || [];
        const allInSection = [
          ...configured,
          ...unconfigured.map((meta) => ({
            secret: {
              key: meta.key,
              is_configured: false,
              description: meta.description,
              user_id: null,
              created_at: null,
              updated_at: null
            } as SecretResponse,
            meta
          }))
        ];

        if (allInSection.length === 0) return null;

        const sectionTitle = SECTION_TITLES[sectionKey];
        const isAdvanced = sectionKey === "advanced";

        const section = (
          <div key={sectionKey}>
            <SectionTitle
              title={sectionTitle}
              count={allInSection.length}
              theme={theme}
            />
            <FlexColumn sx={{ gap: theme.spacing(2) }}>
              {allInSection.map(({ secret, meta }) => (
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
        );

        if (isAdvanced) {
          return (
            <CollapsibleSection
              key={sectionKey}
              title={
                <SectionTitle
                  title={sectionTitle}
                  count={allInSection.length}
                  theme={theme}
                />
              }
              open={forceAdvancedOpen || advancedOpen}
              onToggle={setAdvancedOpen}
            >
              <FlexColumn sx={{ gap: theme.spacing(2) }}>
                {allInSection.map(({ secret, meta }) => (
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
            </CollapsibleSection>
          );
        }

        return section;
      })}

      {/* Edit / Connect dialog */}
      {editingSecret && (() => {
        const meta = getParentProviderMeta(editingSecret.key);
        const isMultiField = !!meta?.fields && meta.fields.length > 0;
        const allFieldsFilled = isMultiField && meta?.fields
          ? meta.fields.every((f) => formValues[f.key])
          : formValue;

        return (
          <Dialog
            open={dialogOpen}
            onClose={handleCloseDialog}
            fullWidth
            title={
              <FlexRow align="center" gap={1}>
                <LockIcon sx={{ color: "var(--palette-primary-main)", fontSize: 20 }} />
                <Text size="normal" weight={600}>
                  {editingSecret?.is_configured ? "Update" : "Connect"}{" "}
                  {meta?.name || editingSecret.key}
                </Text>
              </FlexRow>
            }
            onConfirm={handleSave}
            onCancel={handleCloseDialog}
            confirmText={editingSecret?.is_configured ? "Update" : "Connect"}
            cancelText="Cancel"
            confirmDisabled={!allFieldsFilled}
          >
            <FlexColumn sx={{ marginTop: theme.spacing(4), gap: theme.spacing(3) }}>
              {isMultiField ? (
                <>
                  {meta?.fields?.map((field) => (
                    <TextInput
                      key={field.key}
                      label={field.label}
                      type={field.secret ? "password" : "text"}
                      value={formValues[field.key] || ""}
                      onChange={(e) =>
                        setFormValues((prev) => ({
                          ...prev,
                          [field.key]: e.target.value
                        }))
                      }
                      fullWidth
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                      autoFocus={field.key === meta.fields?.[0]?.key}
                      variant="outlined"
                      size="small"
                    />
                  ))}
                  <Caption sx={{ opacity: 0.6 }}>
                    All fields will be encrypted and stored securely. Never share them publicly.
                  </Caption>
                </>
              ) : (
                <>
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
                </>
              )}
            </FlexColumn>
          </Dialog>
        );
      })()}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={handleCloseDelete}
        onConfirm={confirmDelete}
        title="Delete API Key"
        content={`Are you sure you want to delete the ${secretToDelete ? getParentProviderMeta(secretToDelete.key)?.name || secretToDelete.key : ""} API key?`}
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
        borderRadius: BORDER_RADIUS.lg,
        border: `1px solid ${theme.vars.palette.divider}`,
        backgroundColor: `rgba(${theme.vars.palette.success.mainChannel} / 0.06)`
      }}
    >
      <FlexRow align="flex-start" gap={1}>
        <ShieldIcon
          sx={{
            fontSize: 18,
            color: theme.vars.palette.success.main,
            marginTop: theme.spacing(0.5),
            flexShrink: 0
          }}
        />
        <FlexColumn sx={{ minWidth: 0 }}>
          <Text size="tiny" weight={600}>
            Your secrets are safe
          </Text>
          <Caption size="tiny" sx={{ opacity: 0.6, lineHeight: 1.4, marginTop: theme.spacing(0.5) }}>
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
            sx={{ alignSelf: "flex-start", marginTop: theme.spacing(1) }}
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
        padding: theme.spacing(6, 4),
        gap: theme.spacing(4),
        overflowY: "auto",
        overflowX: "hidden"
      }}
    >
      {/* Quick Links */}
      <Card
        variant="outlined"
        padding="normal"
        sx={{
          borderRadius: BORDER_RADIUS.lg,
          border: `1px solid ${theme.vars.palette.divider}`
        }}
      >
        <Text size="small" weight={600} sx={{ marginBottom: theme.spacing(3) }}>
          Quick Links
        </Text>
        <FlexColumn sx={{ gap: theme.spacing(0.5) }}>
          {quickLinks.map((link) => (
            <FlexRow
              key={link.title}
              align="center"
              gap={0.75}
              sx={{
                padding: theme.spacing(2, 2),
                borderRadius: BORDER_RADIUS.md,
                cursor: "pointer",
                transition: MOTION.background,
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
                  marginLeft: theme.spacing(1)
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
          borderRadius: BORDER_RADIUS.lg,
          border: `1px solid ${theme.vars.palette.divider}`,
          background: `linear-gradient(135deg, rgba(${theme.vars.palette.primary.mainChannel} / 0.08) 0%, rgba(${theme.vars.palette.primary.mainChannel} / 0.02) 100%)`
        }}
      >
        <FlexRow align="center" gap={1} sx={{ marginBottom: theme.spacing(2) }}>
          <CardGiftcardIcon
            sx={{ color: theme.vars.palette.primary.main, fontSize: 20 }}
          />
          <Text size="small" weight={600}>
            Need API credits?
          </Text>
        </FlexRow>
        <Caption sx={{ opacity: 0.6, lineHeight: 1.5, marginBottom: theme.spacing(3) }}>
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
