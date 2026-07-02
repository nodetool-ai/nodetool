/**
 * Media readiness for frame-exact captures.
 *
 * The demo players embed the production components, which render plain
 * `<video>` elements (`preload="metadata"` by default). A frame renderer
 * screenshots as soon as React commits, which is *before* those videos have
 * decoded their first frame — video cards capture black. This hook lets a
 * host block the capture until media is paintable; the in-app preview passes
 * nothing and keeps today's lazy behavior.
 *
 * Timing subtlety: the seek (`engine.seekToTime`) runs in a layout effect and
 * updates zustand stores, and the components that own the `<video>` elements
 * re-render in a *subsequent* commit — so scanning the DOM synchronously here
 * would miss them. Instead the hook immediately reports one "scan" promise
 * (holding the capture open), waits two animation frames for the store-driven
 * commit to land, then scans: every video that hasn't decoded a frame yet is
 * nudged to load fully and reported as another pending promise that settles
 * on `loadeddata`. A Remotion host maps each promise to a `delayRender`
 * handle (see demo/src/promo/usePendingMediaDelay.ts).
 */
import { useLayoutEffect, useRef, type RefObject } from "react";

export type PendingMediaHandler = (pending: Promise<void>) => void;

/** readyState >= HAVE_CURRENT_DATA means a frame is decoded and paintable. */
const HAVE_CURRENT_DATA = 2;

export function useMediaReadiness(
  rootRef: RefObject<HTMLElement | null>,
  timeMs: number,
  onPendingMedia?: PendingMediaHandler
): void {
  // Videos we already nudged with load(); re-loading them every tick would
  // restart the fetch and never converge.
  const nudged = useRef(new WeakSet<HTMLVideoElement>());

  useLayoutEffect(() => {
    if (!onPendingMedia) return;
    let cancelled = false;

    const waitFor = (video: HTMLVideoElement): Promise<void> =>
      new Promise<void>((resolve) => {
        const settle = () => {
          video.removeEventListener("loadeddata", settle);
          video.removeEventListener("error", settle);
          resolve();
        };
        video.addEventListener("loadeddata", settle);
        video.addEventListener("error", settle);
      });

    const scan = (resolveScan: () => void) => {
      const root = rootRef.current;
      if (!cancelled && root) {
        for (const video of root.querySelectorAll("video")) {
          if (video.readyState >= HAVE_CURRENT_DATA) continue;
          if (!video.currentSrc && !video.src) continue;
          if (!nudged.current.has(video)) {
            nudged.current.add(video);
            video.muted = true;
            video.preload = "auto";
            video.load();
          }
          onPendingMedia(waitFor(video));
        }
      }
      resolveScan();
    };

    // Hold the capture open until the post-commit scan has run.
    onPendingMedia(
      new Promise<void>((resolveScan) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => scan(resolveScan))
        );
      })
    );

    return () => {
      cancelled = true;
    };
  }, [rootRef, timeMs, onPendingMedia]);
}
