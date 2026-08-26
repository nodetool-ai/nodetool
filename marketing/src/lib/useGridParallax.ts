"use client";

import { useEffect, useRef, useState } from "react";

/** Whether the visitor asked the OS for less motion. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

/** How far the grid moves per pixel scrolled. */
const PARALLAX_FACTOR = 0.5;

/**
 * Parallax for the fixed grid layer every landing page carries.
 *
 * The layer is viewport-sized and `position: fixed`, so it moves by
 * `background-position` rather than transform. Reduced motion means the grid
 * does not move at all: no scroll listener, and the offset reset to zero. It
 * must not be "pinned to the document" — for a fixed layer that is the
 * fastest apparent motion, not the least.
 *
 * Returns the ref to put on the grid element.
 */
export function useGridParallax() {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      if (ref.current) ref.current.style.backgroundPositionY = "0px";
      return;
    }

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (ref.current) {
          ref.current.style.backgroundPositionY = `${
            -window.scrollY * PARALLAX_FACTOR
          }px`;
        }
        ticking = false;
      });
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [reducedMotion]);

  return ref;
}
