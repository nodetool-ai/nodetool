"use client";
import { RefObject, useEffect } from "react";
import { usePrefersReducedMotion } from "./useGridParallax";

/**
 * Plays a video muted while at least half of it is on screen, and pauses it
 * when it leaves. Browsers allow autoplay only without sound, so the native
 * controls stay available to unmute. Reduced motion leaves it on its poster.
 * `resetKey` restarts the observer when the element is swapped.
 */
export function useAutoplayInView(
  videoRef: RefObject<HTMLVideoElement | null>,
  resetKey?: string
): void {
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const video = videoRef.current;
    if (!video || reducedMotion || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        if (visible) {
          // React does not reliably reflect the `muted` prop onto the element,
          // and an unmuted play() is refused.
          if (video.paused) {
            video.muted = true;
            void video.play().catch(() => {});
          }
        } else if (!video.paused) {
          video.pause();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [videoRef, reducedMotion, resetKey]);
}
