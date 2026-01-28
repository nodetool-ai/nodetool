import { useCallback, useRef } from "react";

/**
 * Custom hook for implementing delayed hover behavior.
 * 
 * Provides event handlers that delay triggering a callback until the mouse
 * has been over an element for a specified duration. Useful for tooltips
 * and hover menus to prevent accidental triggers.
 * 
 * @param callback - Function to call after the delay
 * @param delay - Delay in milliseconds before calling the callback
 * @returns Object containing mouse enter and leave event handlers
 * 
 * @example
 * ```typescript
 * const { handleMouseEnter, handleMouseLeave } = useDelayedHover(() => {
 *   setShowTooltip(true);
 * }, 300);
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