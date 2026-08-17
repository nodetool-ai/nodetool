/**
 * useLongPress
 *
 * Turns a touch hold into the same action a right-click gives a mouse.
 *
 * The timeline's clip and lane menus hang off `onContextMenu`, which a touch
 * hold does not reliably produce — iOS Safari never fires it from a long press,
 * and Android Chrome only does so when the browser hasn't claimed the gesture
 * for text selection first. Without this, a phone has no route to "add clip",
 * "split", "duplicate", or "delete" at all.
 *
 * Composes with existing pointer handlers rather than replacing them: call
 * `start` / `move` / `cancel` from the handlers a component already has, so the
 * hold can coexist with a drag or rubber-band gesture on the same element.
 * Mouse pointers are ignored — they have a real context menu.
 */

import { useCallback, useEffect, useRef } from "react";

export interface LongPressPoint {
  clientX: number;
  clientY: number;
  target: EventTarget | null;
}

/**
 * Structural shape shared by React's synthetic pointer event and the DOM's —
 * clip drags track movement through window listeners, so both reach `move`.
 */
interface LongPressSource {
  clientX: number;
  clientY: number;
  pointerType: string;
  target: EventTarget | null;
}

interface UseLongPressOptions {
  /** Hold duration before the press counts. */
  delayMs?: number;
  /** Movement past this cancels the hold and lets the drag win. */
  moveTolerancePx?: number;
}

interface LongPressHandlers {
  start: (e: LongPressSource) => void;
  move: (e: Pick<LongPressSource, "clientX" | "clientY">) => void;
  cancel: () => void;
}

export function useLongPress(
  onLongPress: (point: LongPressPoint) => void,
  { delayMs = 500, moveTolerancePx = 10 }: UseLongPressOptions = {}
): LongPressHandlers {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const callbackRef = useRef(onLongPress);

  useEffect(() => {
    callbackRef.current = onLongPress;
  }, [onLongPress]);

  const cancel = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    originRef.current = null;
  }, []);

  const start = useCallback(
    (e: LongPressSource) => {
      if (e.pointerType === "mouse") {
        return;
      }
      cancel();
      // Read the coordinates now: the timer fires long after this event object
      // has been handed back.
      const point: LongPressPoint = {
        clientX: e.clientX,
        clientY: e.clientY,
        target: e.target
      };
      originRef.current = { x: e.clientX, y: e.clientY };
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        originRef.current = null;
        callbackRef.current(point);
      }, delayMs);
    },
    [cancel, delayMs]
  );

  const move = useCallback(
    (e: Pick<LongPressSource, "clientX" | "clientY">) => {
      const origin = originRef.current;
      if (origin === null) {
        return;
      }
      if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > moveTolerancePx) {
        cancel();
      }
    },
    [cancel, moveTolerancePx]
  );

  useEffect(() => cancel, [cancel]);

  return { start, move, cancel };
}
