/**
 * OnboardingStore
 *
 * Tracks first-run getting-started progress for the checklist on the
 * new-project surface: start a guided flow, describe an idea for the project
 * agent, and keep creating from examples or blank documents. Persists to
 * localStorage so progress survives reloads. The "connect a provider" step
 * is derived live from configured secrets and is not stored here — only the
 * fact that the first-run sign-in offer was already made, so a user who
 * declined it is not asked again on every launch. It also counts active usage
 * time for the one-time GitHub star prompt.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type OnboardingStepId =
  | "start-guided-flow"
  | "describe-idea"
  | "keep-creating";

/** Every step the checklist tracks, in checklist order. */
export const ONBOARDING_STEP_IDS: readonly OnboardingStepId[] = [
  "start-guided-flow",
  "describe-idea",
  "keep-creating"
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
  /**
   * The user sent a description from the new-project composer. The
   * describe-idea step completes on the first finished run after that, so
   * running an example without describing anything does not tick it.
   */
  ideaDescribed: boolean;
  /**
   * The person has seen a first output: a chat reply, a finished workflow
   * run, a screenplay or a game design. Retires the first-run starters.
   */
  firstResult: boolean;
  /** Milliseconds the app was open and focused, summed across sessions. */
  activeUsageMs: number;
  /** The GitHub star prompt has been shown once already. */
  githubStarPromptShown: boolean;
  markStep: (step: OnboardingStepId) => void;
  markIdeaDescribed: () => void;
  markFirstResult: () => void;
  dismiss: () => void;
  addActiveUsage: (ms: number) => void;
  markGithubStarPromptShown: () => void;
}

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set) => ({
      completedSteps: [],
      dismissed: false,
      ideaDescribed: false,
      firstResult: false,
      activeUsageMs: 0,
      githubStarPromptShown: false,

      markStep: (step: OnboardingStepId) => {
        set((state) =>
          state.completedSteps.includes(step)
            ? state
            : { completedSteps: [...state.completedSteps, step] }
        );
      },

      markIdeaDescribed: () => {
        set({ ideaDescribed: true });
      },

      markFirstResult: () => {
        set({ firstResult: true });
      },

      dismiss: () => {
        set({ dismissed: true });
      },

      addActiveUsage: (ms: number) => {
        set((state) => ({ activeUsageMs: state.activeUsageMs + ms }));
      },

      markGithubStarPromptShown: () => {
        set({ githubStarPromptShown: true });
      }
    }),
    {
      name: "nodetool-onboarding",
      // Older versions recorded exploration and clicks, not successful
      // outcomes. Do not turn those actions into completed work after the
      // success-only semantics were introduced.
      version: 4,
      migrate: (persistedState, version) => {
        if (version >= 4 || typeof persistedState !== "object" || persistedState === null) {
          return persistedState as OnboardingStore;
        }
        return {
          ...(persistedState as object),
          completedSteps: []
        } as unknown as OnboardingStore;
      }
    }
  )
);

export default useOnboardingStore;
