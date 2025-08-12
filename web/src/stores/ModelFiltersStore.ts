import { create } from "zustand";

export type TypeTag =
  | "instruct"
  | "chat"
  | "base"
  | "sft"
  | "dpo"
  | "reasoning"
  | "code"
  | "math";

export type SizeBucket =
  | "1-2B"
  | "3-7B"
  | "8-15B"
  | "16-34B"
  | "35-70B"
  | "70B+";

export interface ModelFiltersState {
  selectedTypes: TypeTag[];
  sizeBucket: SizeBucket | null;
  families: string[]; // e.g., llama, qwen, mistral

  toggleType: (tag: TypeTag) => void;
  setSizeBucket: (b: SizeBucket | null) => void;
  toggleFamily: (f: string) => void;
  clearAll: () => void;
}

const useModelFiltersStore = create<ModelFiltersState>((set) => ({
  selectedTypes: [],
  sizeBucket: null,
  families: [],

  toggleType: (tag) =>
    set((s) => ({
      selectedTypes: s.selectedTypes.includes(tag)
        ? s.selectedTypes.filter((t) => t !== tag)
        : [...s.selectedTypes, tag]
    })),
  setSizeBucket: (b) => set({ sizeBucket: b }),
  toggleFamily: (f) =>
    set((s) => ({
      families: s.families.includes(f)
        ? s.families.filter((x) => x !== f)
        : [...s.families, f]
    })),
  clearAll: () =>
    set({
      selectedTypes: [],
      sizeBucket: null,
      families: []
    })
}));

export default useModelFiltersStore;
