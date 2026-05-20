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
 * FLIP animation. On each dependency change this effect runs AFTER React has
 * committed the new layout, so getBoundingClientRect() returns the element's
 * new ("Last") position. `prevRect` holds the position measured at the previous
 * commit (the "First" position), because it was stored by the prior effect run
 * while the DOM was still in its old position. We animate the First→Last delta
 * away via the Web Animations API, then store Last for the next transition.
 */
export function useFlipPosition(
  ref: RefObject<HTMLElement | null>,
  deps: DependencyList
): void {
  const prevRect = useRef<DOMRect | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const last = el.getBoundingClientRect();
    const first = prevRect.current;
    prevRect.current = last;

    if (!first) return;
    if (prefersReducedMotion()) return;

    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const sx = last.width === 0 ? 1 : first.width / last.width;
    const sy = last.height === 0 ? 1 : first.height / last.height;

    if (dx === 0 && dy === 0 && sx === 1 && sy === 1) return;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
