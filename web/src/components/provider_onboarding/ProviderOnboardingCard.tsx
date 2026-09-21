/** @jsxImportSource @emotion/react */
import { memo, useCallback, useEffect, useState, useId } from "react";
import { useTheme } from "@mui/material/styles";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import LoginIcon from "@mui/icons-material/Login";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import KeyRoundedIcon from "@mui/icons-material/KeyRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";

import {
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  Text,
  TextInput,
  BORDER_RADIUS,
  MOTION,
  SPACING,
  reducedMotion
} from "../ui_primitives";
import { useOAuthConnection } from "../../hooks/useOAuthConnection";
import { OAuthManualCompletionDialog } from "../oauth/OAuthManualCompletionDialog";
import useSecretsStore from "../../stores/SecretsStore";
import type { SecretValidation } from "../../stores/SecretsStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import type { OnboardingProvider } from "./providerOnboardingCatalog";

type StoredCredentialStatus = "configured" | "verified" | "unavailable" | "rejected";

const statusLabel: Record<StoredCredentialStatus, string> = {
  configured: "Configured",
  verified: "Verified",
  unavailable: "Unavailable",
  rejected: "Rejected"
};

const statusColor: Record<StoredCredentialStatus, "secondary" | "success" | "warning" | "error"> = {
  configured: "secondary",
  verified: "success",
  unavailable: "warning",
  rejected: "error"
};

const statusFromValidation = (
  result: SecretValidation
): StoredCredentialStatus => {
  switch (result.status) {
    case "valid":
      return "verified";
    case "invalid":
      return "rejected";
    case "unverifiable":
      return "unavailable";
  }
};

