/**
 * useLastDirectGenModel — Zustand selector that returns the provider+model
 * from the most recently added direct-gen clip in the current sequence, so
 * a fresh prompt input can preselect "the same model you used last time"
 * without forcing the user to pick it again.
 *
 * Scoped per media kind: image and video tracks remember their last model
 * independently, so switching tracks doesn't bleed an image model into the
 * video selector or vice versa.
 *
 * Reactive by design: when a sequence loads, when the user adds a new
 * direct-gen clip, or when a clip's binding changes, the value updates and
 * any consuming component re-renders. Returns `{ provider: undefined,
 * model: undefined }` when no matching direct-gen clip exists.
 *
 * The shallow comparator keeps re-renders tight — consumers only re-render
 * when provider or model actually changes, not on every clips-array swap.
 */
import { useShallow } from "zustand/react/shallow";
import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import { useLastModelStore } from "../../stores/lastModelStore";

export interface LastDirectGenModel {
  provider: string | undefined;
  model: string | undefined;
  /** TTS voice for audio kind; undefined for image/video. */
  voice: string | undefined;
}

export type DirectGenMediaKind = "image" | "video" | "audio";

const matchesKind = (
  bindingKind: string | undefined,
  kind: DirectGenMediaKind
): boolean => {
  if (kind === "video") return bindingKind === "text-to-video";
  if (kind === "audio") return bindingKind === "text-to-audio";
  return (
    bindingKind === "text-to-image" || bindingKind === "image-to-image"
  );
};

export const useLastDirectGenModel = (
  kind: DirectGenMediaKind = "image"
): LastDirectGenModel => {
  const inDoc = useTimelineStore(
    useShallow((state): LastDirectGenModel => {
      for (let i = state.clips.length - 1; i >= 0; i--) {
        const c = state.clips[i];
        if (matchesKind(c.bindingKind, kind) && c.provider && c.model) {
          return {
            provider: c.provider,
            model: c.model,
            voice: kind === "audio" ? c.voice : undefined
          };
        }
      }
      return { provider: undefined, model: undefined, voice: undefined };
    })
  );

  // Fall back to the cross-session remembered model so a fresh sequence (no
  // matching clip yet) still preselects the model you last used.
  const remembered = useLastModelStore((s) => s.byKind[kind]);

  if (inDoc.model) {
    return inDoc;
  }
  return {
    provider: remembered?.provider,
    model: remembered?.model,
    voice: kind === "audio" ? remembered?.voice : undefined
  };
};
