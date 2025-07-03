import React from "react";

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
    case "Alt":
      return "Option";
    case "Control":
      return "Meta";
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

/**
 * Returns a JSX tooltip element containing title and both Win/Mac key combos.
 * Example structure:
 * <div class="tooltip-span">
 *   <div class="tooltip-title">Run Workflow</div>
 *   <div class="tooltip-key"><kbd>CTRL</kbd>+<kbd>Enter</kbd> / <kbd>⌘</kbd>+<kbd>Enter</kbd></div>
 * </div>
 */
export const getShortcutTooltip = (
  slug: string
): React.ReactElement | string => {
  const sc = NODE_EDITOR_SHORTCUTS.find((s) => s.slug === slug);
  if (!sc) return slug;

  const winCombo = sc.keyCombo.join(" + ");
  const macCombo = (sc.keyComboMac ?? sc.keyCombo.map(mapKeyForMac)).join(
    " + "
  );

  const humanizeKey = (key: string): string => {
    switch (key.toLowerCase()) {
      case "control":
        return "CTRL";
      case "meta":
        return "⌘";
      case "alt":
        return "ALT";
      case "option":
        return "OPT";
      case "shift":
        return "SHIFT";
      case " ":
      case "space":
        return "Space";
      case "arrowup":
        return "↑";
      case "arrowdown":
        return "↓";
      case "arrowleft":
        return "←";
      case "arrowright":
        return "→";
      default:
        return key.length === 1 ? key.toUpperCase() : key;
    }
  };

  const renderKbdSeries = (combo: string): React.ReactNode[] => {
    const parts = combo.split(" + ");
    return parts.flatMap((part, idx) => {
      const elements: React.ReactNode[] = [
        React.createElement("kbd", { key: `k-${idx}` }, humanizeKey(part))
      ];
      if (idx < parts.length - 1) {
        elements.push("+");
      }
      return elements;
    });
  };

  return React.createElement(
    "div",
    { className: "tooltip-span" },
    React.createElement("div", { className: "tooltip-title" }, sc.title),
    React.createElement(
      "div",
      { className: "tooltip-key" },
      ...renderKbdSeries(winCombo),
      " / ",
      ...renderKbdSeries(macCombo)
    )
  );
};

// --- NODE EDITOR SHORTCUTS --------------------------------------------------

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
  },
  {
    title: "Run Workflow",
    slug: "run-workflow",
    keyCombo: ["Control", "Enter"],
    keyComboMac: ["Meta", "Enter"],
    description: "Execute the current workflow"
  },
  {
    title: "Delete Node",
    slug: "delete-node",
    keyCombo: ["Delete"],
    keyComboMac: ["Delete"],
    description: "Delete selected node(s)"
  }
];
