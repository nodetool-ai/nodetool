import { useCallback, useRef } from "react";

/**
 * Hook for implementing delayed hover behavior.
 * 
 * Useful for tooltips, dropdowns, and other UI elements that should
 * not appear immediately on mouse enter. Delays the callback execution
 * by the specified delay duration.
 * 
 * @param callback - Function to call after the delay
 * @param delay - Delay in milliseconds before callback is invoked
 * @returns Event handlers for mouse enter and leave
 * 
 * @example
 * ```typescript
 * const { handleMouseEnter, handleMouseLeave } = useDelayedHover(
 *   () => setTooltipVisible(true),
 *   300  // 300ms delay
 * );
 * 
 * <div 
 *   onMouseEnter={handleMouseEnter}
 *   onMouseLeave={handleMouseLeave}
 * >
 *   Hover for tooltip
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

  return { 
    /** Handler to call on mouse enter - triggers delayed callback */
    handleMouseEnter, 
    /** Handler to call on mouse leave - clears pending timer */
    handleMouseLeave 
  };
}