import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_HISTORY_SIZE = 10;

interface SearchHistoryState {
  history: string[];
  addSearchTerm: (term: string) => void;
  removeSearchTerm: (term: string) => void;
  clearHistory: () => void;
  getRecentSearches: (limit?: number) => string[];
}

/**
 * Zustand store for managing search history in the Find in Workflow feature.
 *
 * Provides functionality to:
 * - Add search terms to history (deduplicated, most recent first)
 * - Remove specific search terms from history
 * - Clear all search history
 * - Get recent searches with optional limit
 *
 * History is persisted to localStorage via zustand persist middleware.
 *
 * @example
 * ```typescript
 * const { addSearchTerm, getRecentSearches } = useSearchHistoryStore();
 *
 * // Add a search term
 * addSearchTerm("text to image");
 *
 * // Get recent searches (limited to 5)
 * const recent = getRecentSearches(5);
 * ```
 */
export const useSearchHistoryStore = create<SearchHistoryState>()(
  persist(
    (set, get) => ({
      history: [],

      addSearchTerm: (term: string) => {
        const trimmed = term.trim();
        if (!trimmed) {
          return;
        }

        const { history } = get();
        const filtered = history.filter((t) => t !== trimmed);
        const newHistory = [trimmed, ...filtered].slice(0, MAX_HISTORY_SIZE);

        set({ history: newHistory });
      },

      removeSearchTerm: (term: string) => {
        const { history } = get();
        set({ history: history.filter((t) => t !== term) });
      },

      clearHistory: () => {
        set({ history: [] });
      },

      getRecentSearches: (limit: number = MAX_HISTORY_SIZE) => {
        const { history } = get();
        return history.slice(0, limit);
      }
    }),
    {
      name: "nodetool-search-history"
    }
  )
);
