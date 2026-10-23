import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";

import {
  AlertBanner,
  Box,
  Button,
  Caption,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  Text,
  BORDER_RADIUS,
  SPACING
} from "../ui_primitives";
import useSubscriptionOnboardingStore from "../../stores/SubscriptionOnboardingStore";
import { useExtensionStatus } from "../../serverState/useExtensionStatus";
import { useOAuthConnection } from "../../hooks/useOAuthConnection";
import { useSecrets } from "../../hooks/useSecrets";
import { openSettingsTab } from "../workspace/openPageTab";
import geminiColorIcon from "../../icons/providers/gemini-color.svg";
import ProviderOnboardingCard from "./ProviderOnboardingCard";
import ProviderDirectory from "./ProviderDirectory";
import LocalModelsRow from "./LocalModelsRow";
import ChromeExtensionStep from "./ChromeExtensionStep";
import {
  ONBOARDING_PROVIDERS,
  directoryProviders,
  isOnboardingProviderAvailable,
  type OnboardingProvider
} from "./providerOnboardingCatalog";

/**
 * The sign-in subscriptions, in the order the dialog lists them. This page is
 * about the plan the user pays for, so ChatGPT drops the Codex suffix.
 */
export const subscriptionProviders = (): OnboardingProvider[] => {
  const byId = new Map(ONBOARDING_PROVIDERS.map((p) => [p.id, p]));
  const codex = byId.get("codex");
  const claude = byId.get("claude");
  const providers: OnboardingProvider[] = [];
  if (codex) {
    providers.push({
      ...codex,
      name: "ChatGPT",
      tagline: "Chat with GPT models on your ChatGPT plan. Images need the Chrome extension."
    });
  }
  if (claude) {
    providers.push({
      ...claude,
      tagline: "Chat with Claude on your Claude Pro or Max plan."
    });
  }
  return providers.filter(isOnboardingProviderAvailable);
};

/**
 * The API-key route on the same page: the recommended key providers up
 * front, every other AI provider behind "More providers".
 */
export const apiKeyProviders = (): {
  featured: OnboardingProvider[];
  more: OnboardingProvider[];
} => {
  const keyed = ONBOARDING_PROVIDERS.filter(
    (p) => !p.oauthOnly && isOnboardingProviderAvailable(p)
  );
  return {
    featured: keyed.filter((p) => p.recommended),
    more: [...keyed.filter((p) => !p.recommended), ...directoryProviders()]
  };
};

interface GeminiRowProps {
  extensionConnected: boolean;
  onSetUp: () => void;
}

/**
 * Gemini has no sign-in NodeTool can complete: it runs in the user's own
 * gemini.google.com tab through the extension, so the row leads to that page.
 */
const GeminiRow: React.FC<GeminiRowProps> = ({ extensionConnected, onSetUp }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <FlexRow
      component="article"
      aria-label={t("batch2_7.providerOnboarding.gemini")}
      align="center"
      gap={SPACING.lg}
      wrap
      sx={{ p: SPACING.xl, backgroundColor: theme.vars.palette.background.paper }}
    >
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
        <Box component="img" src={geminiColorIcon} alt="" aria-hidden sx={{ width: 24, height: 24 }} />
      </FlexRow>
      <FlexColumn sx={{ flex: "1 1 180px", minWidth: 0 }} gap={SPACING.micro}>
        <Text>Gemini</Text>
        <Caption size="small" sx={{ lineHeight: 1.5 }}>
          {t("batch2_7.providerOnboarding.geminiTagline")}
        </Caption>
      </FlexColumn>
      <FlexRow align="center" gap={SPACING.micro} sx={{ marginLeft: "auto" }}>
        {extensionConnected ? (
          <>
            <CheckCircleRoundedIcon sx={{ fontSize: "1.2em", color: theme.vars.palette.success.main }} />
            <Caption size="small">{t("batch2_7.providerOnboarding.extensionConnected")}</Caption>
          </>
        ) : (
          <EditorButton
            density="compact"
            variant="outlined"
            size="small"
            startIcon={<ExtensionOutlinedIcon />}
            onClick={onSetUp}
          >
            {t("i18n-next115.providerOnboarding.setUp")}
          </EditorButton>
        )}
      </FlexRow>
    </FlexRow>
  );
};

interface SubscriptionsStepProps {
  providers: OnboardingProvider[];
  onSetUpExtension: () => void;
  onOpenSettings: () => void;
}

