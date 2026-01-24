import { useState, useEffect } from "react";

interface UseDelayedVisibilityOptions {
  /**
   * Whether the element should be visible (before delay)
   */
  shouldBeVisible: boolean;
  /**
   * Delay in milliseconds before showing the element
   * @default 0
   */
  delay?: number;
}

/**
 * Custom hook for implementing delayed visibility behavior.
 * 
 * Delays showing an element to avoid flashing when conditions change rapidly.
 * Useful for tooltips, toolbars, and UI elements that should only appear
 * after the user has indicated intent.
 * 
 * @param options - Configuration options
 * @returns Boolean indicating whether the element should be visible
 * 
 * @example
 * ```typescript
 * // Delay showing toolbar for 200ms after selection
 * const isVisible = useDelayedVisibility({
 *   shouldBeVisible: selected && !dragging,
 *   delay: 200
 * });
 * 
 * return <Toolbar isVisible={isVisible} />;
 * ```
 */
export function useDelayedVisibility({
  shouldBeVisible,
  delay = 0
}: UseDelayedVisibilityOptions): boolean {
  const [isDelayedVisible, setIsDelayedVisible] = useState(false);

  useEffect(() => {
    if (shouldBeVisible) {
      const timer = setTimeout(() => setIsDelayedVisible(true), delay);
      return () => clearTimeout(timer);
    } else {
      setIsDelayedVisible(false);
    }
  }, [shouldBeVisible, delay]);

  return isDelayedVisible;
}
