import { NODE_EDITOR_SHORTCUTS, Shortcut } from "../config/shortcuts";
import { useShortcutSettingsStore } from "../stores/ShortcutSettingsStore";

const isMac = typeof navigator !== "undefined" &&
  navigator.userAgent.includes("Mac");

export function getEffectiveCombo(slug: string): string[] {
  const shortcut = NODE_EDITOR_SHORTCUTS.find((s) => s.slug === slug);
  if (!shortcut) return [];

  const customShortcut = useShortcutSettingsStore.getState().customShortcuts[slug];

  if (customShortcut) {
    if (isMac && customShortcut.keyComboMac) {
      return customShortcut.keyComboMac;
    }
    return customShortcut.keyCombo;
  }

  if (isMac && shortcut.keyComboMac) {
    return shortcut.keyComboMac;
  }
  return shortcut.keyCombo;
}

export function getEffectiveShortcut(slug: string): Shortcut | null {
  const shortcut = NODE_EDITOR_SHORTCUTS.find((s) => s.slug === slug);
  if (!shortcut) return null;

  const customShortcut = useShortcutSettingsStore.getState().customShortcuts[slug];

  if (customShortcut) {
    return {
      ...shortcut,
      keyCombo: customShortcut.keyCombo,
      keyComboMac: customShortcut.keyComboMac
    };
  }

  return shortcut;
}

export function getAllEffectiveShortcuts(): Shortcut[] {
  return NODE_EDITOR_SHORTCUTS.map((shortcut) => {
    const customShortcut = useShortcutSettingsStore.getState().customShortcuts[shortcut.slug];

    if (customShortcut) {
      return {
        ...shortcut,
        keyCombo: customShortcut.keyCombo,
        keyComboMac: customShortcut.keyComboMac
      };
    }

    return shortcut;
  });
}

export function getShortcutsForCategory(category: Shortcut["category"]): Shortcut[] {
  return getAllEffectiveShortcuts().filter((s) => s.category === category);
}

export function searchShortcuts(query: string): Shortcut[] {
  const lowerQuery = query.toLowerCase();
  return getAllEffectiveShortcuts().filter(
    (s) =>
      s.title.toLowerCase().includes(lowerQuery) ||
      s.slug.toLowerCase().includes(lowerQuery) ||
      s.description?.toLowerCase().includes(lowerQuery)
  );
}

export function comboToString(combo: string[]): string {
  return combo.map((key) => {
    const keyMap: Record<string, string> = {
      control: "Ctrl",
      meta: "Cmd",
      alt: "Option",
      shift: "Shift",
      escape: "Esc",
      enter: "Enter",
      backspace: "Backspace",
      delete: "Delete",
      tab: "Tab",
      arrowup: "↑",
      arrowdown: "↓",
      arrowleft: "←",
      arrowright: "→",
      " ": "Space"
    };
    const lowerKey = key.toLowerCase();
    return keyMap[lowerKey] || (key.length === 1 ? key.toUpperCase() : key);
  }).join(" + ");
}

export function isCustomized(slug: string): boolean {
  return slug in useShortcutSettingsStore.getState().customShortcuts;
}

export function getCustomizedCount(): number {
  return Object.keys(useShortcutSettingsStore.getState().customShortcuts).length;
}
