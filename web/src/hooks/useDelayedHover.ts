import { useCallback, useRef } from "react";

/**
 * Hook for implementing delayed hover behavior with a timer.
 * 
 * This hook is useful for tooltips, dropdown menus, and other UI elements
 * where you want to delay the action until the user hovers for a specified time.
 * 
 * @param callback - The function to call after the delay
 * @param delay - Delay in milliseconds before calling the callback
 * @returns Object containing handleMouseEnter and handleMouseLeave callbacks
 * 
 * @example
 * ```typescript
 * const { handleMouseEnter, handleMouseLeave } = useDelayedHover(
 *   () => setIsOpen(true),
 *   300  // 300ms delay
 * );
 * 
 * <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
 *   Hover me
 * </div>
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