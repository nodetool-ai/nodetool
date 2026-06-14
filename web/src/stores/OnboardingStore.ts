/**
 * OnboardingStore
 *
 * Tracks first-run getting-started progress (open a template, run a
 * workflow, build your own) for the dashboard checklist. Persists to
 * localStorage so progress survives reloads. The "connect a provider"
 * step is derived live from configured secrets and is not stored here.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type OnboardingStepId =
  | "open-template"
  | "run-workflow"
  | "create-workflow";

interface OnboardingStore {
  completedSteps: OnboardingStepId[];
  dismissed: boolean;
  markStep: (step: OnboardingStepId) => void;
  dismiss: () => void;
}

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set) => ({
      completedSteps: [],
      dismissed: false,

      markStep: (step: OnboardingStepId) => {
        set((state) =>
          state.completedSteps.includes(step)
            ? state
            : { completedSteps: [...state.completedSteps, step] }
        );
      },

      dismiss: () => {
        set({ dismissed: true });
      }
    }),
    {
      name: "nodetool-onboarding",
      version: 1
    }
  )
);

export default useOnboardingStore;
