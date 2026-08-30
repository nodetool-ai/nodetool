/**
 * Drive every `<video>` under a root to a point in its own media.
 *
 * The production components play clips through plain `<video>` elements — the
 * storyboard's shot cards are the case that matters here. A frame renderer
 * never presses play, so those elements sit on their first decoded frame, and
 * a board of six rendered clips renders as a board of six stills. Seeking them
 * per frame is what makes the difference between a still and a clip visible.
 *
 * The time wraps on each element's own duration, so takes of different lengths
 * keep moving for the whole shot instead of freezing when the shortest ends.
 *
 * Pairs with `./mediaReadiness.ts`: this sets the playhead, that one blocks the
 * capture until the seek has landed. Call this first so the readiness scan sees
 * the pending seek.
 */
import { useLayoutEffect, type RefObject } from "react";

/** Convergence rounds: the media-bearing components commit after the seek. */
const ROUNDS = 4;

const twoFrames = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

export function useVideoPlayhead(
  rootRef: RefObject<HTMLElement | null>,
  timeMs: number | undefined
): void {
  useLayoutEffect(() => {
    if (timeMs == null) return;
    let cancelled = false;

    const apply = (): void => {
      const root = rootRef.current;
      if (!root) return;
      for (const video of Array.from(root.querySelectorAll("video"))) {
        const { duration } = video;
        if (!Number.isFinite(duration) || duration <= 0) continue;
        video.muted = true;
        const target = (timeMs / 1000) % duration;
        // Re-seeking to where it already is restarts a decode for nothing.
        if (Math.abs(video.currentTime - target) > 0.01) {
          video.currentTime = target;
        }
      }
    };

    apply();
    void (async () => {
      for (let round = 0; round < ROUNDS; round++) {
        await twoFrames();
        if (cancelled) return;
        apply();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rootRef, timeMs]);
}
