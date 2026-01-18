import { useCallback, useRef } from "react";

/**
 * Hook that adds a delay before triggering a hover callback.
 * 
 * Useful for tooltips, dropdowns, and other UI elements that should
 * not trigger immediately on mouse enter. Prevents accidental triggers
 * when mouse passes over elements quickly.
 * 
 * @param callback - Function to call after delay expires
 * @param delay - Delay in milliseconds before callback fires
 * @returns Object containing mouse enter and leave handlers
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