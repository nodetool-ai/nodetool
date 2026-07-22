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
  MOTION
} from "../ui_primitives";
import { useOAuthConnection } from "../../hooks/useOAuthConnection";
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
  const addNotification = useNotificationStore((s) => s.addNotification);

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [keyValue, setKeyValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isConnected = configured || oauth.isConnected;

  // Once the OAuth popup completes, collapse the inline key field — the card
  // flips to its connected state on its own.
  useEffect(() => {
    if (isConnected) {
      setExpanded(false);
    }
  }, [isConnected]);

  const handleSaveKey = useCallback(async () => {
    const trimmed = keyValue.trim();
    if (!trimmed) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await updateSecret(provider.secretKey, trimmed);
      setKeyValue("");
      addNotification({
        type: "success",
        content: `${provider.name} connected`,
        alert: true
      });
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : "Couldn't save the key. Check your connection and try again."
      );
    } finally {
      setSaving(false);
    }
  }, [keyValue, updateSecret, provider, addNotification]);

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
      <FlexColumn gap={1.5}>
        <FlexRow align="center" gap={1.5}>
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
          <FlexColumn sx={{ flex: 1, minWidth: 0 }} gap={0.25}>
            <FlexRow align="center" gap={0.75}>
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
          <FlexRow align="center" gap={0.5} sx={{ flexShrink: 0 }}>
            {isConnected ? (
              <FlexRow align="center" gap={0.5}>
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
              </>
            )}
          </FlexRow>
        </FlexRow>

        {/* Inline API-key entry */}
        {expanded && !isConnected && (
          <FlexColumn gap={0.75} className="nodrag nowheel">
            <FlexRow gap={1} align="center">
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
            <FlexRow justify="space-between" align="center" gap={1} wrap>
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
            {saveError && (
              <Caption size="small" color="error">
                {saveError}
              </Caption>
            )}
          </FlexColumn>
        )}
      </FlexColumn>
    </Card>
  );
};

export default memo(ProviderOnboardingCard);
