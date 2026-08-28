/** @jsxImportSource @emotion/react */
import { memo, useCallback, useEffect, useState } from "react";
import { useTheme } from "@mui/material/styles";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import LoginIcon from "@mui/icons-material/Login";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import KeyRoundedIcon from "@mui/icons-material/KeyRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";

import {
  Box,
  Caption,
  Card,
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  Text,
  TextInput,
  BORDER_RADIUS,
  MOTION,
  SPACING
} from "../ui_primitives";
import { useOAuthConnection } from "../../hooks/useOAuthConnection";
import { OAuthManualCompletionDialog } from "../oauth/OAuthManualCompletionDialog";
import useSecretsStore from "../../stores/SecretsStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import type { OnboardingProvider } from "./providerOnboardingCatalog";

interface ProviderOnboardingCardProps {
  provider: OnboardingProvider;
  /** Already has a stored API key for this provider. */
  configured: boolean;
  /** Start expanded (e.g. the provider a per-node warning pointed at). */
  defaultExpanded?: boolean;
}

/**
 * One provider in the onboarding dialog. OAuth providers get a one-click
 * "Sign in" button; every provider can also expand an inline API-key field so
 * the user connects without leaving the flow. Reuses the same OAuth hook and
 * secrets store as the full Settings page.
 */