const detailFromValidation = (
  status: SecretValidation["status"]
): string | null => {
  switch (status) {
    case "valid":
      return null;
    case "invalid":
      return "The provider rejected the key.";
    case "unverifiable":
      return "The key was saved, but it could not be verified.";
  }
};

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
  const keyFieldId = useId();
  const oauth = useOAuthConnection(provider.oauth ?? null);
  const updateSecret = useSecretsStore((s) => s.updateSecret);
  const validateSecret = useSecretsStore((s) => s.validateSecret);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [keyValue, setKeyValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [storedCredentialStatus, setStoredCredentialStatus] =
    useState<StoredCredentialStatus | null>(() =>
      configured ? "configured" : null
    );
  // Set when the provider rejected the key. The field keeps its value and the
  // user can either fix it or save it anyway.
  const [rejected, setRejected] = useState<string | null>(null);

  // `CLAUDE_SUBSCRIPTION` is a display id for OAuth and is never a stored key.
  const hasStoredKey =
    !provider.oauthOnly && (configured || storedCredentialStatus !== null);
  const isConnected = hasStoredKey || oauth.isConnected;

  // Once the OAuth popup completes, collapse the inline key field — the card
  // flips to its connected state on its own.
  useEffect(() => {
    if (!provider.oauthOnly && configured && storedCredentialStatus === null) {
      setStoredCredentialStatus("configured");
    }
    if (isConnected) {
      setExpanded(false);
    }
  }, [configured, isConnected, provider.oauthOnly, storedCredentialStatus]);

  const persistKey = useCallback(
    async (
      value: string,
      status: StoredCredentialStatus,
      notificationDetail: string | null
    ) => {
      await updateSecret(provider.secretKey, value);
      setKeyValue("");
      setRejected(null);
      setStatusDetail(notificationDetail);
      setStoredCredentialStatus(status);
      setReplacing(false);
      setExpanded(false);
      addNotification({
        type: status === "verified" ? "success" : "warning",
        content:
          status === "verified"
            ? `${provider.name} connected`
            : `${provider.name} key saved — ${statusLabel[status].toLowerCase()}`,
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
    if (!trimmed || saving) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    setRejected(null);
    try {
      const result = await validateSecret(provider.secretKey, trimmed);
      if (result.status === "invalid") {
        setRejected(detailFromValidation(result.status));
        return;
      }
      await persistKey(
        trimmed,
        statusFromValidation(result),
        result.status === "unverifiable"
          ? detailFromValidation(result.status)
          : null
      );
    } catch {
      setSaveError("Couldn't save the key. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }, [keyValue, validateSecret, persistKey, provider, saving]);

  /** Store a key the provider rejected — the user's call, not ours. */
  const handleSaveAnyway = useCallback(async () => {
    const trimmed = keyValue.trim();
    if (!trimmed || saving) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await persistKey(trimmed, "rejected", "The provider rejected this key.");
    } catch {
      setSaveError("Couldn't save the key. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }, [keyValue, persistKey, saving]);

  const handleRecheck = useCallback(async () => {
    if (rechecking || !hasStoredKey) {
      return;
    }
    setRechecking(true);
    setSaveError(null);
    try {
      const result = await validateSecret(provider.secretKey);
      setStoredCredentialStatus(statusFromValidation(result));
      setStatusDetail(
        result.status === "invalid"
          ? "The provider rejected the stored key."
          : result.status === "unverifiable"
            ? "The stored key could not be verified."
            : null
      );
    } catch {
      setSaveError(
        "Couldn't recheck the key. Check your connection and try again."
      );
    } finally {
      setRechecking(false);
    }
  }, [hasStoredKey, provider.secretKey, rechecking, validateSecret]);

  const handleReplace = useCallback(() => {
    setReplacing(true);
    setExpanded(true);
    setKeyValue("");
    setRejected(null);
    setStatusDetail(null);
    setSaveError(null);
  }, []);

  const storedStatus = storedCredentialStatus ?? "configured";

  return (
    <FlexColumn
      component="article"
      aria-label={provider.name}
      sx={{
        p: SPACING.xl,
        borderBottom: `1px solid ${theme.vars.palette.divider}`,
        "&:last-child": { borderBottom: 0 },
        backgroundColor: theme.vars.palette.background.paper
      }}
    >
      <FlexColumn gap={SPACING.sm}>
        <FlexRow align="center" gap={SPACING.lg} wrap>
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
          <FlexColumn sx={{ flex: "1 1 180px", minWidth: 0 }} gap={SPACING.micro}>
            <FlexRow align="center" gap={SPACING.xs}>
              <Text>
                {provider.name}
              </Text>
            </FlexRow>
            <Caption size="small" sx={{ lineHeight: 1.5 }}>
              {provider.tagline}
            </Caption>
          </FlexColumn>

          {/* Actions */}
          <FlexRow align="center" gap={SPACING.md} wrap sx={{ marginLeft: "auto" }}>
            {hasStoredKey ? (
              <FlexRow align="center" gap={SPACING.micro}>
                <CheckCircleRoundedIcon
                  sx={{
                    fontSize: "1.2em",
                    color:
                      theme.vars.palette[statusColor[storedStatus]].main
                  }}
                />
                <Caption size="small">
                  {statusLabel[storedStatus]}
                </Caption>
                <EditorButton
                  density="compact"
                  variant="text"
                  size="small"
                  onClick={handleRecheck}
                  disabled={rechecking}
                >
                  {rechecking ? "Checking…" : "Recheck"}
                </EditorButton>
                <EditorButton
                  density="compact"
                  variant="outlined"
                  size="small"
                  onClick={handleReplace}
                >
                  Replace key
                </EditorButton>
              </FlexRow>
            ) : oauth.isConnected ? (
              <FlexRow align="center" gap={SPACING.micro}>
                <CheckCircleRoundedIcon
                  sx={{
                    fontSize: "1.2em",
                    color: theme.vars.palette.success.main
                  }}
                />
                <Caption size="small">Connected</Caption>
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
                        <LoginIcon sx={{ fontSize: "1.2em" }} />
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
                    variant="outlined"
                    size="small"
                    startIcon={
                      provider.oauth ? undefined : (
                        <KeyRoundedIcon sx={{ fontSize: "1.2em" }} />
                      )
                    }
                    endIcon={
                      <ExpandMoreRoundedIcon
                        sx={{
                          fontSize: "1.2em",
                          transition: MOTION.transform,
                          ...reducedMotion({ transition: MOTION.none }),
                          transform: expanded ? "rotate(180deg)" : "none"
                        }}
                      />
                    }
                    aria-expanded={expanded}
                    aria-controls={expanded ? keyFieldId : undefined}
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
        {expanded && (!isConnected || replacing) && !provider.oauthOnly && (
          <FlexColumn id={keyFieldId} gap={SPACING.md} className="nodrag nowheel" sx={{ pt: SPACING.lg }}>
            <FlexRow gap={SPACING.xs} align="center">
              <TextInput
                size="small"
                label={`${provider.name} API key`}
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
                {saving ? (
                  <LoadingSpinner size="small" inline />
                ) : replacing ? (
                  "Replace"
                ) : (
                  "Connect"
                )}
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
                endIcon={<OpenInNewIcon sx={{ fontSize: "1.2em" }} />}
                onClick={() =>
                  window.open(provider.keyUrl, "_blank", "noopener,noreferrer")
                }
              >
                Get a {provider.name} key
              </EditorButton>
              <Caption size="smaller" >
                {provider.costHint}
              </Caption>
            </FlexRow>
            {rejected && (
              <FlexRow align="center" gap={SPACING.xs} wrap>
                <Caption role="alert" size="small" color="error" sx={{ flex: 1 }}>
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
              <Caption role="alert" size="small" color="error">
                {saveError}
              </Caption>
            )}
            {statusDetail && !rejected && (
              <Caption
                role="status"
                size="small"
                color={storedStatus === "rejected" ? "error" : undefined}
              >
                {statusDetail}
              </Caption>
            )}
          </FlexColumn>
        )}
        {hasStoredKey && statusDetail && !expanded && (
          <Caption
            role="status"
            size="small"
            color={statusColor[storedStatus]}
            sx={{ maxWidth: 560 }}
          >
            {statusDetail}
          </Caption>
        )}
      </FlexColumn>
      <OAuthManualCompletionDialog
        prompt={oauth.manualPrompt}
        label={oauth.label}
        isSubmitting={oauth.isSubmittingManual}
        onSubmit={oauth.submitManualCode}
        onCancel={oauth.cancelManual}
      />
    </FlexColumn>
  );
};

export default memo(ProviderOnboardingCard);
