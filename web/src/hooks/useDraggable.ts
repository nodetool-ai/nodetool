import { useEffect, useRef } from "react";

export interface DragPosition {
  x: number;
  y: number;
}

export interface UseDraggableOptions {
  /**
   * Selector that the pointer-down target must match (or be inside of) for a
   * drag to begin. Mirrors react-draggable's `handle`. When omitted, the whole
   * node is draggable.
   */
  handle?: string;
  /**
   * Selector that, when the pointer-down target matches (or is inside of),
   * suppresses the drag. Mirrors react-draggable's `cancel`. Useful to keep
   * buttons / inputs inside the draggable node clickable.
   */
  cancel?: string;
  /**
   * Controlled translation offset (px) from the node's normal layout position.
   * When provided and the node is not being dragged, the hook keeps the node's
   * transform in sync with this value.
   */
  position?: DragPosition;
  /** Initial offset for uncontrolled usage. Defaults to `{ x: 0, y: 0 }`. */
  defaultPosition?: DragPosition;
  /**
   * Clamp the translate offset to these bounds (px) during a drag. Mirrors
   * react-draggable's object form of `bounds`.
   */
  bounds?: {
    left?: number;
    top?: number;
    right?: number;
    bottom?: number;
  };
  /** When true, pointer-down never starts a drag. */
  disabled?: boolean;
  onStart?: (pos: DragPosition) => void;
  onDrag?: (pos: DragPosition) => void;
  onStop?: (pos: DragPosition) => void;
}

/** Parse the `translate(Xpx, Ypx)` currently applied to a node's inline style. */
function readTranslate(node: HTMLElement): DragPosition {
  const match = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/.exec(
    node.style.transform
  );
  return match
    ? { x: parseFloat(match[1]), y: parseFloat(match[2]) }
    : { x: 0, y: 0 };
}

const clamp = (value: number, min?: number, max?: number) => {
  let v = value;
  if (min !== undefined && v < min) v = min;
  if (max !== undefined && v > max) v = max;
  return v;
};

/**
 * Pointer-events based draggable. A small, dependency-free replacement for
 * `react-draggable` that drives a node's `transform: translate(...)` from
 * native pointer events.
 *
 * Why not react-draggable: it relies on React's *synthetic mouse-event*
 * delegation (`onMouseDown`) plus document-level `mousemove`/`mouseup`
 * listeners. That flow can be silently broken by the surrounding app while
 * pointer events keep working. Pointer events + `setPointerCapture` avoid that:
 * capture means moves/ups are delivered to the node even when the pointer
 * leaves it, with no document listener races.
 *
 * The hook owns the node's `transform`. In controlled mode pass `position` and
 * persist `onStop`/`onDrag`; the hook re-applies `position` whenever it changes
 * and the node is idle (e.g. a clamp-on-stop or a reset).
 *
 * @returns a ref to attach to the draggable node.
 */
export function useDraggable<T extends HTMLElement = HTMLElement>(
  options: UseDraggableOptions
) {
  const ref = useRef<T>(null);

  // Latest options, read inside the (stable) pointer listeners without
  // re-subscribing on every render.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const state = useRef({
    x: options.position?.x ?? options.defaultPosition?.x ?? 0,
    y: options.position?.y ?? options.defaultPosition?.y ?? 0,
    dragging: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    pointerId: -1
  });

  const apply = () => {
    if (ref.current) {
      ref.current.style.transform = `translate(${state.current.x}px, ${state.current.y}px)`;
    }
  };

  // Keep the transform in sync with the controlled `position` while idle.
  const controlledX = options.position?.x;
  const controlledY = options.position?.y;
  useEffect(() => {
    if (
      controlledX === undefined ||
      controlledY === undefined ||
      state.current.dragging
    ) {
      return;
    }
    state.current.x = controlledX;
    state.current.y = controlledY;
    apply();
  }, [controlledX, controlledY]);

  // Track the node we've bound listeners to. The draggable node can mount/unmount
  // independently of this hook's host component (e.g. a menu that renders `null`
  // while closed), so we (re)bind whenever `ref.current` actually changes rather
  // than once on mount.
  const boundNode = useRef<HTMLElement | null>(null);
  const detach = useRef<(() => void) | null>(null);

  const bind = (node: HTMLElement) => {
    apply();

    const onPointerDown = (e: PointerEvent) => {
      const opts = optionsRef.current;
      if (opts.disabled || e.button !== 0) {
        return;
      }
      const target = e.target as Element | null;
      if (opts.handle && !target?.closest(opts.handle)) {
        return;
      }
      if (opts.cancel && target?.closest(opts.cancel)) {
        return;
      }
      const s = state.current;
      // Read the origin from the node's live transform so the drag respects any
      // external imperative nudge (e.g. an on-open clamp) since the last drag.
      const origin = readTranslate(node);
      s.x = origin.x;
      s.y = origin.y;
      s.dragging = true;
      s.startX = e.clientX;
      s.startY = e.clientY;
      s.originX = origin.x;
      s.originY = origin.y;
      s.pointerId = e.pointerId;
      node.setPointerCapture?.(e.pointerId);
      // Prevent text selection / focus-steal while dragging the handle.
      e.preventDefault();
      opts.onStart?.({ x: s.x, y: s.y });
    };

    const onPointerMove = (e: PointerEvent) => {
      const s = state.current;
      if (!s.dragging || e.pointerId !== s.pointerId) {
        return;
      }
      const { bounds } = optionsRef.current;
      s.x = s.originX + (e.clientX - s.startX);
      s.y = s.originY + (e.clientY - s.startY);
      if (bounds) {
        s.x = clamp(s.x, bounds.left, bounds.right);
        s.y = clamp(s.y, bounds.top, bounds.bottom);
      }
      apply();
      optionsRef.current.onDrag?.({ x: s.x, y: s.y });
    };

    const onPointerEnd = (e: PointerEvent) => {
      const s = state.current;
      if (!s.dragging || e.pointerId !== s.pointerId) {
        return;
      }
      s.dragging = false;
      s.pointerId = -1;
      optionsRef.current.onStop?.({ x: s.x, y: s.y });
    };

    node.addEventListener("pointerdown", onPointerDown);
    node.addEventListener("pointermove", onPointerMove);
    node.addEventListener("pointerup", onPointerEnd);
    node.addEventListener("pointercancel", onPointerEnd);
    return () => {
      node.removeEventListener("pointerdown", onPointerDown);
      node.removeEventListener("pointermove", onPointerMove);
      node.removeEventListener("pointerup", onPointerEnd);
      node.removeEventListener("pointercancel", onPointerEnd);
    };
  };

  // Runs after every render (no deps): rebind only when the node identity changes.
  useEffect(() => {
    if (ref.current === boundNode.current) {
      return;
    }
    detach.current?.();
    detach.current = null;
    boundNode.current = ref.current;
    if (ref.current) {
      detach.current = bind(ref.current);
    }
  });

  // Final cleanup on host unmount.
  useEffect(
    () => () => {
      detach.current?.();
      detach.current = null;
      boundNode.current = null;
    },
    []
  );

  return ref;
}

export default useDraggable;
