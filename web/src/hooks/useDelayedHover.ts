import { useCallback, useRef } from "react";

/**
 * Hook to add a delay before triggering hover callbacks.
 * 
 * Useful for tooltips and dropdown menus where you want to avoid triggering
 * on accidental mouse movements. The callback is only executed after the
 * mouse has been over the element for the specified delay.
 * 
 * @param callback - Function to call after hover delay
 * @param delay - Delay in milliseconds before triggering callback
 * @returns Object containing event handlers for mouse enter/leave
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

  return { handleMouseEnter, handleMouseLeave };
}