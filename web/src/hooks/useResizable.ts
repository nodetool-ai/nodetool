import { useCallback, useMemo, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

interface ResizableSize {
  width: number;
  height: number;
}

/** Edges/corners that can initiate a resize (top-left stays anchored). */
export type ResizeDirection = "right" | "bottom" | "bottom-right";

interface UseResizableOptions {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  /** Called once when a resize gesture ends, with the final measured size. */
  onResizeEnd?: (size: ResizableSize) => void;
}

const clamp = (value: number, min?: number, max?: number) => {
  let v = value;
  if (max !== undefined && v > max) v = max;
  if (min !== undefined && v < min) v = min;
  return v;
};

/**
 * Pointer-events based resize for a target element, sized from the top-left
 * anchor (right / bottom / corner handles grow or shrink width/height). A
 * sibling of {@link useDraggable}: it sets `width`/`height` imperatively during
 * the gesture (no per-move React render) and reports the final size for the
 * caller to persist. Uses `setPointerCapture`, so moves/ups are delivered even
 * when the pointer leaves the handle.
 *
 * @returns `startResize(direction)` — attach the result to a handle's
 *          `onPointerDown`.
 */
export function useResizable(
  targetRef: RefObject<HTMLElement | null>,
  options: UseResizableOptions
): (direction: ResizeDirection) => (e: ReactPointerEvent) => void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  return useCallback(
    (direction: ResizeDirection) => (e: ReactPointerEvent) => {
      const node = targetRef.current;
      if (!node || e.button !== 0) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();

      const handle = e.currentTarget as HTMLElement;
      const rect = node.getBoundingClientRect();
      const startW = rect.width;
      const startH = rect.height;
      const startX = e.clientX;
      const startY = e.clientY;
      const opts = optionsRef.current;
      const maxWidth =
        opts.maxWidth ??
        (typeof window !== "undefined" ? window.innerWidth - 24 : undefined);
      const maxHeight =
        opts.maxHeight ??
        (typeof window !== "undefined" ? window.innerHeight - 24 : undefined);

      handle.setPointerCapture?.(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        if (direction === "right" || direction === "bottom-right") {
          node.style.width = `${clamp(
            startW + (ev.clientX - startX),
            opts.minWidth,
            maxWidth
          )}px`;
        }
        if (direction === "bottom" || direction === "bottom-right") {
          node.style.height = `${clamp(
            startH + (ev.clientY - startY),
            opts.minHeight,
            maxHeight
          )}px`;
        }
      };

      const onEnd = () => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onEnd);
        handle.removeEventListener("pointercancel", onEnd);
        optionsRef.current.onResizeEnd?.({
          width: node.offsetWidth,
          height: node.offsetHeight
        });
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onEnd);
      handle.addEventListener("pointercancel", onEnd);
    },
    [targetRef]
  );
}

/** Props one edge `ResizeHandle` takes from {@link useResizableEdges}. */
interface ResizableEdgeProps {
  getValue: () => number;
  min: number;
  max: number;
  onResize: (delta: number) => void;
  onResizeStart: () => void;
  onResizeEnd: () => void;
}

/**
 * `ResizeHandle` props for the right and bottom edges of a target element,
 * with the same behaviour as {@link useResizable}: the size is measured on
 * grab, written to the element imperatively (no per-move React render) and
 * reported once through `onResizeEnd` when the gesture ends. A keyboard step
 * has no gesture, so it reports straight away.
 */
export function useResizableEdges(
  targetRef: RefObject<HTMLElement | null>,
  options: UseResizableOptions
): { right: ResizableEdgeProps; bottom: ResizableEdgeProps } {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const draggingRef = useRef(false);

  const hasWindow = typeof window !== "undefined";
  const maxWidth =
    options.maxWidth ?? (hasWindow ? window.innerWidth - 24 : Infinity);
  const maxHeight =
    options.maxHeight ?? (hasWindow ? window.innerHeight - 24 : Infinity);
  const minWidth = options.minWidth ?? 0;
  const minHeight = options.minHeight ?? 0;

  return useMemo(() => {
    const report = () => {
      const node = targetRef.current;
      if (node) {
        optionsRef.current.onResizeEnd?.({
          width: node.offsetWidth,
          height: node.offsetHeight
        });
      }
    };
    const edge = (
      dimension: "width" | "height",
      min: number,
      max: number
    ): ResizableEdgeProps => ({
      getValue: () =>
        targetRef.current?.getBoundingClientRect()[dimension] ?? 0,
      min,
      max,
      onResizeStart: () => {
        draggingRef.current = true;
      },
      onResize: (delta: number) => {
        const node = targetRef.current;
        if (!node) {
          return;
        }
        node.style[dimension] = `${
          node.getBoundingClientRect()[dimension] + delta
        }px`;
        if (!draggingRef.current) {
          report();
        }
      },
      onResizeEnd: () => {
        draggingRef.current = false;
        report();
      }
    });
    return {
      right: edge("width", minWidth, maxWidth),
      bottom: edge("height", minHeight, maxHeight)
    };
  }, [targetRef, minWidth, maxWidth, minHeight, maxHeight]);
}

export default useResizable;
