/**
 * Keyboard activation helper
 *
 * Elements that carry an `onClick` but aren't native buttons need Enter/Space
 * to activate them (WCAG 2.1.1). Pair this with `role="button"` and
 * `tabIndex={0}`.
 */

import type React from "react";

/**
 * Builds an `onKeyDown` handler that runs `activate` on Enter and Space,
 * mirroring native button behavior. Space is prevented so the page doesn't
 * scroll; keys arriving from a nested focusable child are ignored so an inner
 * control doesn't also trigger its container.
 *
 * @example
 * <Box
 *   role="button"
 *   tabIndex={0}
 *   onClick={open}
 *   onKeyDown={activateOnKey(open)}
 * />
 */
export const activateOnKey =
  <T extends HTMLElement = HTMLElement>(
    activate?: (event: React.KeyboardEvent<T>) => void
  ): React.KeyboardEventHandler<T> =>
  (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    activate?.(event);
  };
