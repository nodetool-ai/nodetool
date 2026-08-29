/**
 * useScriptLineFocus
 *
 * The receiving half of a deep link into a script. A storyboard shot's
 * "Appears in" chip parks a line id before opening the script tab; this runs
 * inside the pane and, once the document has lines, highlights that line and
 * scrolls it into view.
 *
 * The request is one-shot — dropped as soon as it is applied — but the
 * highlight is not: it stays until playback or another link moves it, the way
 * a jumped-to line should stay findable.
 */

import { useEffect, useState } from "react";

import {
  useDocumentFocusRequest,
  useDocumentFocusStore
} from "../../stores/DocumentFocusStore";

export const useScriptLineFocus = (
  scriptId: string | null | undefined,
  ready: boolean
): string | null => {
  const request = useDocumentFocusRequest("script", scriptId);
  const clearDocumentFocus = useDocumentFocusStore(
    (state) => state.clearDocumentFocus
  );
  const [focusedLineId, setFocusedLineId] = useState<string | null>(null);

  useEffect(() => {
    if (!request || !ready) {
      return;
    }
    setFocusedLineId(request.lineId);
    clearDocumentFocus(request);
    // `scrollIntoView` is absent under jsdom, so the call is guarded rather
    // than the test environment stubbed.
    document
      .querySelector<HTMLElement>(`[data-line-id="${request.lineId}"]`)
      ?.scrollIntoView?.({ block: "center" });
  }, [request, ready, clearDocumentFocus]);

  return focusedLineId;
};

export default useScriptLineFocus;
