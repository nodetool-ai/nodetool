/**
 * OnboardingStore
 *
 * Drives the guided onboarding tour: which step is active, which steps the
 * user has completed, and whether the tour has been started or dismissed.
 * Each step pairs an animated welcome screen with a "now do it in the real
 * UI" hint; completion is detected by subscribing to existing stores
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

/**
 * Each step has two phases:
 * - "intro" — fullscreen animated welcome card with title, illustration, and a
 *   "Let's go" button.
 * - "action" — small floating hint pinned near the relevant UI element while
 *   the user performs the task in the real product.
 */
export type OnboardingPhase = "intro" | "action";

export interface OnboardingState {
  active: boolean;
  /** index into ONBOARDING_STEP_ORDER */
  currentStep: number;
  phase: OnboardingPhase;
  completed: Record<OnboardingStepId, boolean>;
  /** Set once the user has either finished or explicitly dismissed the tour. */
  dismissed: boolean;

  start: () => void;
  /** Resume the tour at the first incomplete step (falls back to 0). */
  resume: () => void;
  startAt: (stepId: OnboardingStepId) => void;
  beginAction: () => void;
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
      phase: "intro",
      completed: defaultCompleted(),
      dismissed: false,

      start: () =>
        set({
          active: true,
          currentStep: 0,
          phase: "intro",
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
          phase: "intro",
          dismissed: false
        });
      },

      startAt: (stepId) => {
        const idx = ONBOARDING_STEP_ORDER.indexOf(stepId);
        set({
          active: true,
          currentStep: idx >= 0 ? idx : 0,
          phase: "intro",
          dismissed: false
        });
      },

      beginAction: () => set({ phase: "action" }),

      next: () => {
        const { currentStep } = get();
        const last = ONBOARDING_STEP_ORDER.length - 1;
        if (currentStep >= last) {
          set({ active: false, dismissed: true });
          return;
        }
        set({ currentStep: currentStep + 1, phase: "intro" });
      },

      prev: () => {
        const { currentStep } = get();
        if (currentStep <= 0) return;
        set({ currentStep: currentStep - 1, phase: "intro" });
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
          phase: "intro",
          completed: defaultCompleted(),
          dismissed: false
        })
    }),
    {
      name: "onboarding",
      version: 1,
      partialize: (state) => ({
        completed: state.completed,
        dismissed: state.dismissed
      })
    }
  )
);

export const getActiveStepId = (state: OnboardingState): OnboardingStepId =>
  ONBOARDING_STEP_ORDER[
    Math.max(
      0,
      Math.min(state.currentStep, ONBOARDING_STEP_ORDER.length - 1)
    )
  ];
