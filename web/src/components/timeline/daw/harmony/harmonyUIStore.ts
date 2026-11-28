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
  /** The Chord row names chords as Roman numerals in the key. Off by default. */
  showNumerals: boolean;
  selectChord: (selected: SelectedChord | null) => void;
  setSnap: (snap: ChordSnap) => void;
  setShowNumerals: (showNumerals: boolean) => void;
}

export const useHarmonyUIStore = create<HarmonyUIState>((set) => ({
  selectedChord: null,
  snap: "beat",
  showNumerals: false,
  selectChord: (selectedChord) => set({ selectedChord }),
  setSnap: (snap) => set({ snap }),
  setShowNumerals: (showNumerals) => set({ showNumerals })
}));
