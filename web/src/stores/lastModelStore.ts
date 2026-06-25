/**
 * lastModelStore
 *
 * Remembers the last direct-generation model the user picked, per media kind,
 * persisted across sessions. Both the timeline and sketch editors write here
 * whenever a model is chosen and read it as the default when a fresh clip /
 * layer has no model yet — so you don't re-pick the same model every time, even
 * in a brand-new document.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ModelKind = "image" | "video" | "audio";

export interface RememberedModel {
  provider?: string;
  model?: string;
  /** TTS voice; only meaningful for the "audio" kind. */
  voice?: string;
}

interface LastModelState {
  byKind: Partial<Record<ModelKind, RememberedModel>>;
  /** Record the last-used model for a kind. No-ops without provider + model. */
  remember: (kind: ModelKind, value: RememberedModel) => void;
}

export const useLastModelStore = create<LastModelState>()(
  persist(
    (set) => ({
      byKind: {},
      remember: (kind, value) => {
        if (!value.provider || !value.model) {
          return;
        }
        set((state) => {
          const prev = state.byKind[kind];
          if (
            prev &&
            prev.provider === value.provider &&
            prev.model === value.model &&
            prev.voice === value.voice
          ) {
            return state;
          }
          return {
            byKind: {
              ...state.byKind,
              [kind]: {
                provider: value.provider,
                model: value.model,
                voice: value.voice
              }
            }
          };
        });
      }
    }),
    { name: "nodetool-last-models:v1" }
  )
);

/**
 * Map a direct-gen binding kind to its model-kind bucket (text-to-image and
 * image-to-image share the "image" bucket, mirroring the model selectors).
 * Returns null for non-direct-gen bindings (e.g. workflow).
 */
export function modelKindForBinding(
  bindingKind: string | undefined
): ModelKind | null {
  switch (bindingKind) {
    case "text-to-video":
      return "video";
    case "text-to-audio":
      return "audio";
    case "text-to-image":
    case "image-to-image":
    case "inpaint":
      return "image";
    default:
      return null;
  }
}

/** Non-reactive read of the remembered model for a kind. */
export const getRememberedModel = (
  kind: ModelKind
): RememberedModel | undefined => useLastModelStore.getState().byKind[kind];
