/**
 * useStoryboardShotFocus
 *
 * The board's receiving end of a cross-document link. A script line's gutter
 * chip or a cut clip's inspector parks a shot id before opening the board's
 * tab; this applies it once the board has loaded that shot.
 *
 * Selecting straight from the click site does not work: a board that is not
 * already open has no entry in the store yet, and `selectShot` on a board the
 * store does not carry is a no-op — the tab would open on nothing.
 */

import { useEffect } from "react";

import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import {
  useDocumentFocusRequest,
  useDocumentFocusStore
} from "../../stores/DocumentFocusStore";

export const useStoryboardShotFocus = (
  boardId: string | null | undefined
): void => {
  const request = useDocumentFocusRequest("storyboard", boardId);
  const hasShot = useStoryboardStore((state) =>
    request
      ? !!state.boards[request.ref]?.shots.some((s) => s.id === request.shotId)
      : false
  );
  const selectShot = useStoryboardStore((state) => state.selectShot);
  const clearDocumentFocus = useDocumentFocusStore(
    (state) => state.clearDocumentFocus
  );

  useEffect(() => {
    if (!request || !hasShot) {
      return;
    }
    selectShot(request.ref, request.shotId);
    clearDocumentFocus(request);
    // `scrollIntoView` is absent under jsdom, so the call is guarded rather
    // than the test environment stubbed.
    document
      .querySelector<HTMLElement>(`[data-shot-id="${request.shotId}"]`)
      ?.scrollIntoView?.({ block: "center" });
  }, [request, hasShot, selectShot, clearDocumentFocus]);
};

export default useStoryboardShotFocus;
