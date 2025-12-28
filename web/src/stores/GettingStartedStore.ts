import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface GettingStartedProgress {
  hasCreatedWorkflow: boolean;
  hasTriedTemplate: boolean;
}

interface GettingStartedStore {
  progress: GettingStartedProgress;
  setHasCreatedWorkflow: (value: boolean) => void;
  setHasTriedTemplate: (value: boolean) => void;
  resetProgress: () => void;
}

const defaultProgress: GettingStartedProgress = {
  hasCreatedWorkflow: false,
  hasTriedTemplate: false
};

export const useGettingStartedStore = create<GettingStartedStore>()(
  persist(
    (set) => ({
      progress: { ...defaultProgress },
      
      setHasCreatedWorkflow: (value: boolean) =>
        set((state) => ({
          progress: {
            ...state.progress,
            hasCreatedWorkflow: value
          }
        })),
      
      setHasTriedTemplate: (value: boolean) =>
        set((state) => ({
          progress: {
            ...state.progress,
            hasTriedTemplate: value
          }
        })),
      
      resetProgress: () => set({ progress: { ...defaultProgress } })
    }),
    {
      name: "gettingStarted",
      partialize: (state) => ({
        progress: state.progress
      })
    }
  )
);
