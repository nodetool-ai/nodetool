import React from "react";

/**
 * Defines the structure for a keyboard shortcut.
 */
export interface Shortcut {
  /** Human-readable title, e.g. "Copy" */
  title: string;
  /** Stable identifier to reference this shortcut elsewhere */
  slug: string;
  /** Base key combo (Windows / Linux). Example: ["Control", "C"] */
  keyCombo: string[];
  /** Shortcut category */
  category: "editor" | "panel" | "assets" | "workflow";
  /** macOS-specific combo; if omitted, keys are derived automatically */
  keyComboMac?: string[];
  /** Tooltip/body text */
  description?: string;
  /** Whether this shortcut is only available in the Electron app */
  electronOnly?: boolean;
  /** Whether this shortcut should be registered inside useNodeEditorShortcuts  */
  registerCombo?: boolean;
  /** Additional alternative key combinations that trigger the same shortcut */
  altKeyCombos?: string[][];
}

/**
 * Maps common modifier keys to their macOS equivalents.
 * e.g. "Control" -> "Meta" (⌘), "Alt" -> "Option" (⌥)
 * @param key The key to map.
 * @returns The mapped key for macOS.
 */
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

/**
 * Expands a list of shortcuts to include OS-specific key combinations.
 * For example, on macOS, "Control" is mapped to "Meta" (⌘).
 * @param shortcuts The array of shortcuts to expand.
 * @param mac Whether to use macOS-specific key combinations.
 * @returns A new array of shortcuts with OS-specific key combos.
 */
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
 * Returns a JSX tooltip for a given shortcut slug.
 *
 * The tooltip contains the shortcut's title and key combinations for different operating systems.
 *
 * @param slug The slug of the shortcut to get the tooltip for.
 * @param os The operating system to display the shortcut for. Defaults to the current OS.
 * @param mode The display mode for the tooltip. 'full' shows title and combo, 'combo' shows only the key combo.
 * @param showDescription Whether to show the shortcut's description in the tooltip.
 * @returns A React element for the tooltip, or the original slug if the shortcut is not found.
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
  mode: "full" | "combo" = "full",
  showDescription = false
): React.ReactElement | string => {
  const sc = NODE_EDITOR_SHORTCUTS.find((s) => s.slug === slug);
  if (!sc) {return slug;}

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
        return "SPACE";
      case "arrowup":
        return "↑";
      case "arrowdown":
        return "↓";
      case "arrowleft":
        return "←";
      case "arrowright":
        return "→";
      case "escape":
      case "esc":
        return "ESC";
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
      if (idx < parts.length - 1) {nodes.push("+");}
      return nodes;
    });
  };

  const showBoth = os === "both";

  const keyChildren: React.ReactNode[] = showBoth
    ? [...renderSeries(winCombo), " / ", ...renderSeries(macCombo)]
    : renderSeries(os === "mac" ? macCombo : winCombo);

  if (mode === "combo") {
    return React.createElement(
      "span",
      { className: "shortcut-combo" },
      ...keyChildren
    );
  }

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

/**
 * The master list of all keyboard shortcuts available in the node editor and surrounding UI.
 */
