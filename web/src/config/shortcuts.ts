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
  description?: string;
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
  slug: string,
  os: "mac" | "win" | "both" = typeof navigator !== "undefined" &&
  navigator.userAgent.includes("Mac")
    ? "mac"
    : "win",
  showDescription = false
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

  // Helper to render combo as <kbd> elements
  const renderSeries = (comboStr: string): React.ReactNode[] => {
    const parts = comboStr.split(" + ");
    return parts.flatMap((part, idx) => {
      const nodes: React.ReactNode[] = [
        React.createElement("kbd", { key: `k-${idx}` }, humanizeKey(part))
      ];
      if (idx < parts.length - 1) nodes.push("+");
      return nodes;
    });
  };

  const showBoth = os === "both";

  const keyChildren: React.ReactNode[] = showBoth
    ? [...renderSeries(winCombo), " / ", ...renderSeries(macCombo)]
    : renderSeries(os === "mac" ? macCombo : winCombo);

  const children: React.ReactNode[] = [
    React.createElement(
      "div",
      { key: "t", className: "tooltip-title" },
      sc.title
    ),
    React.createElement(
      "div",
      { key: "k", className: "tooltip-key" },
      ...keyChildren
    )
  ];
  if (showDescription && sc.description) {
    children.push(
      React.createElement(
        "div",
        {
          key: "d",
          className: "tooltip-description"
        },
        sc.description
      )
    );
  }

  return React.createElement("div", { className: "tooltip-span" }, ...children);
};

// --- NODE EDITOR SHORTCUTS --------------------------------------------------

export const NODE_EDITOR_SHORTCUTS: Shortcut[] = [
  {
    title: "Copy",
    slug: "copy",
    keyCombo: ["Control", "C"],
    description: "Copy selected nodes"
  },
  {
    title: "Paste",
    slug: "paste",
    keyCombo: ["Control", "V"],
    description: "Paste nodes from clipboard"
  },
  {
    title: "Cut",
    slug: "cut",
    keyCombo: ["Control", "X"],
    description: "Cut selected nodes"
  },
  {
    title: "Undo",
    slug: "undo",
    keyCombo: ["Control", "Z"],
    description: "Undo last action"
  },
  {
    title: "Redo",
    slug: "redo",
    keyCombo: ["Control", "Shift", "Z"],
    description: "Redo last undone action"
  },
  {
    title: "Select All",
    slug: "select-all",
    keyCombo: ["Control", "A"],
    description: "Select all nodes"
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
    title: "Duplicate",
    slug: "duplicate",
    keyCombo: ["Control", "D"],
    description: "Duplicate selected nodes"
  },
  {
    title: "Duplicate Vertical",
    slug: "duplicate-vertical",
    keyCombo: ["Control", "Shift", "D"],
    description: "Duplicate selected nodes vertically"
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
    description: "Fit all / selected nodes into view"
  },
  {
    title: "Run Workflow",
    slug: "run-workflow",
    keyCombo: ["Control", "Enter"],
    description: "Execute the current workflow"
  },
  {
    title: "Delete Node",
    slug: "delete-node",
    keyCombo: ["Delete"],
    description: "Delete selected node(s)"
  },
  {
    title: "Save Workflow",
    slug: "save-workflow",
    keyCombo: ["Control", "S"],
    description: "Save current workflow"
  },
  {
    title: "Stop Workflow",
    slug: "stop-workflow",
    keyCombo: ["Escape"],
    description: "Stop running workflow"
  },
  {
    title: "Chat",
    slug: "toggle-chat",
    keyCombo: ["1"],
    description: "Toggle Chat panel"
  },
  {
    title: "Workflows",
    slug: "toggle-workflows",
    keyCombo: ["2"],
    description: "Toggle Workflows panel"
  },
  {
    title: "Assets",
    slug: "toggle-assets",
    keyCombo: ["3"],
    description: "Toggle Assets panel"
  },
  {
    title: "Collections",
    slug: "toggle-collections",
    keyCombo: ["4"],
    description: "Toggle Collections panel"
  },
  {
    title: "Packs",
    slug: "toggle-packs",
    keyCombo: ["5"],
    description: "Toggle Packs panel"
  },
  {
    title: "Inspector",
    slug: "toggle-inspector",
    keyCombo: ["I"],
    description: "Show or hide Inspector panel"
  },
  {
    title: "Operator",
    slug: "toggle-operator",
    keyCombo: ["O"],
    description: "Show or hide Operator panel"
  },
  {
    title: "Reset to Default",
    slug: "reset-default",
    keyCombo: ["Control", "MouseRight"],
    description: "Reset property to default value"
  },
  {
    title: "Group Selected",
    slug: "group-selected",
    keyCombo: ["Control", "G"],
    description: "Group selected nodes"
  },
  {
    title: "Keyboard Shortcuts",
    slug: "show-keyboard-shortcuts",
    keyCombo: ["K"],
    description: "Show Keyboard Shortcuts"
  }
];
