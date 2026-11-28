/**
 * Model3DCameraDragStore — whether a plain drag in the timeline preview moves
 * the selected 3D clip's camera.
 *
 * The camera gestures are otherwise behind Alt, which many Linux desktops take
 * for moving the window, so the gesture never reaches the page there. With
 * this on, a drag orbits (Shift trucks) and the wheel dollies (Ctrl changes the
 * lens) without Alt. In memory only, and off until the user turns it on.
 */
import { create } from "zustand";

interface Model3DCameraDragState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export const useModel3DCameraDragStore = create<Model3DCameraDragState>(
  (set) => ({
    enabled: false,
    setEnabled: (enabled) => set({ enabled })
  })
);
