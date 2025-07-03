export interface Shortcut {
  /** Human-readable title, e.g. "Copy" */
  title: string;
  /** Stable identifier to reference this shortcut elsewhere */
  slug: string;
  /** Base key combo (Windows / Linux). Example: ["Control", "C"] */
  keyCombo: string[];
  /** macOS-specific combo; if omitted, keys are derived automatically */
  keyComboMac?: string[];
  /** Tooltip/body text */
  description: string;
}

/** Simple platform map helper */
const mapKeyForMac = (key: string): string => {
  switch (key) {
    case "Control":
      return "Meta"; // ⌘ replacement
    case "PageUp":
      return "Shift"; // example mapping
    case "PageDown":
      return "Shift"; // example mapping
    default:
      return key;
  }
};

export const expandShortcutsForOS = (
  shortcuts: Shortcut[],
  mac: boolean
): Shortcut[] => {
  return shortcuts.map((s) => {
    const combo = mac
      ? s.keyComboMac ?? s.keyCombo.map(mapKeyForMac)
      : s.keyCombo;
    return {
      ...s,
      keyCombo: combo
    };
  });
};

export const getShortcutTooltip = (slug: string, mac: boolean): string => {
  const sc = NODE_EDITOR_SHORTCUTS.find((s) => s.slug === slug);
  if (!sc) return slug;
  const comboArr = mac
    ? sc.keyComboMac ?? sc.keyCombo.map(mapKeyForMac)
    : sc.keyCombo;
  const comboStr = comboArr.join(" + ");
  return `${sc.title} (${comboStr})`;
};

// --- NODE EDITOR SHORTCUTS --------------------------------------------------
// NOTE: This is an *initial* set. Feel free to expand.
export const NODE_EDITOR_SHORTCUTS: Shortcut[] = [
  {
    title: "Copy",
    slug: "copy",
    keyCombo: ["Control", "C"],
    keyComboMac: ["Meta", "C"],
    description: "Copy selected nodes"
  },
  {
    title: "Paste",
    slug: "paste",
    keyCombo: ["Control", "V"],
    keyComboMac: ["Meta", "V"],
    description: "Paste nodes from clipboard"
  },
  {
    title: "Cut",
    slug: "cut",
    keyCombo: ["Control", "X"],
    keyComboMac: ["Meta", "X"],
    description: "Cut selected nodes"
  },
  {
    title: "Undo",
    slug: "undo",
    keyCombo: ["Control", "Z"],
    keyComboMac: ["Meta", "Z"],
    description: "Undo last action"
  },
  {
    title: "Redo",
    slug: "redo",
    keyCombo: ["Control", "Shift", "Z"],
    keyComboMac: ["Meta", "Shift", "Z"],
    description: "Redo last undone action"
  },
  {
    title: "Select All",
    slug: "select-all",
    keyCombo: ["Control", "A"],
    keyComboMac: ["Meta", "A"],
    description: "Select all nodes"
  },
  {
    title: "Zoom In",
    slug: "zoom-in",
    keyCombo: ["Control", "="],
    keyComboMac: ["Meta", "="],
    description: "Zoom in on canvas"
  },
  {
    title: "Zoom Out",
    slug: "zoom-out",
    keyCombo: ["Control", "-"],
    keyComboMac: ["Meta", "-"],
    description: "Zoom out on canvas"
  },
  {
    title: "Duplicate",
    slug: "duplicate",
    keyCombo: ["Control", "D"],
    keyComboMac: ["Meta", "D"],
    description: "Duplicate selected nodes"
  },
  {
    title: "Align",
    slug: "align",
    keyCombo: ["A"],
    description: "Align selected nodes"
  },
  {
    title: "Align with Spacing",
    slug: "align-with-spacing",
    keyCombo: ["Shift", "A"],
    description: "Align selected nodes and distribute spacing"
  },
  {
    title: "Open Node Menu",
    slug: "open-node-menu",
    keyCombo: [" "],
    description: "Open the node creation menu"
  },
  {
    title: "Fit View",
    slug: "fit-view",
    keyCombo: ["F"],
    description: "Fit all nodes into view"
  }
];
