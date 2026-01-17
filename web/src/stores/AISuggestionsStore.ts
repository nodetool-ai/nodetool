/**
 * AI Node Suggestions Store
 *
 * Manages AI-powered node suggestions based on the current workflow context.
 * This is an experimental feature that provides smart recommendations for
 * nodes that could enhance or extend the current workflow.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { NodeMetadata } from "./ApiTypes";

export interface NodeSuggestion {
  nodeType: string;
  reason: string;
  confidence: number;
  metadata: NodeMetadata;
}

export interface SuggestionFeedback {
  nodeType: string;
  helpful: boolean;
  timestamp: number;
}

export type AISuggestionsStore = {
  suggestions: NodeSuggestion[];
  isLoading: boolean;
  error: string | null;
  feedback: Record<string, SuggestionFeedback>;
  setSuggestions: (suggestions: NodeSuggestion[]) => void;
  clearSuggestions: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  recordFeedback: (nodeType: string, helpful: boolean) => void;
  getFeedback: (nodeType: string) => SuggestionFeedback | undefined;
  clearFeedback: () => void;
};

export const useAISuggestionsStore = create<AISuggestionsStore>()(
  persist(
    (set, get) => ({
      suggestions: [],
      isLoading: false,
      error: null,
      feedback: {},
      setSuggestions: (suggestions) => set({ suggestions, isLoading: false, error: null }),
      clearSuggestions: () => set({ suggestions: [], isLoading: false, error: null }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error, isLoading: false }),
      recordFeedback: (nodeType, helpful) =>
        set((state) => ({
          feedback: {
            ...state.feedback,
            [nodeType]: {
              nodeType,
              helpful,
              timestamp: Date.now()
            }
          }
        })),
      getFeedback: (nodeType) => get().feedback[nodeType],
      clearFeedback: () => set({ feedback: {} })
    }),
    {
      name: "ai-suggestions-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ feedback: state.feedback })
    }
  )
);

export default useAISuggestionsStore;
