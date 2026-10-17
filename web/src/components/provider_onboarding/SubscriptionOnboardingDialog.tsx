import { memo, useCallback, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";

import {
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
import { openProviderOnboarding } from "../../stores/ProviderOnboardingStore";
import { useExtensionStatus } from "../../serverState/useExtensionStatus";
import geminiColorIcon from "../../icons/providers/gemini-color.svg";
import ProviderOnboardingCard from "./ProviderOnboardingCard";
import ChromeExtensionStep from "./ChromeExtensionStep";
import {
  ONBOARDING_PROVIDERS,
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

interface GeminiRowProps {
  extensionConnected: boolean;
  onSetUp: () => void;
}

/**
 * Gemini has no sign-in NodeTool can complete: it runs in the user's own
 * gemini.google.com tab through the extension, so the row leads to that page.
 */
const GeminiRow: React.FC<GeminiRowProps> = ({ extensionConnected, onSetUp }) => {
  const theme = useTheme();
  return (
    <FlexRow
      component="article"
      aria-label="Gemini"
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
          Chat, images and Veo video on your Google account&apos;s Gemini plan. Runs through the Chrome extension.
        </Caption>
      </FlexColumn>
      <FlexRow align="center" gap={SPACING.micro} sx={{ marginLeft: "auto" }}>
        {extensionConnected ? (
          <>
            <CheckCircleRoundedIcon sx={{ fontSize: "1.2em", color: theme.vars.palette.success.main }} />
            <Caption size="small">Extension connected</Caption>
          </>
        ) : (
          <EditorButton
            density="compact"
            variant="outlined"
            size="small"
            startIcon={<ExtensionOutlinedIcon />}
            onClick={onSetUp}
          >
            Set up
          </EditorButton>
        )}
      </FlexRow>
    </FlexRow>
  );
};

interface SubscriptionsStepProps {
  providers: OnboardingProvider[];
  onSetUpExtension: () => void;
}

const SubscriptionsStep: React.FC<SubscriptionsStepProps> = ({
  providers,
  onSetUpExtension
}) => {
  const theme = useTheme();
  const { status } = useExtensionStatus();
  return (
    <FlexColumn gap={SPACING.xxl}>
      <FlexColumn gap={SPACING.md}>
        <Text sx={{ maxWidth: "60ch" }}>
          Sign in with the plans you already pay for. NodeTool uses them
          directly, so there is no API key to create and no per-token bill.
        </Text>
        <Caption>
          Image generation with ChatGPT, and everything with Gemini, needs the
          Chrome extension. The next step sets it up.
        </Caption>
      </FlexColumn>
      <FlexColumn sx={{ border: `1px solid ${theme.vars.palette.divider}`, borderRadius: BORDER_RADIUS.lg, overflow: "hidden" }}>
        {providers.map((provider) => (
          <ProviderOnboardingCard key={provider.id} provider={provider} configured={false} />
        ))}
        <GeminiRow extensionConnected={status?.connected ?? false} onSetUp={onSetUpExtension} />
      </FlexColumn>
    </FlexColumn>
  );
};

/**
 * First-run onboarding for subscriptions: sign in to ChatGPT and Claude, then
 * add the Chrome extension that ChatGPT image generation and every Gemini
 * request run through.
 */
const SubscriptionOnboardingDialog: React.FC = () => {
  const { open, step, setStep, dismiss } = useSubscriptionOnboardingStore(
    useShallow((s) => ({ open: s.open, step: s.step, setStep: s.setStep, dismiss: s.dismiss }))
  );
  const providers = useMemo(() => subscriptionProviders(), []);

  const handleNext = useCallback(() => setStep("extension"), [setStep]);
  const handleBack = useCallback(() => setStep("subscriptions"), [setStep]);
  const handleUseApiKey = useCallback(() => {
    dismiss();
    openProviderOnboarding();
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
      title={onSubscriptions ? "Connect your AI subscriptions" : "Add the Chrome extension"}
      actions={
        onSubscriptions ? (
          <>
            <Button variant="text" color="inherit" onClick={handleUseApiKey} sx={{ mr: "auto" }}>
              Use an API key instead
            </Button>
            <Button variant="contained" onClick={handleNext}>
              Next: Chrome extension
            </Button>
          </>
        ) : (
          <>
            <Button variant="text" color="inherit" onClick={handleBack} sx={{ mr: "auto" }}>
              Back
            </Button>
            <Button variant="contained" onClick={dismiss}>
              Done
            </Button>
          </>
        )
      }
    >
      <FlexColumn gap={SPACING.xl}>
        <Caption>Step {onSubscriptions ? 1 : 2} of 2</Caption>
        {onSubscriptions ? (
          <SubscriptionsStep
            providers={providers}
            onSetUpExtension={handleNext}
          />
        ) : (
          <ChromeExtensionStep />
        )}
      </FlexColumn>
    </Dialog>
  );
};

export default memo(SubscriptionOnboardingDialog);
