import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

const MAX_RECENT_SEARCHES = 10;

interface RecentSearch {
  term: string;
  timestamp: number;
  resultCount: number;
}

interface RecentSearchesState {
  recentSearches: RecentSearch[];
  addSearch: (term: string, resultCount: number) => void;
  removeSearch: (term: string) => void;
  clearSearches: () => void;
  getSearches: () => RecentSearch[];
}

export const useRecentSearchesStore = create<RecentSearchesState>()(
  persist(
    (set, get) => ({
      recentSearches: [],

      addSearch: (term: string, resultCount: number) => {
        const trimmedTerm = term.trim().toLowerCase();
        if (!trimmedTerm) {
          return;
        }

        set((state) => {
          const existingIndex = state.recentSearches.findIndex(
            (s) => s.term === trimmedTerm
          );

          const newSearch: RecentSearch = {
            term: trimmedTerm,
            timestamp: Date.now(),
            resultCount
          };

          let newSearches = [...state.recentSearches];

          if (existingIndex !== -1) {
            newSearches.splice(existingIndex, 1);
          }

          newSearches.unshift(newSearch);

          if (newSearches.length > MAX_RECENT_SEARCHES) {
            newSearches = newSearches.slice(0, MAX_RECENT_SEARCHES);
          }

          return { recentSearches: newSearches };
        });
      },

      removeSearch: (term: string) => {
        const trimmedTerm = term.trim().toLowerCase();
        set((state) => ({
          recentSearches: state.recentSearches.filter(
            (s) => s.term !== trimmedTerm
          )
        }));
      },

      clearSearches: () => {
        set({ recentSearches: [] });
      },

      getSearches: () => {
        return get().recentSearches;
      }
    }),
    {
      name: "recent-searches-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ recentSearches: state.recentSearches })
    }
  )
);
