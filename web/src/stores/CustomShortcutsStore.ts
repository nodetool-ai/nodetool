import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Shortcut } from "../config/shortcuts";

export interface CustomShortcutMapping {
  slug: string;
  customCombo: string[];
  useCustom: boolean;
}

interface CustomShortcutsState {
  customShortcuts: Record<string, CustomShortcutMapping>;
  setCustomShortcut: (slug: string, combo: string[]) => void;
  removeCustomShortcut: (slug: string) => void;
  resetAllShortcuts: () => void;
  getEffectiveCombo: (slug: string, defaultCombo: string[]) => string[];
  isShortcutInUse: (combo: string[], excludeSlug?: string) => boolean;
  getConflicts: (combo: string[], excludeSlug?: string) => string[];
}

export const useCustomShortcutsStore = create<CustomShortcutsState>()(
  persist(
    (set, get) => ({
      customShortcuts: {},
      setCustomShortcut: (slug: string, combo: string[]) =>
        set((state) => ({
          customShortcuts: {
            ...state.customShortcuts,
            [slug]: {
              slug,
              customCombo: combo,
              useCustom: true
            }
          }
        })),
      removeCustomShortcut: (slug: string) =>
        set((state) => {
          const { [slug]: _, ...rest } = state.customShortcuts;
          return { customShortcuts: rest };
        }),
      resetAllShortcuts: () => set({ customShortcuts: {} }),
      getEffectiveCombo: (slug: string, defaultCombo: string[]) => {
        const custom = get().customShortcuts[slug];
        if (custom?.useCustom && custom.customCombo.length > 0) {
          return custom.customCombo;
        }
        return defaultCombo;
      },
      isShortcutInUse: (combo: string[], excludeSlug?: string) => {
        const normalizedCombo = [...combo].sort().join("+").toLowerCase();
        return Object.entries(get().customShortcuts).some(
          ([slug, mapping]) =>
            slug !== excludeSlug &&
            mapping.useCustom &&
            [...mapping.customCombo].sort().join("+").toLowerCase() === normalizedCombo
        );
      },
      getConflicts: (combo: string[], excludeSlug?: string) => {
        const conflicts: string[] = [];
        const normalizedCombo = [...combo].sort().join("+").toLowerCase();
        Object.entries(get().customShortcuts).forEach(([slug, mapping]) => {
          if (slug !== excludeSlug && mapping.useCustom) {
            const mappingCombo = [...mapping.customCombo].sort().join("+").toLowerCase();
            if (mappingCombo === normalizedCombo) {
              conflicts.push(slug);
            }
          }
        });
        return conflicts;
      }
    }),
    {
      name: "custom-shortcuts-storage"
    }
  )
);

export const normalizeComboString = (combo: string[]): string => {
  return combo.map((k) => k.toLowerCase()).sort().join("+");
};

export const parseComboString = (comboStr: string): string[] => {
  return comboStr.split("+").map((k) => k.trim());
};

export const formatComboForDisplay = (combo: string[]): string => {
  return combo
    .map((k) => {
      switch (k.toLowerCase()) {
        case "control":
          return "Ctrl";
        case "meta":
          return "⌘";
        case "alt":
          return "Option";
        case "shift":
          return "Shift";
        case "arrowup":
          return "↑";
        case "arrowdown":
          return "↓";
        case "arrowleft":
          return "←";
        case "arrowright":
          return "→";
        case " ":
        case "space":
          return "Space";
        default:
          return k.length === 1 ? k.toUpperCase() : k;
      }
    })
    .join(" + ");
};

export const isValidKey = (key: string): boolean => {
  const validKeys = [
    "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
    "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
    "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
    "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12",
    "control", "ctrl", "meta", "alt", "shift", "option",
    "enter", "escape", "esc", "tab", "space", "backspace", "delete", "del",
    "insert", "home", "end", "pageup", "pagedown",
    "arrowup", "arrowdown", "arrowleft", "arrowright",
    "printscreen", "prtsc", "scrolllock", "pause", "capslock",
    ",", ".", "/", ";", "'", "[", "]", "\\", "-", "=", "`"
  ];
  return validKeys.includes(key.toLowerCase());
};

export const KEY_DISPLAY_NAMES: Record<string, string> = {
  control: "Ctrl",
  ctrl: "Ctrl",
  meta: "Cmd",
  alt: "Alt",
  option: "Option",
  shift: "Shift",
  enter: "Enter",
  escape: "Esc",
  tab: "Tab",
  backspace: "Backspace",
  delete: "Delete",
  del: "Delete",
  insert: "Insert",
  home: "Home",
  end: "End",
  pageup: "Page Up",
  pagedown: "Page Down",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  printscreen: "PrtScn",
  prtsc: "PrtScn",
  scrolllock: "Scroll Lock",
  pause: "Pause",
  capslock: "Caps Lock",
  " ": "Space"
};
