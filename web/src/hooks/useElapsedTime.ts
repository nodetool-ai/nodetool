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
