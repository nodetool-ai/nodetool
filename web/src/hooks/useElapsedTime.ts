import { useState, useEffect, useRef } from "react";

export function useElapsedTime(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    startRef.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  return elapsed;
}

/** Seconds since `startedAt`. Pass `null` to show 0 and stop the tick. */
export function useElapsedSince(startedAt: number | null): number {
  const [elapsed, setElapsed] = useState(() =>
    startedAt == null ? 0 : Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  );

  useEffect(() => {
    if (startedAt == null) {
      setElapsed(0);
      return;
    }
    const tick = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return elapsed;
}