const ProviderOnboardingCard: React.FC<ProviderOnboardingCardProps> = ({
  provider,
  configured,
  defaultExpanded = false
}) => {
  const theme = useTheme();
  const oauth = useOAuthConnection(provider.oauth ?? null);
  const updateSecret = useSecretsStore((s) => s.updateSecret);
  const validateSecret = useSecretsStore((s) => s.validateSecret);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [keyValue, setKeyValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Set when the provider rejected the key. The field keeps its value and the
  // user can either fix it or save it anyway.
  const [rejected, setRejected] = useState<string | null>(null);

  const isConnected = configured || oauth.isConnected;

  // Once the OAuth popup completes, collapse the inline key field — the card
  // flips to its connected state on its own.
  useEffect(() => {
    if (isConnected) {
      setExpanded(false);
    }
  }, [isConnected]);

  const persistKey = useCallback(
    async (value: string, unverified: string | null) => {
      await updateSecret(provider.secretKey, value);
      setKeyValue("");
      setRejected(null);
      addNotification({
        type: unverified ? "warning" : "success",
        content: unverified
          ? `${provider.name} key saved — ${unverified}`
          : `${provider.name} connected`,
        alert: true
      });
    },
    [updateSecret, provider, addNotification]
  );

  /**
   * Probe the key before storing it, so a typo or a revoked key is caught here
   * instead of halfway through the user's first run. A key the provider
   * rejects is not saved; one nothing could check is, and the toast says so.
   */
  const handleSaveKey = useCallback(async () => {
    const trimmed = keyValue.trim();
    if (!trimmed) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    setRejected(null);
    try {
      const result = await validateSecret(provider.secretKey, trimmed);
      if (result.status === "invalid") {
        setRejected(result.message);
        return;
      }
      await persistKey(
        trimmed,
        result.status === "unverifiable" ? result.message : null
      );
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : "Couldn't save the key. Check your connection and try again."
      );
    } finally {
      setSaving(false);
    }
  }, [keyValue, validateSecret, persistKey, provider]);

  /** Store a key the provider rejected — the user's call, not ours. */
  const handleSaveAnyway = useCallback(async () => {
    const trimmed = keyValue.trim();
    if (!trimmed) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await persistKey(trimmed, "the provider rejected it");
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : "Couldn't save the key. Check your connection and try again."
      );
    } finally {
      setSaving(false);
    }
  }, [keyValue, persistKey]);

  return (
    <Card
      variant="outlined"
      padding="compact"
      sx={{
        borderRadius: BORDER_RADIUS.lg,
        border: `1px solid ${
          isConnected
            ? `rgba(${theme.vars.palette.success.mainChannel} / 0.5)`
            : theme.vars.palette.divider
        }`,
        backgroundColor: theme.vars.palette.background.paper,
        transition: `${MOTION.border}, ${MOTION.background}`
      }}
    >
      <FlexColumn gap={SPACING.sm}>
        <FlexRow align="center" gap={SPACING.sm}>
          {/* Icon */}
          <FlexRow
            align="center"
            justify="center"
            sx={{
              width: 42,
              height: 42,
              minWidth: 42,
              borderRadius: BORDER_RADIUS.lg,
              backgroundColor: theme.vars.palette.background.default,
              overflow: "hidden"
            }}
          >
            <Box
              component="img"
              src={provider.icon}
              alt=""
              aria-hidden
              sx={{
                width: 24,
                height: 24,
                objectFit: "contain",
                ...(provider.mono &&
                  theme.applyStyles("dark", { filter: "invert(1)" }))
              }}
            />
          </FlexRow>

          {/* Info */}
          <FlexColumn sx={{ flex: 1, minWidth: 0 }} gap={SPACING.micro}>
            <FlexRow align="center" gap={SPACING.xs}>
              <Text size="small" weight={600}>
                {provider.name}
              </Text>
              {provider.oauth && !isConnected && (
                <Chip
                  label="1-click sign-in"
                  compact
                  variant="outlined"
                  color="primary"
                  sx={{ height: 18, fontWeight: 600 }}
                />
              )}
              {provider.freeTier && !isConnected && (
                <Chip
                  label={provider.freeTier}
                  compact
                  variant="outlined"
                  color="success"
                  sx={{ height: 18, fontWeight: 600 }}
                />
              )}
            </FlexRow>
            <Caption sx={{ opacity: 0.7, lineHeight: 1.4 }}>
              {provider.tagline}
            </Caption>
          </FlexColumn>

          {/* Actions */}
          <FlexRow align="center" gap={SPACING.micro} sx={{ flexShrink: 0 }}>
            {isConnected ? (
              <FlexRow align="center" gap={SPACING.micro}>
                <CheckCircleRoundedIcon
                  sx={{
                    fontSize: 18,
                    color: theme.vars.palette.success.main
                  }}
                />
                <Caption size="small" color="success" sx={{ fontWeight: 600 }}>
                  Connected
                </Caption>
              </FlexRow>
            ) : (
              <>
                {provider.oauth && (
                  <EditorButton
                    density="compact"
                    variant="contained"
                    size="small"
                    startIcon={
                      oauth.isConnecting ? undefined : (
                        <LoginIcon sx={{ fontSize: 14 }} />
                      )
                    }
                    onClick={oauth.connect}
                    disabled={oauth.isConnecting}
                  >
                    {oauth.isConnecting ? "Waiting…" : "Sign in"}
                  </EditorButton>
                )}
                {!provider.oauthOnly && (
                  <EditorButton
                    density="compact"
                    variant={provider.oauth ? "outlined" : "contained"}
                    size="small"
                    startIcon={
                      provider.oauth ? undefined : (
                        <KeyRoundedIcon sx={{ fontSize: 14 }} />
                      )
                    }
                    endIcon={
                      <ExpandMoreRoundedIcon
                        sx={{
                          fontSize: 16,
                          transition: MOTION.transform,
                          transform: expanded ? "rotate(180deg)" : "none"
                        }}
                      />
                    }
                    onClick={() => setExpanded((v) => !v)}
                  >
                    {provider.oauth ? "Use API key" : "Add API key"}
                  </EditorButton>
                )}
              </>
            )}
          </FlexRow>
        </FlexRow>

        {/* Inline API-key entry */}
        {expanded && !isConnected && !provider.oauthOnly && (
          <FlexColumn gap={SPACING.xs} className="nodrag nowheel">
            <FlexRow gap={SPACING.xs} align="center">
              <TextInput
                size="small"
                type="password"
                placeholder={`Paste your ${provider.name} API key`}
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSaveKey();
                  }
                }}
                fullWidth
                autoFocus
              />
              <EditorButton
                variant="contained"
                density="compact"
                size="small"
                onClick={handleSaveKey}
                disabled={saving || !keyValue.trim()}
              >
                {saving ? <LoadingSpinner size="small" inline /> : "Connect"}
              </EditorButton>
            </FlexRow>
            <FlexRow
              justify="space-between"
              align="center"
              gap={SPACING.xs}
              wrap
            >
              <EditorButton
                density="compact"
                variant="text"
                size="small"
                endIcon={<OpenInNewIcon sx={{ fontSize: 13 }} />}
                onClick={() =>
                  window.open(provider.keyUrl, "_blank", "noopener,noreferrer")
                }
              >
                Get a {provider.name} key
              </EditorButton>
              <Caption size="smaller" sx={{ opacity: 0.6 }}>
                {provider.costHint}
              </Caption>
            </FlexRow>
            {rejected && (
              <FlexRow align="center" gap={SPACING.xs} wrap>
                <Caption size="small" color="error" sx={{ flex: 1 }}>
                  {rejected}
                </Caption>
                <EditorButton
                  density="compact"
                  variant="text"
                  size="small"
                  onClick={handleSaveAnyway}
                  disabled={saving}
                >
                  Save anyway
                </EditorButton>
              </FlexRow>
            )}
            {saveError && (
              <Caption size="small" color="error">
                {saveError}
              </Caption>
            )}
          </FlexColumn>
        )}
      </FlexColumn>
      <OAuthManualCompletionDialog
        prompt={oauth.manualPrompt}
        label={oauth.label}
        isSubmitting={oauth.isSubmittingManual}
        onSubmit={oauth.submitManualCode}
        onCancel={oauth.cancelManual}
      />
    </Card>
  );
};

export default memo(ProviderOnboardingCard);
