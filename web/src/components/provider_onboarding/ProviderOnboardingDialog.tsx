/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import KeyRoundedIcon from "@mui/icons-material/KeyRounded";
import ComputerRoundedIcon from "@mui/icons-material/ComputerRounded";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";

import {
  Box,
  Caption,
  Card,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  Text,
  BORDER_RADIUS,
  SPACING
} from "../ui_primitives";
import { useSecrets } from "../../hooks/useSecrets";
import useProviderOnboardingStore from "../../stores/ProviderOnboardingStore";
import { openSettingsTab } from "../workspace/openPageTab";
import ollamaIcon from "../../icons/providers/ollama.svg";
import ProviderOnboardingCard from "./ProviderOnboardingCard";
import CostGuide from "./CostGuide";
import {
  CAPABILITY_LABELS,
  providersForCapability
} from "./providerOnboardingCatalog";

const SectionHeading = ({
  icon,
  title,
  subtitle
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) => {
  const theme = useTheme();
  return (
    <FlexRow align="center" gap={SPACING.xs}>
      <FlexRow
        align="center"
        justify="center"
        sx={{ color: theme.vars.palette.primary.main }}
      >
        {icon}
      </FlexRow>
      <FlexColumn gap={SPACING.none}>
        <Text size="small" weight={600}>
          {title}
        </Text>
        <Caption size="smaller" sx={{ opacity: 0.6 }}>
          {subtitle}
        </Caption>
      </FlexColumn>
    </FlexRow>
  );
};

/**
 * Global onboarding dialog shown whenever a user is blocked by an unconfigured
 * AI provider. Introduces providers in plain language, leads with one-click
 * OAuth sign-in (Claude, OpenAI, Hugging Face), offers inline API-key entry for the
 * rest, points at a free local option, and explains how costs work.
 */
const ProviderOnboardingDialog: React.FC = () => {
  const theme = useTheme();
  const { open, capability, reason, highlightSecretKey, dismiss } =
    useProviderOnboardingStore(
      useShallow((s) => ({
        open: s.open,
        capability: s.capability,
        reason: s.reason,
        highlightSecretKey: s.highlightSecretKey,
        dismiss: s.dismiss
      }))
    );

  const { secrets } = useSecrets();
  const configuredKeys = useMemo(
    () => new Set(secrets.filter((s) => s.is_configured).map((s) => s.key)),
    [secrets]
  );

  const providers = useMemo(
    () => providersForCapability(capability),
    [capability]
  );
  const oauthProviders = useMemo(
    () => providers.filter((p) => p.oauth),
    [providers]
  );
  // Name the sign-ins actually on offer rather than a fixed list: a hosted
  // deployment drops the ones that can only finish on the server's machine.
  const oauthNames = useMemo(
    () => oauthProviders.map((p) => p.name).join(", "),
    [oauthProviders]
  );
  const keyProviders = useMemo(
    () => providers.filter((p) => !p.oauth),
    [providers]
  );

  const subtitle = capability
    ? `Connect a provider for ${CAPABILITY_LABELS[capability]} to continue.`
    : "Connect a provider to unlock AI models across the editor and your workflows.";

  const handleOpenSettings = useCallback(() => {
    dismiss();
    openSettingsTab("providers");
  }, [dismiss]);

  if (!open) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onClose={dismiss}
      maxWidth="sm"
      fullWidth
      title={
        <FlexColumn gap={SPACING.micro}>
          <Text size="big" weight={600}>
            Connect an AI provider
          </Text>
          <Caption sx={{ opacity: 0.7, lineHeight: 1.4 }}>
            {reason ?? subtitle}
          </Caption>
        </FlexColumn>
      }
    >
      <FlexColumn gap={SPACING.lg} sx={{ mt: SPACING.xs }}>
        <Caption sx={{ opacity: 0.75, lineHeight: 1.55 }}>
          NodeTool connects to AI providers with your own account. Pick one
          below — your credentials are encrypted and stored locally, and you can
          add more or switch anytime.
        </Caption>

        {oauthProviders.length > 0 && (
          <FlexColumn gap={SPACING.sm}>
            <SectionHeading
              icon={<BoltRoundedIcon sx={{ fontSize: 18 }} />}
              title="Sign in — fastest way to start"
              subtitle={`One click with ${oauthNames}. No API key to create.`}
            />
            {oauthProviders.map((provider) => (
              <ProviderOnboardingCard
                key={provider.id}
                provider={provider}
                configured={configuredKeys.has(provider.secretKey)}
                defaultExpanded={highlightSecretKey === provider.secretKey}
              />
            ))}
          </FlexColumn>
        )}

        {keyProviders.length > 0 && (
          <FlexColumn gap={SPACING.sm}>
            <SectionHeading
              icon={<KeyRoundedIcon sx={{ fontSize: 18 }} />}
              title="Connect with an API key"
              subtitle="Create a key on the provider's site and paste it here."
            />
            {keyProviders.map((provider) => (
              <ProviderOnboardingCard
                key={provider.id}
                provider={provider}
                configured={configuredKeys.has(provider.secretKey)}
                defaultExpanded={highlightSecretKey === provider.secretKey}
              />
            ))}
          </FlexColumn>
        )}

        {/* Free local option */}
        <FlexColumn gap={SPACING.sm}>
          <SectionHeading
            icon={<ComputerRoundedIcon sx={{ fontSize: 18 }} />}
            title="Run locally, free"
            subtitle="No API key or internet needed."
          />
          <Card
            variant="outlined"
            padding="compact"
            sx={{
              borderRadius: BORDER_RADIUS.lg,
              border: `1px solid ${theme.vars.palette.divider}`
            }}
          >
            <FlexRow align="center" gap={SPACING.sm}>
              <FlexRow
                align="center"
                justify="center"
                sx={{
                  width: 42,
                  height: 42,
                  minWidth: 42,
                  borderRadius: BORDER_RADIUS.lg,
                  backgroundColor: theme.vars.palette.background.default
                }}
              >
                <Box
                  component="img"
                  src={ollamaIcon}
                  alt=""
                  aria-hidden
                  sx={{
                    width: 24,
                    height: 24,
                    objectFit: "contain",
                    ...theme.applyStyles("dark", { filter: "invert(1)" })
                  }}
                />
              </FlexRow>
              <FlexColumn sx={{ flex: 1, minWidth: 0 }} gap={SPACING.micro}>
                <Text size="small" weight={600}>
                  Ollama
                </Text>
                <Caption sx={{ opacity: 0.7, lineHeight: 1.4 }}>
                  Download open models and run them on your own machine —
                  private and free.
                </Caption>
              </FlexColumn>
              <EditorButton
                density="compact"
                variant="outlined"
                size="small"
                endIcon={<OpenInNewIcon sx={{ fontSize: 13 }} />}
                onClick={() =>
                  window.open(
                    "https://ollama.com/download",
                    "_blank",
                    "noopener,noreferrer"
                  )
                }
              >
                Get Ollama
              </EditorButton>
            </FlexRow>
          </Card>
        </FlexColumn>

        <CostGuide />

        <FlexRow justify="center" sx={{ pt: SPACING.micro }}>
          <EditorButton
            density="compact"
            variant="text"
            size="small"
            startIcon={<SettingsOutlinedIcon sx={{ fontSize: 15 }} />}
            onClick={handleOpenSettings}
          >
            See all providers in Settings
          </EditorButton>
        </FlexRow>
      </FlexColumn>
    </Dialog>
  );
};

export default memo(ProviderOnboardingDialog);
