// web/src/components/chat/composer/useFlipPosition.ts
import { useLayoutEffect, useRef, type RefObject, type DependencyList } from "react";

const FLIP_DURATION_MS = 350;
const FLIP_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * FLIP animation: after every dependency change, compares the element's
 * previous bounding rect with its current one and animates the delta away via
 * the Web Animations API. The element must already have moved to its final
 * layout position (set by the caller) before this effect runs.
 */
export function useFlipPosition(
  ref: RefObject<HTMLElement | null>,
  deps: DependencyList
): void {
  const prevRect = useRef<DOMRect | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // "Last" — element has already moved to its new layout position.
    const last = el.getBoundingClientRect();
    const first = prevRect.current;

    if (first && !prefersReducedMotion()) {
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      const sx = last.width === 0 ? 1 : first.width / last.width;
      const sy = last.height === 0 ? 1 : first.height / last.height;

      if (dx !== 0 || dy !== 0 || sx !== 1 || sy !== 1) {
        el.animate(
          [
            {
              transformOrigin: "top left",
              transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`
            },
            { transformOrigin: "top left", transform: "none" }
          ],
          { duration: FLIP_DURATION_MS, easing: FLIP_EASING, fill: "both" }
        );
      }
    }

    // Capture the "First" position for the next transition (cleanup runs
    // just before the next effect, after the next layout has committed).
    return () => {
      if (ref.current) {
        prevRect.current = ref.current.getBoundingClientRect();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
