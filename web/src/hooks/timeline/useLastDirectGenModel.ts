/**
 * useLastDirectGenModel — Zustand selector that returns the provider+model
 * from the most recently added direct-gen clip in the current sequence, so
 * a fresh prompt input can preselect "the same model you used last time"
 * without forcing the user to pick it again.
 *
 * Reactive by design: when a sequence loads, when the user adds a new
 * direct-gen clip, or when a clip's binding changes, the value updates and
 * any consuming component re-renders. Returns `{ provider: undefined,
 * model: undefined }` when no direct-gen clip exists.
 *
 * The shallow comparator keeps re-renders tight — consumers only re-render
 * when provider or model actually changes, not on every clips-array swap.
 */
import { shallow } from "zustand/shallow";
import { useTimelineStore } from "../../stores/timeline/TimelineStore";

export interface LastDirectGenModel {
  provider: string | undefined;
  model: string | undefined;
}

export const useLastDirectGenModel = (): LastDirectGenModel =>
  useTimelineStore((state) => {
    for (let i = state.clips.length - 1; i >= 0; i--) {
      const c = state.clips[i];
      if (
        (c.bindingKind === "text-to-image" ||
          c.bindingKind === "image-to-image") &&
        c.provider &&
        c.model
      ) {
        return { provider: c.provider, model: c.model };
      }
    }
    return { provider: undefined, model: undefined };
  }, shallow);
