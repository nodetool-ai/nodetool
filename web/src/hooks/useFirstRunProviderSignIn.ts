/**
 * Offer the subscription onboarding the first time the local app opens with
 * no API key stored.
 *
 * Nothing in NodeTool runs without a provider, and the fastest way to get one
 * on a desktop install is a plan the user already pays for: ChatGPT and
 * Claude sign in and write their credentials to this machine, and ChatGPT
 * images and Gemini run in the user's own Chrome through the extension. The
 * subscription onboarding dialog walks through both.
 *
 * The trigger reads stored keys, not the providers list. On a local install
 * the subscription and extension providers (Claude, ChatGPT, Gemini web) need
 * no credential, so the server always lists them as language-model providers
 * and a "no provider configured" test never passes.
 *
 * It fires only on a local install (the sign-ins finish on the server's own
 * loopback listener and the extension providers are local-only), only once the
 * secrets query has settled with no key stored, and only once per install. A
 * user who closed it gets the checklist and the in-context prompts, not the
 * dialog again on every launch.
 */

import { useEffect } from "react";

import { isElectron, isLocalhost } from "../lib/env";
import useOnboardingStore from "../stores/OnboardingStore";
import { openSubscriptionOnboarding } from "../stores/SubscriptionOnboardingStore";
import { useSecrets } from "./useSecrets";

interface FirstRunSignInInput {
  /** Browser and server share a machine, so a loopback sign-in can finish. */
  isLocalApp: boolean;
  /** The offer was already made once on this install. */
  offered: boolean;
  /** The secrets query has not settled yet. */
  isLoading: boolean;
  /** The secrets query failed. An empty list here means nothing. */
  hasError: boolean;
  /** API keys stored for the user or set in the server's environment. */
  configuredKeyCount: number;
}

/** Whether this launch is the one that should offer the onboarding. */
export const shouldOfferFirstRunSignIn = ({
  isLocalApp,
  offered,
  isLoading,
  hasError,
  configuredKeyCount
}: FirstRunSignInInput): boolean =>
  isLocalApp && !offered && !isLoading && !hasError && configuredKeyCount === 0;

export const useFirstRunProviderSignIn = (): void => {
  const { secrets, isLoading, isSuccess } = useSecrets();
  const offered = useOnboardingStore((state) => state.providerSignInOffered);
  const markOffered = useOnboardingStore(
    (state) => state.markProviderSignInOffered
  );
  const configuredKeyCount = secrets.filter((s) => s.is_configured).length;

  useEffect(() => {
    const offer = shouldOfferFirstRunSignIn({
      isLocalApp: isElectron || isLocalhost,
      offered,
      isLoading,
      // A pending or failed query is not an empty one: prompting on either
      // would interrupt a user who already has a key.
      hasError: !isLoading && !isSuccess,
      configuredKeyCount
    });
    if (!offer) {
      return;
    }
    markOffered();
    openSubscriptionOnboarding();
  }, [offered, isLoading, isSuccess, configuredKeyCount, markOffered]);
};

export default useFirstRunProviderSignIn;
