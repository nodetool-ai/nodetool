/**
 * Bridges the players' `onPendingMedia` callback to Remotion's render clock:
 * each reported promise holds a `delayRender` handle until the video has
 * decoded a paintable frame, so no captured frame shows a black video card.
 */
import { useCallback } from "react";
import { continueRender, delayRender } from "remotion";
import type { PendingMediaHandler } from "@web-demo";

export function usePendingMediaDelay(label: string): PendingMediaHandler {
  return useCallback<PendingMediaHandler>(
    (pending) => {
      const handle = delayRender(`${label}: waiting for video frame`);
      const release = () => continueRender(handle);
      pending.then(release, release);
    },
    [label]
  );
}
