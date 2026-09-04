/**
 * OnboardingStore
 *
 * Tracks first-run getting-started progress (open a template, run a
 * workflow, build your own) for the checklist on the new-project surface.
 * Persists to localStorage so progress survives reloads. The "connect a
 * provider" step is derived live from configured secrets and is not stored
 * here — only the fact that the first-run sign-in offer was already made, so
 * a user who declined it is not asked again on every launch.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type OnboardingStepId =
  | "open-template"
  | "run-workflow"
  | "create-workflow";

/** Every step the checklist tracks, in checklist order. */
export const ONBOARDING_STEP_IDS: readonly OnboardingStepId[] = [
  "open-template",
  "run-workflow",
  "create-workflow"
];

interface OnboardingProgress {
  completedSteps: OnboardingStepId[];
  dismissed: boolean;
}

/** True once the user dismissed the checklist or finished every step. */
export const isOnboardingFinished = ({
  completedSteps,
  dismissed
}: OnboardingProgress): boolean =>
  dismissed || ONBOARDING_STEP_IDS.every((id) => completedSteps.includes(id));

interface OnboardingStore {
  completedSteps: OnboardingStepId[];
  dismissed: boolean;
  /** The first-run provider sign-in offer has been shown once already. */
  providerSignInOffered: boolean;
  markStep: (step: OnboardingStepId) => void;
  dismiss: () => void;
  markProviderSignInOffered: () => void;
}

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set) => ({
      completedSteps: [],
      dismissed: false,
      providerSignInOffered: false,

      markStep: (step: OnboardingStepId) => {
        set((state) =>
          state.completedSteps.includes(step)
            ? state
            : { completedSteps: [...state.completedSteps, step] }
        );
      },

      dismiss: () => {
        set({ dismissed: true });
      },

      markProviderSignInOffered: () => {
        set({ providerSignInOffered: true });
      }
    }),
    {
      name: "nodetool-onboarding",
      version: 1
    }
  )
);

export default useOnboardingStore;
