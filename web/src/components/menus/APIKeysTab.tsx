/** @jsxImportSource @emotion/react */
import { memo, useState, useCallback, useMemo } from "react";
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
import type { SecretValidation } from "../../stores/SecretsStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useOAuthConnection } from "../../hooks/useOAuthConnection";
import { OAuthManualCompletionDialog } from "../oauth/OAuthManualCompletionDialog";
import { useProviders } from "../../hooks/useProviders";
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
import GoogleWorkspaceCard from "./GoogleWorkspaceCard";
import { CustomProvidersSection } from "./CustomProvidersSection";

import {
  PROVIDER_META,
  getProviderMeta,
  isProviderAvailable,
  type ProviderMeta
} from "./providerCatalog";

import { docsLink, docsUrl } from "../../config/docsLinks";

// For multi-field credentials, find the parent provider (the one with fields array)
const getParentProviderMeta = (key: string): ProviderMeta | undefined => {
  const meta = getProviderMeta(key);
  if (!meta) return undefined;

  for (const provider of PROVIDER_META) {
    if (provider.fields?.some((f) => f.key === key)) {
      return provider;
    }
  }

  return meta;
};

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
  const validateSecret = useSecretsStore((s) => s.validateSecret);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<SecretValidation | null>(null);
  // A card has two ways to be connected and they are independent: a stored
  // API key, and an OAuth sign-in. Only the key can be tested, managed or
  // deleted, so the two stay separate rather than collapsing into one flag.
  const hasKey = secret.is_configured;
  const isConnected = meta.oauthOnly
    ? oauth.isConnected
    : hasKey || oauth.isConnected;

  // The registry providers this card currently holds a credential for. The
  // sign-in can credential a different provider than the key does — signing in
  // to OpenAI stores a Codex token, and `codex` is what serves the models — so
  // asking about `providerId` alone reports an OAuth-connected card as
  // unconfigured.
  const credentialedProviderIds = useMemo(() => {
    const ids = new Set<string>();
    if (hasKey && meta.providerId) ids.add(meta.providerId);
    if (oauth.isConnected) {
      const viaOAuth = meta.oauthProviderId ?? meta.providerId;
      if (viaOAuth) ids.add(viaOAuth);
    }
    return ids;
  }, [hasKey, oauth.isConnected, meta.providerId, meta.oauthProviderId]);

  // A credential says nothing about whether the server offers the provider.
  // A cloud profile prunes the local and OAuth-backed providers, and a build
  // can ship without one, so a card can read "Connected" while the model menu
  // stays empty. `models.providers` is what the model menu itself reads.
  const { providers, isLoading: providersLoading } = useProviders();
  const isUnavailable = useMemo(() => {
    if (credentialedProviderIds.size === 0) return false;
    // Unknown is not absent: while the query is in flight, say nothing.
    if (providersLoading || providers.length === 0) return false;
    return !providers.some((p) => credentialedProviderIds.has(p.provider));
  }, [credentialedProviderIds, providers, providersLoading]);

  const statusTone = isUnavailable ? "warning" : isConnected ? "success" : "error";
  const statusLabel = isUnavailable
    ? "Unavailable"
    : isConnected
      ? "Connected"
      : "Not connected";

  const handleConnect = useCallback(() => {
    onConnect(secret);
  }, [onConnect, secret]);

  const handleManage = useCallback(() => {
    onManage(secret);
  }, [onManage, secret]);

  const handleDelete = useCallback(() => {
    onDelete(secret);
  }, [onDelete, secret]);

  // Spends one small request against the provider to answer the question the
  // card can't: is the key that's stored still good?
  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    const result = await validateSecret(meta.key);
    setTestResult(result);
    setTesting(false);
  }, [validateSecret, meta.key]);

  return (
    <Card
      variant="outlined"
      padding="compact"
      sx={{
        display: "flex",
        // Stack on mobile (<sm) so the status band + action buttons drop below
        // the icon/info instead of overflowing the narrow row. Pure CSS
        // breakpoints keep this a layout concern with no per-card matchMedia.
        flexDirection: { xs: "column", sm: "row" },
        alignItems: { xs: "stretch", sm: "center" },
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
      {/* Icon + info stay a row even when the card stacks on mobile. */}
      <FlexRow align="center" gap={3} sx={{ flex: 1, minWidth: 0 }}>
      {/* Icon */}
      <FlexRow
        align="center"
        justify="center"
        sx={{
          width: PROVIDER_ICON_CHIP_PX,
          height: PROVIDER_ICON_CHIP_PX,
          minWidth: PROVIDER_ICON_CHIP_PX,
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
              width: PROVIDER_ICON_GLYPH_PX,
              height: PROVIDER_ICON_GLYPH_PX,
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
            size="smaller"
            sx={{
              opacity: 0.45,
              lineHeight: 1.4
            }}
          >
            {meta.note}
          </Caption>
        )}
      </FlexColumn>
      </FlexRow>

      {/* Status + Actions — one vertically centered band. On mobile it drops
          below the icon/info and spreads full width, letting the action
          buttons wrap instead of overflowing. */}
      <FlexRow
        align="center"
        gap={3}
        sx={{
          flexShrink: 0,
          flexWrap: "wrap",
          justifyContent: { xs: "space-between", sm: "flex-start" }
        }}
      >
        <FlexColumn
          gap={1}
          sx={{ alignItems: { xs: "flex-start", sm: "flex-end" } }}
        >
          <FlexRow
            align="center"
            gap={1}
            sx={{
              padding: theme.spacing(0.5, 2),
              borderRadius: BORDER_RADIUS.pill,
              backgroundColor: `rgba(${theme.vars.palette[statusTone].mainChannel} / 0.1)`
            }}
          >
            <span
              style={{
                width: STATUS_DOT_PX,
                height: STATUS_DOT_PX,
                borderRadius: BORDER_RADIUS.circle,
                backgroundColor: theme.vars.palette[statusTone].main,
                display: "inline-block"
              }}
            />
            <Caption
              size="smaller"
              color={statusTone}
              sx={{
                fontWeight: 500,
                lineHeight: 1.6,
                whiteSpace: "nowrap"
              }}
            >
              {statusLabel}
            </Caption>
          </FlexRow>
          {oauth.isConnected && !meta.oauthOnly && (
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
          {isUnavailable && (
            <Caption
              size="smaller"
              color="warning"
              sx={{
                lineHeight: 1.5,
                maxWidth: 280,
                textAlign: { xs: "left", sm: "right" }
              }}
            >
              {hasKey ? "Key stored" : "Signed in"}, but this server does not
              offer {meta.name}. Its models stay out of the model menu.
            </Caption>
          )}
          {hasKey && !isUnavailable && secret.updated_at && (
            <Caption size="smaller" sx={{ opacity: 0.45, whiteSpace: "nowrap" }}>
              Last used{" "}
              {new Date(secret.updated_at).toLocaleDateString()}
            </Caption>
          )}
          {testResult && (
            <Caption
              size="smaller"
              color={
                testResult.status === "valid"
                  ? "success"
                  : testResult.status === "invalid"
                    ? "error"
                    : undefined
              }
              sx={{
                lineHeight: 1.5,
                maxWidth: 280,
                textAlign: { xs: "left", sm: "right" }
              }}
            >
              {testResult.message}
            </Caption>
          )}
          {!isConnected && (
            <Caption size="smaller" sx={{ opacity: 0.45, whiteSpace: "nowrap" }}>
              {meta.oauthOnly
                ? "Sign in to get started."
                : "Add your API key to get started."}
            </Caption>
          )}
        </FlexColumn>

        <FlexRow align="center" gap={0.5} sx={{ flexWrap: "wrap" }}>
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

          {meta.oauthOnly ? null : hasKey ? (
            <>
              <EditorButton
                density="compact"
                variant="text"
                size="small"
                onClick={handleTest}
                disabled={testing}
              >
                {testing ? "Testing…" : "Test"}
              </EditorButton>
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
      <OAuthManualCompletionDialog
        prompt={oauth.manualPrompt}
        label={oauth.label}
        isSubmitting={oauth.isSubmittingManual}
        onSubmit={oauth.submitManualCode}
        onCancel={oauth.cancelManual}
      />
    </Card>
  );
});

/* ------------------------------------------------------------------ */
//  Hero — provider logo wall
/* ------------------------------------------------------------------ */

// A curated row of recognizable provider logos, shown at the top of the page
// to make the empty/first-run state feel alive. Purely decorative; the name,
// icon and mono flag come from the catalog entry so they cannot drift from the
// card below.
const HERO_LOGO_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "MISTRAL_API_KEY",
  "GROQ_API_KEY",
  "HF_TOKEN",
  "XAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "COHERE_API_KEY",
  "FAL_API_KEY",
  "REPLICATE_API_TOKEN",
  "ELEVENLABS_API_KEY"
];

const HERO_LOGOS: Array<{ name: string; icon: string; mono?: boolean }> =
  HERO_LOGO_KEYS.flatMap((key) => {
    const meta = getProviderMeta(key);
    return meta?.icon
      ? [{ name: meta.name, icon: meta.icon, mono: meta.mono }]
      : [];
  });

const ProviderHero = memo(function ProviderHero({ theme }: { theme: Theme }) {
  return (
    <Card
      variant="outlined"
      padding="comfortable"
      sx={{
        borderRadius: BORDER_RADIUS.xl,
        border: `1px solid ${theme.vars.palette.divider}`,
        background: `linear-gradient(135deg, rgba(${theme.vars.palette.primary.mainChannel} / 0.1) 0%, rgba(${theme.vars.palette.primary.mainChannel} / 0.02) 45%, ${theme.vars.palette.background.paper} 100%)`,
        overflow: "hidden"
      }}
    >
      <FlexColumn gap={2}>
        <Text size="big" weight={600}>
          Models &amp; Providers
        </Text>
        <Caption sx={{ opacity: 0.65, lineHeight: 1.5, maxWidth: 520 }}>
          Connect the AI providers you want to use. NodeTool unlocks their
          language, image, video, audio, and embedding models across the editor
          and your workflows.
        </Caption>
        <FlexRow gap={1.5} sx={{ flexWrap: "wrap", marginTop: theme.spacing(1) }}>
          {HERO_LOGOS.map((logo) => (
            <Tooltip key={logo.name} title={logo.name}>
              <FlexRow
                align="center"
                justify="center"
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: BORDER_RADIUS.lg,
                  border: `1px solid ${theme.vars.palette.divider}`,
                  backgroundColor: theme.vars.palette.background.paper,
                  transition: `${MOTION.transform}, ${MOTION.border}`,
                  "&:hover": {
                    transform: "translateY(-2px)",
                    borderColor: theme.vars.palette.primary.main
                  }
                }}
              >
                <Box
                  component="img"
                  src={logo.icon}
                  alt={logo.name}
                  sx={{
                    width: 22,
                    height: 22,
                    objectFit: "contain",
                    ...(logo.mono &&
                      theme.applyStyles("dark", { filter: "invert(1)" }))
                  }}
                />
              </FlexRow>
            </Tooltip>
          ))}
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
                <Text size="smaller" weight={600}>{step.title}</Text>
                <Caption sx={{ opacity: 0.5, lineHeight: 1.4, fontSize: theme.fontSizeSmaller }}>
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

// Provider card icon sizing. 48px chip + 28px glyph + 18px status dot keep the
// row visually balanced; previously these were bare numbers sprinkled across
// the JSX.
const PROVIDER_ICON_CHIP_PX = 48;
const PROVIDER_ICON_GLYPH_PX = 28;
const STATUS_DOT_PX = 6;

const SECTION_ORDER = ["popular", "language", "media", "gateways", "search", "compute", "advanced"] as const;
const SECTION_TITLES = {
  popular: "Popular",
  language: "Language Models",
  media: "Media Generation",
  gateways: "Gateways & Hubs",
  search: "Web Search",
  compute: "Compute & Local",
  advanced: "Services & Advanced"
} satisfies Record<string, string>;

/* ------------------------------------------------------------------ */
//  Main content
/* ------------------------------------------------------------------ */

interface APIKeysTabContentProps {
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
      if (!meta || processed.has(meta.key) || !isProviderAvailable(meta)) {
        continue;
      }

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
        isProviderAvailable(p) &&
        !areAllFieldsConfigured(p, configuredKeys) &&
        (!lowerSearch ||
          p.name.toLowerCase().includes(lowerSearch) ||
          p.description.toLowerCase().includes(lowerSearch))
    );
  }, [configuredKeys, lowerSearch]);

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
      <ProviderHero theme={theme} />

      {/* Show the onboarding banner only until the user connects their first
          provider — once anything is configured, the Connected Providers
          section above makes the banner redundant. */}
      {connected.length === 0 && <GetStartedBanner theme={theme} />}

      {/* Google Workspace has no API key — access rides on the Google login.
          Renders nothing when the backend does not offer the integration. */}
      <GoogleWorkspaceCard />

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

      <CustomProvidersSection />

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
          <Text size="smaller" weight={600}>
            Your secrets are safe
          </Text>
          <Caption size="smaller" sx={{ opacity: 0.6, lineHeight: 1.4, marginTop: theme.spacing(0.5) }}>
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
      href: docsLink("providers")
    },
    {
      icon: <MenuBookIcon sx={{ fontSize: 18 }} />,
      title: "API Documentation",
      subtitle: "Provider guides & links",
      href: docsUrl("providers")
    },
    {
      icon: <HelpOutlineIcon sx={{ fontSize: 18 }} />,
      title: "Troubleshooting",
      subtitle: "Common issues & fixes",
      href: docsLink("troubleshooting")
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
                <Text size="smaller" weight={500}>{link.title}</Text>
                <Caption sx={{ opacity: 0.5, fontSize: theme.fontSizeSmaller, lineHeight: 1.3 }}>
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
