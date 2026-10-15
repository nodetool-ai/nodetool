import { create } from "zustand";

export type SizeBucket =
  | "1-2B"
  | "3-7B"
  | "8-15B"
  | "16-34B"
  | "35-70B"
  | "70B+";

interface ModelFiltersState {
  sizeBucket: SizeBucket | null;
  families: string[]; // e.g., llama, qwen, mistral

  setSizeBucket: (b: SizeBucket | null) => void;
  toggleFamily: (f: string) => void;
  clearAll: () => void;
}

const useModelFiltersStore = create<ModelFiltersState>((set) => ({
  sizeBucket: null,
  families: [],

  setSizeBucket: (b) => set({ sizeBucket: b }),
  toggleFamily: (f) =>
    set((s) => ({
      families: s.families.includes(f)
        ? s.families.filter((x) => x !== f)
        : [...s.families, f]
    })),
  clearAll: () =>
    set({
      sizeBucket: null,
      families: []
    })
}));

export default useModelFiltersStore;
