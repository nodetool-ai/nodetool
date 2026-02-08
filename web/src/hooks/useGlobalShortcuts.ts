/**
 * useGlobalShortcuts
 *
 * Hook for registering global keyboard shortcuts that work throughout the application.
 * These shortcuts are active regardless of which component or view is currently focused.
 *
 * Current global shortcuts:
 * - Ctrl+Shift+? / Cmd+Shift+?: Open Help dialog
 *
 * @example
 * ```typescript
 * // In app root or layout component
 * useGlobalShortcuts();
 * ```
 */

import { useEffect } from "react";
import {
  registerComboCallback,
  unregisterComboCallback
} from "../stores/KeyPressedStore";
import { useAppHeaderStore } from "../stores/AppHeaderStore";
import { isMac } from "../utils/platform";

/**
 * Hook that registers global keyboard shortcuts for the application.
 * Shortcuts registered here are active application-wide, not just in specific components.
 */
export const useGlobalShortcuts = (): void => {
  const handleOpenHelp = useAppHeaderStore((state) => state.handleOpenHelp);

  useEffect(() => {
    const registered: string[] = [];

    // Register global shortcuts
    const shortcuts = [
      {
        // Ctrl+Shift+? (Win/Linux) or Cmd+Shift+? (Mac)
        // Note: ? key is same as / key on most keyboards (shift+/)
        combo: isMac()
          ? ["meta", "shift", "/"]
          : ["control", "shift", "/"],
        callback: handleOpenHelp,
        preventDefault: true
      }
    ];

    shortcuts.forEach((shortcut) => {
      const normalized = shortcut.combo
        .map((k) => k.toLowerCase())
        .sort()
        .join("+");
      registerComboCallback(normalized, {
        callback: shortcut.callback,
        preventDefault: shortcut.preventDefault,
        active: true
      });
      registered.push(normalized);
    });

    return () => {
      registered.forEach((combo) => unregisterComboCallback(combo));
    };
  }, [handleOpenHelp]);
};
