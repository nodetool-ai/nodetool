/**
 * Offer a sign-in the first time the local app opens with no language model
 * behind it.
 *
 * Nothing in NodeTool runs without a provider, and the fastest way to get one
 * on a desktop install is a Claude or OpenAI login — both sign in against an
 * existing subscription and write their credentials to this machine, so there
 * is no key to create and paste. The provider onboarding dialog already leads
 * with those two, so this opens that dialog once rather than building a second
 * surface.
 *
 * It fires only on a local install (the sign-ins finish on the server's own
 * loopback listener), only once the providers query has settled with nothing
 * configured, and only once per install — a user who closed it gets the
 * checklist and the in-context prompts, not the dialog again on every launch.
 */

import { useEffect } from "react";

import { isElectron, isLocalhost } from "../lib/env";
import useOnboardingStore from "../stores/OnboardingStore";
import { openProviderOnboarding } from "../stores/ProviderOnboardingStore";
import { useLanguageModelProviders } from "./useProviders";

/** Copy for the dialog subtitle, naming the two logins the offer is about. */
export const FIRST_RUN_SIGN_IN_REASON =
  "Sign in with Claude or OpenAI to use a subscription you already pay for — or connect any other provider with an API key.";

interface FirstRunSignInInput {
  /** Browser and server share a machine, so a loopback sign-in can finish. */
  isLocalApp: boolean;
  /** The offer was already made once on this install. */
  offered: boolean;
  /** The providers query has not settled yet. */
  isLoading: boolean;
  /** The providers query failed — an empty list here means nothing. */
  hasError: boolean;
  /** Language-model providers the server reports as configured. */
  providerCount: number;
}

/** Whether this launch is the one that should offer a sign-in. */
export const shouldOfferFirstRunSignIn = ({
  isLocalApp,
  offered,
  isLoading,
  hasError,
  providerCount
}: FirstRunSignInInput): boolean =>
  isLocalApp && !offered && !isLoading && !hasError && providerCount === 0;

export const useFirstRunProviderSignIn = (): void => {
  const { providers, isLoading, error } = useLanguageModelProviders();
  const offered = useOnboardingStore((state) => state.providerSignInOffered);
  const markOffered = useOnboardingStore(
    (state) => state.markProviderSignInOffered
  );

  useEffect(() => {
    const offer = shouldOfferFirstRunSignIn({
      isLocalApp: isElectron || isLocalhost,
      offered,
      isLoading,
      // A pending or failed query is not an empty one: prompting on either
      // would interrupt a user who already has a provider.
      hasError: error !== null,
      providerCount: providers.length
    });
    if (!offer) {
      return;
    }
    markOffered();
    openProviderOnboarding({
      capability: "generate_message",
      reason: FIRST_RUN_SIGN_IN_REASON
    });
  }, [offered, isLoading, error, providers, markOffered]);
};

export default useFirstRunProviderSignIn;
