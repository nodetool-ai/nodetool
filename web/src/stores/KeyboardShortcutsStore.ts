/**
 * KeyboardShortcutsStore manages custom keyboard shortcuts for the application.
 *
 * Features:
 * - Stores user-customized key combinations for shortcuts
 * - Validates key combinations to prevent conflicts
 * - Provides default shortcuts as fallback
 * - Persists custom shortcuts to localStorage
 * - Resets to defaults when needed
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  NODE_EDITOR_SHORTCUTS,
  Shortcut,
  SHORTCUT_CATEGORIES
} from "../config/shortcuts";

/**
 * Custom shortcut mapping: shortcut slug -> custom key combination
 */
type CustomShortcuts = Record<string, string[]>;

interface KeyboardShortcutsState {
  /**
   * User-customized shortcuts
   */
  customShortcuts: CustomShortcuts;
  /**
   * Set a custom shortcut for a given slug
   */
  setCustomShortcut: (slug: string, keyCombo: string[]) => void;
  /**
   * Remove a custom shortcut (revert to default)
   */
  removeCustomShortcut: (slug: string) => void;
  /**
   * Reset all shortcuts to defaults
   */
  resetToDefaults: () => void;
  /**
   * Get the effective key combo for a shortcut (custom or default)
   */
  getShortcutCombo: (slug: string) => string[];
  /**
   * Get all shortcuts with customizations applied
   */
  getAllShortcuts: () => Shortcut[];
  /**
   * Check if a key combination conflicts with any existing shortcut
   */
  hasConflict: (
    slug: string,
    keyCombo: string[],
    category?: Shortcut["category"]
  ) => boolean;
  /**
   * Find which shortcut uses a given key combination
   */
  findShortcutByCombo: (keyCombo: string[]) => Shortcut | undefined;
}

/**
 * Sort key combo array for consistent comparison (modifiers first, then keys)
 */
const normalizeKeyCombo = (keys: string[]): string[] => {
  const modifiers = ["control", "shift", "alt", "meta"];
  const sortedKeys = [...keys].map((k) => k.toLowerCase());

  // Sort: modifiers first (in specific order), then other keys alphabetically
  return sortedKeys.sort((a, b) => {
    const aIndex = modifiers.indexOf(a);
    const bIndex = modifiers.indexOf(b);

    // If both are modifiers, sort by modifier order
    if (aIndex >= 0 && bIndex >= 0) {
      return aIndex - bIndex;
    }
    // If only a is a modifier, it comes first
    if (aIndex >= 0) {
      return -1;
    }
    // If only b is a modifier, it comes first
    if (bIndex >= 0) {
      return 1;
    }
    // Neither are modifiers, sort alphabetically
    return a.localeCompare(b);
  });
};

/**
 * Convert key combo array to string for comparison
 */
const comboToString = (keys: string[]): string => {
  return normalizeKeyCombo(keys).join("+");
};

export const useKeyboardShortcutsStore = create<KeyboardShortcutsState>()(
  persist(
    (set, get) => ({
      customShortcuts: {},

      setCustomShortcut: (slug: string, keyCombo: string[]) => {
        set((state) => ({
          customShortcuts: {
            ...state.customShortcuts,
            [slug]: keyCombo
          }
        }));
      },

      removeCustomShortcut: (slug: string) => {
        set((state) => {
          const newCustomShortcuts = { ...state.customShortcuts };
          delete newCustomShortcuts[slug];
          return { customShortcuts: newCustomShortcuts };
        });
      },

      resetToDefaults: () => {
        set({ customShortcuts: {} });
      },

      getShortcutCombo: (slug: string) => {
        const { customShortcuts } = get();
        // Return custom combo if exists
        if (customShortcuts[slug]) {
          return customShortcuts[slug];
        }
        // Otherwise return default
        const defaultShortcut = NODE_EDITOR_SHORTCUTS.find((s) => s.slug === slug);
        return defaultShortcut?.keyCombo ?? [];
      },

      getAllShortcuts: () => {
        const { customShortcuts } = get();
        return NODE_EDITOR_SHORTCUTS.map((shortcut) => {
          if (customShortcuts[shortcut.slug]) {
            return {
              ...shortcut,
              keyCombo: customShortcuts[shortcut.slug]
            };
          }
          return shortcut;
        });
      },

      hasConflict: (
        slug: string,
        keyCombo: string[],
        category?: Shortcut["category"]
      ) => {
        const { getAllShortcuts } = get();
        const allShortcuts = getAllShortcuts();
        const targetComboString = comboToString(keyCombo);

        // Check if the combo conflicts with any other shortcut
        const conflictingShortcut = allShortcuts.find((s) => {
          // Skip self
          if (s.slug === slug) {
            return false;
          }
          // Optionally filter by category
          if (category !== undefined && s.category !== category) {
            return false;
          }
          // Compare key combos (including alt combos)
          const mainComboString = comboToString(s.keyCombo);
          if (mainComboString === targetComboString) {
            return true;
          }
          // Check alternative combos
          if (s.altKeyCombos) {
            return s.altKeyCombos.some(
              (altCombo) => comboToString(altCombo) === targetComboString
            );
          }
          return false;
        });

        return conflictingShortcut !== undefined;
      },

      findShortcutByCombo: (keyCombo: string[]) => {
        const { getAllShortcuts } = get();
        const allShortcuts = getAllShortcuts();
        const targetComboString = comboToString(keyCombo);

        return allShortcuts.find((s) => {
          const mainComboString = comboToString(s.keyCombo);
          if (mainComboString === targetComboString) {
            return true;
          }
          // Check alternative combos
          if (s.altKeyCombos) {
            return s.altKeyCombos.some(
              (altCombo) => comboToString(altCombo) === targetComboString
            );
          }
          return false;
        });
      }
    }),
    {
      name: "keyboard-shortcuts-storage",
      partialize: (state) => ({
        customShortcuts: state.customShortcuts
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<KeyboardShortcutsState> | undefined;
        return {
          ...currentState,
          customShortcuts: persisted?.customShortcuts ?? {}
        };
      }
    }
  )
);

/**
 * Hook to get shortcuts with customizations applied
 * Returns the same structure as NODE_EDITOR_SHORTCUTS but with user customizations
 */
export const useCustomShortcuts = (): Shortcut[] => {
  return useKeyboardShortcutsStore((state) => state.getAllShortcuts());
};

/**
 * Re-export types and constants for convenience
 */
export type { CustomShortcuts };
export { NODE_EDITOR_SHORTCUTS, SHORTCUT_CATEGORIES };
export type { Shortcut };
