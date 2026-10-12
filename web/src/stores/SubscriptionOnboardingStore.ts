import { create } from "zustand";

/** The two pages of the subscription onboarding dialog, in order. */
export type SubscriptionOnboardingStep = "subscriptions" | "extension";

interface SubscriptionOnboardingState {
  open: boolean;
  step: SubscriptionOnboardingStep;
  show: (step?: SubscriptionOnboardingStep) => void;
  setStep: (step: SubscriptionOnboardingStep) => void;
  dismiss: () => void;
}

/**
 * Drives the subscription onboarding dialog: sign in to the ChatGPT and
 * Claude subscriptions the user already pays for, then add the Chrome
 * extension that ChatGPT and Gemini media generation run through.
 */
export const useSubscriptionOnboardingStore =
  create<SubscriptionOnboardingState>((set) => ({
    open: false,
    step: "subscriptions",
    show: (step = "subscriptions") => set({ open: true, step }),
    setStep: (step) => set({ step }),
    dismiss: () => set({ open: false, step: "subscriptions" })
  }));

/** Imperative opener for non-React call sites. */
export const openSubscriptionOnboarding = (
  step?: SubscriptionOnboardingStep
): void => {
  useSubscriptionOnboardingStore.getState().show(step);
};

export default useSubscriptionOnboardingStore;
