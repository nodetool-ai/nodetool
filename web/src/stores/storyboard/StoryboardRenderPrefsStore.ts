/**
 * StoryboardRenderPrefsStore
 *
 * The render settings the creator last confirmed, so the next render dialog
 * opens on them. It is a preference, persisted per browser and shared by
 * every board rather than saved into any one of them.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CLIP_RESOLUTION } from "@nodetool-ai/protocol";

interface StoryboardRenderPrefsState {
  /** The resolution of the last clip rendered from the shot render dialog. */
  clipResolution: string;
  setClipResolution: (resolution: string) => void;
}

export const useStoryboardRenderPrefsStore =
  create<StoryboardRenderPrefsState>()(
    persist(
      (set) => ({
        clipResolution: CLIP_RESOLUTION,
        setClipResolution: (clipResolution) => set({ clipResolution })
      }),
      { name: "storyboard-render-prefs", version: 1 }
    )
  );
