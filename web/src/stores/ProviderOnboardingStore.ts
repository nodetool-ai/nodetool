import { create } from "zustand";

/**
 * Backend capability strings a blocking point can require. These match the
 * `capabilities` returned by the providers endpoint (see useProviders.ts), so
 * the onboarding dialog can filter its catalog to providers that unblock the
 * feature the user was trying to use.
 */
export type OnboardingCapability =
  | "generate_message"
  | "text_to_image"
  | "text_to_speech"
  | "automatic_speech_recognition"
  | "text_to_music"
  | "text_to_video"
  | "generate_embedding";

interface OpenOptions {
  /** Feature the user was blocked on — filters and orders the provider list. */
  capability?: OnboardingCapability;
  /** Friendly one-liner explaining why the dialog appeared. */
  reason?: string;
  /** Secret key of a provider to pre-expand (e.g. from a per-node warning). */
  highlightSecretKey?: string;
}

interface ProviderOnboardingState {
  open: boolean;
  capability?: OnboardingCapability;
  reason?: string;
  highlightSecretKey?: string;
  show: (options?: OpenOptions) => void;
  dismiss: () => void;
}

/**
 * Drives the global provider-onboarding dialog. Any place a user gets blocked
 * by an unconfigured AI provider — the chat welcome screen, an inline model
 * callout, a per-node "key missing" warning, the model menu — opens this
 * instead of routing to Settings, so the user can connect a provider (OAuth or
 * API key) in context and keep going.
 */
export const useProviderOnboardingStore = create<ProviderOnboardingState>(
  (set) => ({
    open: false,
    capability: undefined,
    reason: undefined,
    highlightSecretKey: undefined,
    show: (options) =>
      set({
        open: true,
        capability: options?.capability,
        reason: options?.reason,
        highlightSecretKey: options?.highlightSecretKey
      }),
    dismiss: () =>
      set({
        open: false,
        capability: undefined,
        reason: undefined,
        highlightSecretKey: undefined
      })
  })
);

/** Imperative opener for non-React call sites (run gate, event handlers). */
export const openProviderOnboarding = (options?: OpenOptions): void => {
  useProviderOnboardingStore.getState().show(options);
};

export default useProviderOnboardingStore;
