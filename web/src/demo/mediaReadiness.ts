/**
 * Media readiness for frame-exact captures.
 *
 * The demo players embed the production components, which play media through
 * plain `<video>` elements — the node cards render them directly, and the
 * timeline's `PreviewCompositor` keeps an off-screen pool it draws onto a
 * canvas. A frame renderer screenshots as soon as React commits, which can be
 * before those videos have decoded (or finished seeking to) the target frame,
 * so video surfaces capture black. This hook lets a host block the capture
 * until media has settled; the in-app preview passes nothing and keeps
 * today's lazy behavior.
 *
 * Timing subtleties, all handled by one convergence loop:
 *  - the seek runs in a layout effect and the media-bearing components
 *    re-render in a later commit — a synchronous DOM scan misses them;
 *  - the compositor assigns pool `src`s in its own effects, possibly several
 *    commits after the seek — one deferred scan misses those too;
 *  - a loaded video that is still seeking paints its previous frame — the
 *    capture must also wait for `seeked`, then leave animation frames for
 *    the canvas draw tick.
 *
 * So: report one promise that resolves only after repeated scans find no
 * pending video (bounded rounds, per-round timeout — a failed load must not
 * hang the render). A Remotion host maps the promise to a `delayRender`
 * handle (see demo/src/promo/usePendingMediaDelay.ts).
 */
import { useLayoutEffect, useRef, type RefObject } from "react";

export type PendingMediaHandler = (pending: Promise<void>) => void;

/** readyState >= HAVE_CURRENT_DATA means a frame is decoded and paintable. */
const HAVE_CURRENT_DATA = 2;
const MAX_ROUNDS = 20;
const ROUND_TIMEOUT_MS = 1500;

const twoFrames = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

const withTimeout = (p: Promise<void>, ms: number): Promise<void> =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    const done = () => {
      clearTimeout(t);
      resolve();
    };
    p.then(done, done);
  });

const isPending = (video: HTMLVideoElement): boolean => {
  if (!video.currentSrc && !video.src) return false;
  if (video.error) return false;
  return video.readyState < HAVE_CURRENT_DATA || video.seeking;
};

const waitForSettle = (video: HTMLVideoElement): Promise<void> =>
  new Promise<void>((resolve) => {
    const settle = () => {
      video.removeEventListener("loadeddata", settle);
      video.removeEventListener("seeked", settle);
      video.removeEventListener("error", settle);
      resolve();
    };
    video.addEventListener("loadeddata", settle);
    video.addEventListener("seeked", settle);
    video.addEventListener("error", settle);
  });

export function useMediaReadiness(
  rootRef: RefObject<HTMLElement | null>,
  timeMs: number,
  onPendingMedia?: PendingMediaHandler
): void {
  // Videos we already nudged with load(); re-loading them every round would
  // restart the fetch and never converge.
  const nudged = useRef(new WeakSet<HTMLVideoElement>());

  useLayoutEffect(() => {
    if (!onPendingMedia) return;
    let cancelled = false;

    const settleAll = async (): Promise<void> => {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        // Let the store-driven commits land and the canvas draw tick run.
        await twoFrames();
        if (cancelled) return;
        const root = rootRef.current;
        if (!root) return;

        const pending = Array.from(root.querySelectorAll("video")).filter(
          isPending
        );
        if (pending.length === 0) return;

        for (const video of pending) {
          if (!nudged.current.has(video)) {
            nudged.current.add(video);
            video.muted = true;
            video.preload = "auto";
            if (video.readyState === 0) video.load();
          }
        }
        await withTimeout(
          Promise.all(pending.map(waitForSettle)).then(() => undefined),
          ROUND_TIMEOUT_MS
        );
        if (cancelled) return;
      }
    };

    onPendingMedia(settleAll());

    return () => {
      cancelled = true;
    };
  }, [rootRef, timeMs, onPendingMedia]);
}
