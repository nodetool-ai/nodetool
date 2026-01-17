import { useCallback, useRef } from "react";

/**
 * Hook to add a delay before triggering hover callbacks.
 * 
 * Useful for tooltips and dropdowns where you want to delay the trigger
 * to avoid accidental activations when the mouse passes through.
 * 
 * @param callback - Function to call after delay on mouse enter
 * @param delay - Delay in milliseconds before triggering callback
 * @returns Object with enter/leave handlers for mouse events
 * 
 * @example
 * ```typescript
 * const { handleMouseEnter, handleMouseLeave } = useDelayedHover(
 *   () => setIsOpen(true),
 *   300
 * );
 * ```
 */
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