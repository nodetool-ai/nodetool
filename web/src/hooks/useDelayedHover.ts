import { useCallback, useRef } from "react";

export function useDelayedHover(callback: () => void, delay: number) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  // Update the callback ref when the callback changes
  callbackRef.current = callback;

  const handleMouseEnter = useCallback(() => {
    timerRef.current = setTimeout(() => callbackRef.current(), delay);
  }, [delay]);

  const handleMouseLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return { handleMouseEnter, handleMouseLeave };
}