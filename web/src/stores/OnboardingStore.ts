/**
 * OnboardingStore
 *
 * Drives the guided onboarding tour: which step is active, which steps the
 * user has completed, and whether the tour has been started or dismissed.
 * The tour renders floating hints directly over the real UI (no fullscreen
 * cards). Completion is detected by subscribing to existing stores
 * (SecretsStore, GlobalChatStore, NodeStore, WorkflowRunner) — see
 * `useOnboardingDetectors`.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type OnboardingStepId =
  | "providers"
  | "chat"
  | "image"
  | "nodes"
  | "connect"
  | "run";

export const ONBOARDING_STEP_ORDER: OnboardingStepId[] = [
  "providers",
  "chat",
  "image",
  "nodes",
  "connect",
  "run"
];

export interface OnboardingState {
  active: boolean;
  /** index into ONBOARDING_STEP_ORDER */
  currentStep: number;
  completed: Record<OnboardingStepId, boolean>;
  /** Set once the user has either finished or explicitly dismissed the tour. */
  dismissed: boolean;

  start: () => void;
  /** Resume the tour at the first incomplete step (falls back to 0). */
  resume: () => void;
  startAt: (stepId: OnboardingStepId) => void;
  next: () => void;
  prev: () => void;
  skip: () => void;
  finish: () => void;
  markComplete: (stepId: OnboardingStepId) => void;
  reset: () => void;
}

const defaultCompleted = (): Record<OnboardingStepId, boolean> => ({
  providers: false,
  chat: false,
  image: false,
  nodes: false,
  connect: false,
  run: false
});

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      active: false,
      currentStep: 0,
      completed: defaultCompleted(),
      dismissed: false,

      start: () =>
        set({
          active: true,
          currentStep: 0,
          dismissed: false
        }),

      resume: () => {
        const { completed } = get();
        const firstIncomplete = ONBOARDING_STEP_ORDER.findIndex(
          (id) => !completed[id]
        );
        set({
          active: true,
          currentStep: firstIncomplete === -1 ? 0 : firstIncomplete,
          dismissed: false
        });
      },

      startAt: (stepId) => {
        const idx = ONBOARDING_STEP_ORDER.indexOf(stepId);
        set({
          active: true,
          currentStep: idx >= 0 ? idx : 0,
          dismissed: false
        });
      },

      next: () => {
        const { currentStep } = get();
        const last = ONBOARDING_STEP_ORDER.length - 1;
        if (currentStep >= last) {
          set({ active: false, dismissed: true });
          return;
        }
        set({ currentStep: currentStep + 1 });
      },

      prev: () => {
        const { currentStep } = get();
        if (currentStep <= 0) return;
        set({ currentStep: currentStep - 1 });
      },

      skip: () => set({ active: false, dismissed: true }),

      finish: () =>
        set({
          active: false,
          dismissed: true,
          completed: ONBOARDING_STEP_ORDER.reduce(
            (acc, id) => ({ ...acc, [id]: true }),
            {} as Record<OnboardingStepId, boolean>
          )
        }),

      markComplete: (stepId) =>
        set((state) => ({
          completed: { ...state.completed, [stepId]: true }
        })),

      reset: () =>
        set({
          active: false,
          currentStep: 0,
          completed: defaultCompleted(),
          dismissed: false
        })
    }),
    {
      name: "onboarding",
      version: 2,
      partialize: (state) => ({
        completed: state.completed,
        dismissed: state.dismissed
      })
    }
  )
);

