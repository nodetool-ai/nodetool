/**
 * Editor state for the chord lanes: the selected chord and the lane snap.
 * Client state only; the chords themselves live on the chord track.
 */

import { create } from "zustand";

export type ChordSnap = "bar" | "beat" | "sixteenth";

export interface SelectedChord {
  trackId: string;
  chordId: string;
}

interface HarmonyUIState {
  selectedChord: SelectedChord | null;
  snap: ChordSnap;
  selectChord: (selected: SelectedChord | null) => void;
  setSnap: (snap: ChordSnap) => void;
}

export const useHarmonyUIStore = create<HarmonyUIState>((set) => ({
  selectedChord: null,
  snap: "beat",
  selectChord: (selectedChord) => set({ selectedChord }),
  setSnap: (snap) => set({ snap })
}));
