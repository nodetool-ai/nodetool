import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useProvidersByCapability } from "../../../hooks/useProviders";
import { openProviderOnboarding } from "../../../stores/ProviderOnboardingStore";
import type { MediaMode } from "../../../stores/MediaGenerationStore";
import { capabilityForMode, setupReasonKeyForMode } from "./modeProviderSetup";

interface ModeProviderSetup {
  /** True when the mode needs a capability no configured provider serves. */
  needsSetup: boolean;
  /** Banner copy for the current mode (null when nothing is needed). */
  reason: string | null;
  /** Open the provider-onboarding dialog filtered to the mode's capability. */
  openSetup: () => void;
}

/**
 * Watches whether the selected composer mode has a configured provider behind
 * it. The providers endpoint only lists providers whose credential is present,
 * so an empty capability-filtered list means the mode cannot run until the
 * user connects a provider.
 * While the provider query is loading or errored the check stays quiet — the
 * connection banner already surfaces fetch errors.
 */
export const useModeProviderSetup = (mode: MediaMode): ModeProviderSetup => {
  const { t } = useTranslation();
  const capability = capabilityForMode(mode);
  const reasonKey = setupReasonKeyForMode(mode);
  const modeReason = reasonKey ? t(reasonKey) : null;
  const { providers, isLoading, error } = useProvidersByCapability(
    capability ?? "generate_message"
  );
  const needsSetup =
    capability !== null && !isLoading && !error && providers.length === 0;
  const reason = needsSetup ? modeReason : null;

  const openSetup = useCallback(() => {
    if (!capability) return;
    openProviderOnboarding({
      capability,
      reason: modeReason ?? undefined
    });
  }, [capability, modeReason]);

  return { needsSetup, reason, openSetup };
};
