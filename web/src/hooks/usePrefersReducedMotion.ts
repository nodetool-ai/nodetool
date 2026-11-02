/**
 * usePrefersReducedMotion
 *
 * Tracks the `prefers-reduced-motion: reduce` media query. Use it where motion
 * is content, such as an autoplaying preview loop, and CSS cannot switch it
 * off. Styles use `reducedMotion()` from `ui_primitives` instead.
 */

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

const subscribe = (onChange: () => void): (() => void) => {
  const list = window.matchMedia?.(QUERY);
  list?.addEventListener?.("change", onChange);
  return () => list?.removeEventListener?.("change", onChange);
};

const getSnapshot = (): boolean => window.matchMedia?.(QUERY).matches ?? false;

export const usePrefersReducedMotion = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, () => false);
