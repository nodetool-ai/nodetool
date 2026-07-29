import { useState, useEffect } from "react";

interface UseDelayedVisibilityOptions {
  shouldBeVisible: boolean;
  /** Delay in milliseconds before showing the element. @default 0 */
  delay?: number;
}

/**
 * Delays showing an element to avoid flashing when conditions change rapidly.
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
