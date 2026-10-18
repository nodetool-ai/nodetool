// A wheel burst on a DR-1 control as one undo entry: the gesture opens on the
// first tick and closes after the wheel has been quiet for a moment.

import { useEffect, useRef, type RefObject } from 'react';
import { useDrumStoreApi } from '../dr1Store';

const QUIET_MS = 300;

export function useWheelGesture(ref: RefObject<HTMLElement | null>, onWheel: (e: WheelEvent) => void): void {
  const store = useDrumStoreApi();
  const onWheelRef = useRef(onWheel);
  onWheelRef.current = onWheel;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: number | null = null;
    const close = () => {
      timer = null;
      store.getState().endGesture();
    };
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      if (timer === null) store.getState().beginGesture();
      else window.clearTimeout(timer);
      onWheelRef.current(e);
      timer = window.setTimeout(close, QUIET_MS);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => {
      el.removeEventListener('wheel', handler);
      if (timer !== null) {
        window.clearTimeout(timer);
        close();
      }
    };
  }, [ref, store]);
}
