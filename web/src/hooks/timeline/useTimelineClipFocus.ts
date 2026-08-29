/**
 * useTimelineClipFocus
 *
 * The receiving half of a deep link into the cut. A cross-document link parks
 * a clip id in `DocumentFocusStore` before opening the timeline tab; this runs
 * inside the editor and applies it once the document has loaded — selects the
 * clip, parks the playhead at its start, and asks the lanes to scroll it into
 * view. The request is dropped as soon as it is applied, so a later edit does
 * not re-select the clip.
 *
 * A request naming a clip the sequence does not carry (deleted since the link
 * was drawn) stays pending and applies to nothing; the tab still opens.
 */

import { useEffect } from "react";

import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import { useTimelineUIStoreApi } from "../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStoreApi } from "../../stores/timeline/TimelinePlaybackStore";
import {
  useDocumentFocusRequest,
  useDocumentFocusStore
} from "../../stores/DocumentFocusStore";

export const useTimelineClipFocus = (
  sequenceId: string | null | undefined
): void => {
  const request = useDocumentFocusRequest("timeline", sequenceId);
  const clip = useTimelineStore((state) =>
    request ? (state.clips.find((c) => c.id === request.clipId) ?? null) : null
  );
  const uiStore = useTimelineUIStoreApi();
  const playbackStore = useTimelinePlaybackStoreApi();
  const clearDocumentFocus = useDocumentFocusStore(
    (state) => state.clearDocumentFocus
  );

  useEffect(() => {
    if (!request || !clip) {
      return;
    }
    uiStore.getState().selectClip(clip.id);
    uiStore.getState().revealAt(clip.startMs);
    playbackStore.getState().seek(clip.startMs);
    clearDocumentFocus(request);
  }, [request, clip, uiStore, playbackStore, clearDocumentFocus]);
};

export default useTimelineClipFocus;
