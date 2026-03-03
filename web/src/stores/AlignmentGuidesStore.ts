import { create } from "zustand";
import { AlignmentGuide } from "../hooks/useAlignmentGuides";

interface AlignmentGuidesState {
  guides: AlignmentGuide[];
  setGuides: (guides: AlignmentGuide[]) => void;
  clearGuides: () => void;
}

export const useAlignmentGuidesStore = create<AlignmentGuidesState>((set) => ({
  guides: [],
  setGuides: (guides: AlignmentGuide[]) => set({ guides }),
  clearGuides: () => set({ guides: [] })
}));
