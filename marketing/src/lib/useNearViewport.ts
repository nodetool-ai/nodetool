"use client";
import { RefObject, useEffect, useState } from "react";

/**
 * True once the element comes within `rootMargin` of the viewport, and true
 * from then on. Gate a `<video poster>` on it: unlike `<img loading="lazy">`,
 * a poster downloads on page load wherever the video sits, so a page of
 * video cards fetched every poster before the reader scrolled.
 */
export function useNearViewport(
  ref: RefObject<Element | null>,
  rootMargin = "600px"
): boolean {
  const [near, setNear] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || near) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
        }
      },
      { rootMargin }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, rootMargin, near]);

  return near;
}