export const NODE_EDITOR_SHORTCUTS: Shortcut[] = [
  // exit fullscreen with ESC key
  {
    title: "Exit Fullscreen",
    slug: "exitFullscreen",
    keyCombo: ["Escape"],
    category: "editor",
    description: "Exit fullscreen mode",
    registerCombo: false
  },
  // ---------- NODES -------------------------------------------------------
  {
    title: "Copy",
    slug: "copy",
    keyCombo: ["Control", "C"],
    category: "editor",
    description: "Copy selected nodes",
    registerCombo: true
  },
  {
    title: "Cut",
    slug: "cut",
    keyCombo: ["Control", "X"],
    category: "editor",
    description: "Cut selected nodes",
    registerCombo: true
  },
  {
    title: "Paste",
    slug: "paste",
    keyCombo: ["Control", "V"],
    category: "editor",
    description: "Paste nodes from clipboard",
    registerCombo: true
  },
  {
    title: "Undo",
    slug: "undo",
    keyCombo: ["Control", "Z"],
    category: "editor",
    description: "Undo last action",
    registerCombo: true
  },
  {
    title: "Redo",
    slug: "redo",
    keyCombo: ["Control", "Shift", "Z"],
    category: "editor",
    description: "Redo last undone action",
    registerCombo: true
  },
  {
    title: "Select All",
    slug: "selectAll",
    keyCombo: ["Control", "A"],
    category: "editor",
    description: "Select all nodes",
    registerCombo: true
  },
  {
    title: "Align",
    slug: "align",
    keyCombo: ["A"],
    category: "editor",
    description: "Align selected nodes",
    registerCombo: true
  },
  {
    title: "Align with Spacing",
    slug: "alignWithSpacing",
    keyCombo: ["Shift", "A"],
    category: "editor",
    description: "Align selected nodes and distribute spacing",
    registerCombo: true
  },
  {
    title: "Duplicate",
    slug: "duplicate",
    keyCombo: ["Control", "D"],
    category: "editor",
    description: "Duplicate selected nodes",
    registerCombo: true
  },
  {
    title: "Duplicate Vertical",
    slug: "duplicateVertical",
    keyCombo: ["Control", "Shift", "D"],
    category: "editor",
    description: "Duplicate selected nodes vertically",
    registerCombo: true
  },
  {
    title: "Fit View",
    slug: "fitView",
    keyCombo: ["F"],
    category: "editor",
    description: "Fit all / selected nodes into view",
    registerCombo: true
  },
  {
    title: "Delete Node",
    slug: "deleteNode",
    keyCombo: ["Delete"],
    category: "editor",
    description: "Delete selected nodes (Backspace or Delete)",
    registerCombo: false
  },
  {
    title: "Delete Node",
    slug: "deleteNodeBackspace",
    keyCombo: ["Backspace"],
    category: "editor",
    description: "Delete selected nodes (Backspace or Delete)",
    registerCombo: false
  },
  {
    title: "Reset to Default",
    slug: "resetDefault",
    keyCombo: ["Control", "MouseRight"],
    category: "editor",
    description: "Reset property to default value",
    registerCombo: false
  },
  {
    title: "Group Selected",
    slug: "groupSelected",
    keyCombo: ["Control", "G"],
    category: "editor",
    description: "Group selected nodes",
    registerCombo: true
  },
  {
    title: "Move Left",
    slug: "moveLeft",
    keyCombo: ["ArrowLeft"],
    category: "editor",
    description: "Nudge selected nodes left",
    registerCombo: true
  },
  {
    title: "Move Right",
    slug: "moveRight",
    keyCombo: ["ArrowRight"],
    category: "editor",
    description: "Nudge selected nodes right",
    registerCombo: true
  },
  {
    title: "Move Up",
    slug: "moveUp",
    keyCombo: ["ArrowUp"],
    category: "editor",
    description: "Nudge selected nodes up",
    registerCombo: true
  },
  {
    title: "Move Down",
    slug: "moveDown",
    keyCombo: ["ArrowDown"],
    category: "editor",
    description: "Nudge selected nodes down",
    registerCombo: true
  },
  {
    title: "Bypass Node",
    slug: "bypassNode",
    keyCombo: ["B"],
    category: "editor",
    description: "Toggle bypass on selected nodes",
    registerCombo: true
  },
  {
    title: "Select Connected (All)",
    slug: "selectConnectedAll",
    keyCombo: ["Shift", "C"],
    category: "editor",
    description: "Select all nodes connected to selected nodes (inputs and outputs)",
    registerCombo: true
  },
  {
    title: "Select Connected (Inputs)",
    slug: "selectConnectedInputs",
    keyCombo: ["Shift", "I"],
    category: "editor",
    description: "Select all nodes that connect into selected nodes",
    registerCombo: true
  },
  {
    title: "Select Connected (Outputs)",
    keyCombo: ["Shift", "O"],
    category: "editor",
    description: "Select all nodes that receive output from selected nodes",
    registerCombo: true,
    slug: "selectConnectedOutputs"
  },

  // ---------- PANEL -------------------------------------------------------
  {
    title: "Open Node Menu",
    slug: "openNodeMenu",
    keyCombo: [" "],
    category: "panel",
    description: "Open Node Menu - also double-click canvas",
    registerCombo: true
  },
  {
    title: "Chat",
    slug: "toggleChat",
    keyCombo: ["1"],
    category: "panel",
    description: "Toggle Chat panel",
    registerCombo: false
  },
  {
    title: "Workflows",
    slug: "toggleWorkflows",
    keyCombo: ["2"],
    category: "panel",
    description: "Toggle Workflows panel",
    registerCombo: false
  },
  {
    title: "Assets",
    slug: "toggleAssets",
    keyCombo: ["3"],
    category: "panel",
    description: "Toggle Assets panel",
    registerCombo: false
  },
  {
    title: "Inspector",
    slug: "toggleInspector",
    keyCombo: ["I"],
    category: "panel",
    description: "Show or hide Inspector panel",
    registerCombo: true
  },
  {
    title: "Operator",
    slug: "toggleOperator",
    keyCombo: ["O"],
    category: "panel",
    description: "Show or hide Operator panel",
    registerCombo: false
  },
  // K is conflicting with CommandMenu shortcut
  // {
  //   title: "Keyboard Shortcuts",
  //   slug: "showKeyboardShortcuts",
  //   keyCombo: ["K"],
  //   category: "panel",
  //   description: "Show Keyboard Shortcuts",
  //   registerCombo: true
  // },

  // ---------- WORKFLOW ----------------------------------------------------
  {
    title: "Run Workflow",
    slug: "runWorkflow",
    keyCombo: ["Control", "Enter"],
    category: "workflow" as const,
    description: "Execute the current workflow",
    registerCombo: false
  },
  {
    title: "Stop Workflow",
    slug: "stopWorkflow",
    keyCombo: ["Escape"],
    category: "workflow" as const,
    description: "Stop running workflow",
    registerCombo: false
  },
  {
    title: "Save Workflow",
    slug: "saveWorkflow",
    keyCombo: ["Control", "S"],
    category: "workflow" as const,
    description: "Save current workflow",
    registerCombo: true
  },
  {
    title: "Save Example",
    slug: "saveExample",
    keyCombo: ["Control", "."],
    category: "workflow" as const,
    description: "Save workflow as example",
    registerCombo: true
  },
  {
    title: "New Workflow",
    slug: "newWorkflow",
    keyCombo: ["Control", "T"],
    category: "workflow" as const,
    description: "Create a new workflow tab",
    registerCombo: true,
    electronOnly: true
  },
  {
    title: "Close Workflow",
    slug: "closeWorkflow",
    keyCombo: ["Control", "W"],
    category: "workflow" as const,
    description: "Close current workflow tab",
    registerCombo: true,
    electronOnly: true
  },
  {
    title: "Previous Tab",
    slug: "prevTab",
    keyCombo: ["Control", "PageUp"],
    altKeyCombos: [
      ["Control", "Shift", "["],
      ["Control", "Alt", "ArrowLeft"]
    ],
    category: "workflow" as const,
    description: "Activate previous workflow tab",
    registerCombo: true
  },
  {
    title: "Next Tab",
    slug: "nextTab",
    keyCombo: ["Control", "PageDown"],
    altKeyCombos: [
      ["Control", "Shift", "]"],
      ["Control", "Alt", "ArrowRight"]
    ],
    category: "workflow" as const,
    description: "Activate next workflow tab",
    registerCombo: true
  },
  // Direct tab switching (Ctrl/Cmd 1-9)
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map<Shortcut>((n) => ({
    title: `Switch to Tab ${n}`,
    slug: `switchToTab${n}`,
    keyCombo: ["Control", `${n}`],
    category: "workflow" as const,
    description: `Activate workflow tab ${n}`,
    registerCombo: true
  })),

  // ---------- FIND IN WORKFLOW ---------------------------------------------
   {
    title: "Find in Workflow",
    slug: "findInWorkflow",
    keyCombo: ["Control", "F"],
    category: "editor" as const,
    description: "Find and navigate to nodes in the current workflow",
    registerCombo: true
  },

  // ---------- ANNOTATIONS ----------------------------------------------------
  {
    title: "Add Annotation",
    slug: "addAnnotation",
    keyCombo: ["C"],
    category: "editor" as const,
    description: "Add a new comment/annotation at the current position",
    registerCombo: true
  },
  {
    title: "Toggle Annotation Panel",
    slug: "toggleAnnotationPanel",
    keyCombo: ["Shift", "C"],
    category: "panel" as const,
    description: "Show or hide Annotation Navigator panel",
    registerCombo: true
  }
] as Shortcut[];

/**
 * A mapping of shortcut categories to their human-readable display names.
 * Used for grouping shortcuts in the UI.
 */
export const SHORTCUT_CATEGORIES: Record<Shortcut["category"], string> = {
  workflow: "Workflows",
  panel: "Panels",
  editor: "Node Editor",
  assets: "Asset Viewer"
};