const SubscriptionsStep: React.FC<SubscriptionsStepProps> = ({
  providers,
  onSetUpExtension,
  onOpenSettings
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { status } = useExtensionStatus();
  const { secrets } = useSecrets();
  const chatgpt = useOAuthConnection("openai");
  const claude = useOAuthConnection("claude");
  const keyProviders = useMemo(() => apiKeyProviders(), []);
  const configuredKeys = useMemo(
    () => new Set(secrets.filter((s) => s.is_configured).map((s) => s.key)),
    [secrets]
  );
  const connectedNames = useMemo(() => {
    const names = providers
      .filter(
        (p) =>
          (p.oauth === "openai" && chatgpt.isConnected) ||
          (p.oauth === "claude" && claude.isConnected)
      )
      .map((p) => p.name);
    if (status?.connected) {
      names.push("Gemini");
    }
    for (const p of [...keyProviders.featured, ...keyProviders.more]) {
      if (configuredKeys.has(p.secretKey)) {
        names.push(p.name);
      }
    }
    return names;
  }, [providers, chatgpt.isConnected, claude.isConnected, status?.connected, keyProviders, configuredKeys]);
  const frame = {
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: BORDER_RADIUS.lg,
    overflow: "hidden"
  };

  return (
    <FlexColumn gap={SPACING.xxl}>
      <Text sx={{ maxWidth: "60ch" }}>{t("batch2_7.providerOnboarding.welcomeIntro")}</Text>
      {connectedNames.length > 0 && (
        <AlertBanner severity="success" compact>
          {t("batch2_7.providerOnboarding.connectedSummary", { providers: connectedNames.join(", ") })}
        </AlertBanner>
      )}
      <FlexColumn gap={SPACING.md}>
        <Text component="h3" size="small">{t("batch2_7.providerOnboarding.planGroup")}</Text>
        <Caption>{t("batch2_7.providerOnboarding.planHint")}</Caption>
        <FlexColumn sx={frame}>
          {providers.map((provider) => (
            <ProviderOnboardingCard key={provider.id} provider={provider} configured={false} />
          ))}
          <GeminiRow extensionConnected={status?.connected ?? false} onSetUp={onSetUpExtension} />
        </FlexColumn>
      </FlexColumn>
      <FlexColumn gap={SPACING.md}>
        <Text component="h3" size="small">{t("batch2_7.providerOnboarding.keyGroup")}</Text>
        <Caption>{t("batch2_7.providerOnboarding.billing")}</Caption>
        <FlexColumn sx={frame}>
          {keyProviders.featured.map((provider) => (
            <ProviderOnboardingCard
              key={provider.id}
              provider={provider}
              configured={configuredKeys.has(provider.secretKey)}
            />
          ))}
        </FlexColumn>
        <ProviderDirectory
          providers={keyProviders.more}
          configuredKeys={configuredKeys}
          onOpenSettings={onOpenSettings}
        />
      </FlexColumn>
      <LocalModelsRow />
      <FlexRow gap={SPACING.md} align="center">
        <LockOutlinedIcon sx={{ fontSize: "1.2em", color: theme.vars.palette.text.secondary }} />
        <Caption>{t("batch2_7.providerOnboarding.encryptedKeys")}</Caption>
      </FlexRow>
    </FlexColumn>
  );
};

/**
 * First-run onboarding: connect any AI the user already has (a ChatGPT or
 * Claude plan, Gemini through the extension, or an API key for any
 * provider), then add the Chrome extension that ChatGPT image generation and
 * every Gemini request run through.
 */
const SubscriptionOnboardingDialog: React.FC = () => {
  const { t } = useTranslation();
  const { open, step, setStep, dismiss } = useSubscriptionOnboardingStore(
    useShallow((s) => ({ open: s.open, step: s.step, setStep: s.setStep, dismiss: s.dismiss }))
  );
  const providers = useMemo(() => subscriptionProviders(), []);

  const handleNext = useCallback(() => setStep("extension"), [setStep]);
  const handleBack = useCallback(() => setStep("subscriptions"), [setStep]);
  const handleOpenSettings = useCallback(() => {
    dismiss();
    openSettingsTab("providers");
  }, [dismiss]);

  if (!open) {
    return null;
  }

  const onSubscriptions = step === "subscriptions";

  return (
    <Dialog
      open={open}
      onClose={dismiss}
      maxWidth="sm"
      fullWidth
      title={onSubscriptions ? t("batch2_7.providerOnboarding.subscriptionsTitle") : t("batch2_7.providerOnboarding.addExtensionTitle")}
      actions={
        onSubscriptions ? (
          <>
            <Button variant="text" color="inherit" onClick={dismiss} sx={{ mr: "auto" }}>
              {t("batch2_7.providerOnboarding.setUpLater")}
            </Button>
            <Button variant="contained" onClick={handleNext}>
              {t("i18n-next118.providerOnboarding.nextExtension")}
            </Button>
          </>
        ) : (
          <>
            <Button variant="text" color="inherit" onClick={handleBack} sx={{ mr: "auto" }}>
              {t("i18n-next118.providerOnboarding.back")}
            </Button>
            <Button variant="contained" onClick={dismiss}>
              {t("i18n-next118.providerOnboarding.done")}
            </Button>
          </>
        )
      }
    >
      <FlexColumn gap={SPACING.xl}>
        <Caption>{t("batch2_7.providerOnboarding.stepCount", { current: onSubscriptions ? 1 : 2, total: 2 })}</Caption>
        {onSubscriptions ? (
          <SubscriptionsStep
            providers={providers}
            onSetUpExtension={handleNext}
            onOpenSettings={handleOpenSettings}
          />
        ) : (
          <ChromeExtensionStep />
        )}
      </FlexColumn>
    </Dialog>
  );
};

export default memo(SubscriptionOnboardingDialog);
