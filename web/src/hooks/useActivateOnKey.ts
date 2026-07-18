import { useCallback } from "react";

/**
 * Returns a keydown handler that activates the given callback on Enter or
 * Space, matching native button semantics for elements with role="button".
 * Space calls preventDefault so the page doesn't scroll.
 */
export const useActivateOnKey = <T extends HTMLElement = HTMLElement>(
  onActivate: (event: React.KeyboardEvent<T>) => void
): ((event: React.KeyboardEvent<T>) => void) =>
  useCallback(
    (event: React.KeyboardEvent<T>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onActivate(event);
      }
    },
    [onActivate]
  );

export default useActivateOnKey;
