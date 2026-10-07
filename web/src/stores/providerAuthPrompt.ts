import type { NodeErrorDetail } from "@nodetool-ai/protocol";

import { openProviderOnboarding } from "./ProviderOnboardingStore";
import { openProviderSignIn } from "./ProviderSignInStore";

/**
 * Runs that already opened provider onboarding. A missing credential usually
 * fails every model node in the graph, and one dialog per run is the point —
 * the second one would just re-open what the user is already looking at.
 */
const authPromptedRuns = new Set<string>();

/**
 * A node died because the provider refused the credential. Send the user to
 * the screen that fixes it, pre-expanded on the key that failed, instead of
 * leaving them to read the provider's prose out of a toast.
 */
export const promptForProviderAuth = (
  detail: NodeErrorDetail,
  runKey: string
): void => {
  if (detail.code !== "provider_auth" || authPromptedRuns.has(runKey)) {
    return;
  }
  authPromptedRuns.add(runKey);
  // A subscription login has no key to fix: offer the sign-in itself.
  if (detail.provider && openProviderSignIn(detail.provider)) {
    return;
  }
  const provider = detail.provider ?? "the provider";
  const onboarding: Parameters<typeof openProviderOnboarding>[0] = {
    reason: `The run stopped because ${provider} rejected the credentials. Reconnect it to continue.`
  };
  if (detail.secret_key) {
    onboarding.highlightSecretKey = detail.secret_key;
  }
  openProviderOnboarding(onboarding);
};

/** Forget that a run prompted, so a rerun under the same id can prompt again. */
export const resetProviderAuthPrompt = (runKey: string): void => {
  authPromptedRuns.delete(runKey);
};
