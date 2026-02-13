/**
 * SearchHistoryStore
 *
 * This module manages the search history for the node menu.
 * It handles:
 * - Adding search terms to history
 * - Removing individual search terms
 * - Clearing all search history
 * - Persisting history to localStorage
 *
 * The store uses Zustand for state management with persist middleware
 * to maintain search history across browser sessions.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SearchHistoryEntry {
  term: string;
  timestamp: number;
}

export interface SearchHistoryStore {
  entries: SearchHistoryEntry[];
  addSearchTerm: (term: string) => void;
  removeSearchTerm: (term: string) => void;
  clearHistory: () => void;
  getRecentSearches: (limit?: number) => SearchHistoryEntry[];
}

export const MAX_HISTORY_SIZE = 50;
export const DEFAULT_RECENT_LIMIT = 8;

/**
 * Create the search history store with localStorage persistence
 */
export const useSearchHistoryStore = create<SearchHistoryStore>()(
  persist(
    (set, get) => ({
      entries: [],

      /**
       * Adds a search term to the history
       * - Removes any existing entry with the same term
       * - Adds the new entry at the beginning
       * - Trims history to max size if needed
       */
      addSearchTerm: (term: string) => {
        const trimmedTerm = term.trim();
        if (trimmedTerm.length === 0) {
          return;
        }

        set((state) => {
          // Remove any existing entry with the same term
          const filteredEntries = state.entries.filter(
            (entry) => entry.term !== trimmedTerm
          );

          // Add new entry at the beginning
          const newEntry: SearchHistoryEntry = {
            term: trimmedTerm,
            timestamp: Date.now()
          };

          const updatedEntries = [newEntry, ...filteredEntries];

          // Trim to max size
          return {
            entries: updatedEntries.slice(0, MAX_HISTORY_SIZE)
          };
        });
      },

      /**
       * Removes a specific search term from history
       */
      removeSearchTerm: (term: string) => {
        set((state) => ({
          entries: state.entries.filter((entry) => entry.term !== term)
        }));
      },

      /**
       * Clears all search history
       */
      clearHistory: () => {
        set({ entries: [] });
      },

      /**
       * Gets the most recent searches, ordered by most recent first
       * @param limit - Maximum number of entries to return (defaults to 8)
       */
      getRecentSearches: (limit: number = DEFAULT_RECENT_LIMIT) => {
        const { entries } = get();
        return entries.slice(0, limit);
      }
    }),
    {
      name: "nodetool-search-history",
      version: 1
    }
  )
);

export default useSearchHistoryStore;
