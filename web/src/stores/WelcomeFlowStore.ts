/**
 * WelcomeFlowStore
 *
 * Tracks whether the dashboard welcome flow ("What do you want to make
 * today?") has been dismissed. Once the user picks a starter track or skips,
 * the dashboard shows the chat composer instead of the picker. Persisted to
 * localStorage so the flow only greets a user until they engage with it.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WelcomeFlowState {
  dismissed: boolean;
  dismiss: () => void;
  reset: () => void;
}

export const useWelcomeFlowStore = create<WelcomeFlowState>()(
  persist(
    (set) => ({
      dismissed: false,
      dismiss: () => set({ dismissed: true }),
      reset: () => set({ dismissed: false })
    }),
    {
      name: "welcome-flow",
      version: 1
    }
  )
);
