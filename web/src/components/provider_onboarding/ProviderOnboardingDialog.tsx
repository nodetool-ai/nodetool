/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import {
  Box, Caption, Dialog, EditorButton, FlexColumn, FlexRow, Text,
  BORDER_RADIUS, SPACING
} from "../ui_primitives";
import { useSecrets } from "../../hooks/useSecrets";
import useProviderOnboardingStore from "../../stores/ProviderOnboardingStore";
import { isElectron, isLocalhost } from "../../lib/env";
import { openSettingsTab } from "../workspace/openPageTab";
import ollamaIcon from "../../icons/providers/ollama.svg";
import ProviderOnboardingCard from "./ProviderOnboardingCard";
import { CAPABILITY_LABELS, providersForCapability } from "./providerOnboardingCatalog";

const ProviderOnboardingDialog: React.FC = () => {
  const theme = useTheme();
  const { open, capability, reason, highlightSecretKey, dismiss } =
    useProviderOnboardingStore(useShallow((s) => ({
      open: s.open, capability: s.capability, reason: s.reason,
      highlightSecretKey: s.highlightSecretKey, dismiss: s.dismiss
    })));
  const { secrets } = useSecrets();
  const configuredKeys = useMemo(
    () => new Set(secrets.filter((s) => s.is_configured).map((s) => s.key)),
    [secrets]
  );
  const providers = useMemo(() => providersForCapability(capability), [capability]);
  const groups = [
    { title: "Sign in with your account", providers: providers.filter((p) => p.oauth) },
    { title: "Use an API key", providers: providers.filter((p) => !p.oauth) }
  ];
  const showLocal = (isElectron || isLocalhost) &&
    (!capability || capability === "generate_message" || capability === "generate_embedding");
  const handleOpenSettings = useCallback(() => {
    dismiss();
    openSettingsTab("providers");
  }, [dismiss]);

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={dismiss}
      maxWidth="sm"
      fullWidth
      title="Connect an AI provider"
      actions={
        <FlexRow justify="space-between" gap={SPACING.md} wrap sx={{ width: "100%", px: SPACING.md }}>
          <EditorButton variant="text" onClick={handleOpenSettings}>See all providers in Settings</EditorButton>
          <EditorButton variant="outlined" onClick={dismiss}>Done</EditorButton>
        </FlexRow>
      }
    >
      <FlexColumn gap={SPACING.xxl}>
        <FlexColumn gap={SPACING.md}>
          <Text sx={{ maxWidth: "60ch" }}>
            {reason ?? (capability
              ? `Connect a provider for ${CAPABILITY_LABELS[capability]} to continue.`
              : "Choose an account or API key to use models in your workflows.")}
          </Text>
          <Caption size="small">Your API usage is billed directly to your provider account.</Caption>
        </FlexColumn>
        {groups.filter((group) => group.providers.length > 0).map((group) => (
          <FlexColumn key={group.title} gap={SPACING.md}>
            <Text component="h3" size="small">{group.title}</Text>
            <FlexColumn sx={{ border: `1px solid ${theme.vars.palette.divider}`, borderRadius: BORDER_RADIUS.lg, overflow: "hidden" }}>
              {group.providers.map((provider) => (
                <ProviderOnboardingCard
                  key={provider.id}
                  provider={provider}
                  configured={configuredKeys.has(provider.secretKey)}
                  defaultExpanded={highlightSecretKey === provider.secretKey}
                />
              ))}
            </FlexColumn>
          </FlexColumn>
        ))}
        {showLocal && (
          <FlexRow align="center" gap={SPACING.lg} wrap>
            <Box component="img" src={ollamaIcon} alt="" sx={{ width: 28, height: 28, ...theme.applyStyles("dark", { filter: "invert(1)" }) }} />
            <FlexColumn gap={SPACING.xs} sx={{ flex: "1 1 180px" }}>
              <Text size="small">Prefer local models?</Text>
              <Caption>Install Ollama and download a model to run on your machine.</Caption>
            </FlexColumn>
            <EditorButton component="a" href="https://ollama.com/download" target="_blank" rel="noopener noreferrer" variant="text" endIcon={<OpenInNewIcon sx={{ fontSize: "1.2em" }} />}>Get Ollama</EditorButton>
          </FlexRow>
        )}
        <FlexRow gap={SPACING.md} align="center">
          <LockOutlinedIcon sx={{ fontSize: "1.2em", color: theme.vars.palette.text.secondary }} />
          <Caption>API keys are encrypted. You can manage or remove them in Settings.</Caption>
        </FlexRow>
      </FlexColumn>
    </Dialog>
  );
};

export default memo(ProviderOnboardingDialog);
