import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Shortcut } from "../config/shortcuts";

export interface CustomShortcut {
  slug: string;
  keyCombo: string[];
  keyComboMac?: string[];
}

interface ShortcutSettingsState {
  customShortcuts: Record<string, CustomShortcut>;
  setCustomShortcut: (slug: string, combo: string[], macCombo?: string[]) => void;
  removeCustomShortcut: (slug: string) => void;
  resetAllShortcuts: () => void;
  getEffectiveShortcut: (shortcut: Shortcut) => CustomShortcut | null;
  getAllEffectiveShortcuts: () => Record<string, CustomShortcut>;
  isConflicting: (slug: string, combo: string[], excludeSlug?: string) => boolean;
  getConflicts: (slug: string, combo: string[], excludeSlug?: string) => Array<{ slug: string; title: string }>;
}

export const useShortcutSettingsStore = create<ShortcutSettingsState>()(
  persist(
    (set, get) => ({
      customShortcuts: {},

      setCustomShortcut: (slug: string, combo: string[], macCombo?: string[]) => {
        set((state) => ({
          customShortcuts: {
            ...state.customShortcuts,
            [slug]: { slug, keyCombo: combo, keyComboMac: macCombo }
          }
        }));
      },

      removeCustomShortcut: (slug: string) => {
        set((state) => {
          const newShortcuts = { ...state.customShortcuts };
          delete newShortcuts[slug];
          return { customShortcuts: newShortcuts };
        });
      },

      resetAllShortcuts: () => {
        set({ customShortcuts: {} });
      },

      getEffectiveShortcut: (shortcut: Shortcut) => {
        const { customShortcuts } = get();
        return customShortcuts[shortcut.slug] || null;
      },

      getAllEffectiveShortcuts: () => {
        return get().customShortcuts;
      },

      isConflicting: (slug: string, combo: string[], excludeSlug?: string) => {
        const { customShortcuts } = get();
        const allShortcuts = { ...customShortcuts };

        const normalizedCombo = [...combo].sort().join("+").toLowerCase();

        for (const [key, customShortcut] of Object.entries(allShortcuts)) {
          if (key === excludeSlug) continue;
          const customCombo = [...customShortcut.keyCombo].sort().join("+").toLowerCase();
          if (customCombo === normalizedCombo && key !== slug) {
            return true;
          }
        }
        return false;
      },

      getConflicts: (slug: string, combo: string[], excludeSlug?: string) => {
        const { customShortcuts } = get();
        const allShortcuts = { ...customShortcuts };
        const conflicts: Array<{ slug: string; title: string }> = [];

        const normalizedCombo = [...combo].sort().join("+").toLowerCase();

        for (const [key, customShortcut] of Object.entries(allShortcuts)) {
          if (key === excludeSlug) continue;
          const customCombo = [...customShortcut.keyCombo].sort().join("+").toLowerCase();
          if (customCombo === normalizedCombo && key !== slug) {
            conflicts.push({ slug: key, title: customShortcut.slug });
          }
        }
        return conflicts;
      }
    }),
    {
      name: "shortcut-settings-storage"
    }
  )
);
