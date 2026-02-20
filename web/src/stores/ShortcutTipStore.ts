import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Keyboard shortcut tip categories for contextual hints
 */
export type ShortcutTipCategory =
  | "general"
  | "editor"
  | "workflow"
  | "panel"
  | "navigation"
  | "selection";

/**
 * A shortcut tip that can be shown to users
 */
export interface ShortcutTip {
  /** Unique identifier for the tip */
  id: string;
  /** The shortcut being featured */
  shortcut: {
    /** Action name (e.g., "Save Workflow") */
    title: string;
    /** Key combination (e.g., ["Ctrl", "S"]) */
    keys: string[];
    /** Optional description of what the shortcut does */
    description?: string;
  };
  /** Category for filtering */
  category: ShortcutTipCategory;
  /** Priority level (higher shown first) */
  priority: number;
  /** Number of times this tip has been shown */
  showCount: number;
  /** Whether this tip has been dismissed by user */
  dismissed: boolean;
}

/**
 * Predefined shortcut tips organized by category
 */
export const SHORTCUT_TIPS: Omit<ShortcutTip, "showCount" | "dismissed">[] = [
  // General tips
  {
    id: "save-workflow",
    shortcut: {
      title: "Save Workflow",
      keys: ["Ctrl", "S"],
      description: "Quickly save your current workflow"
    },
    category: "general",
    priority: 10
  },
  {
    id: "find-in-workflow",
    shortcut: {
      title: "Find in Workflow",
      keys: ["Ctrl", "F"],
      description: "Search for nodes by name or type"
    },
    category: "general",
    priority: 8
  },

  // Editor tips
  {
    id: "copy-paste-nodes",
    shortcut: {
      title: "Copy/Paste Nodes",
      keys: ["Ctrl", "C"],
      description: "Copy selected nodes to clipboard"
    },
    category: "editor",
    priority: 9
  },
  {
    id: "duplicate-nodes",
    shortcut: {
      title: "Duplicate Nodes",
      keys: ["Ctrl", "D"],
      description: "Quickly duplicate selected nodes"
    },
    category: "editor",
    priority: 7
  },
  {
    id: "align-nodes",
    shortcut: {
      title: "Align Nodes",
      keys: ["A"],
      description: "Align selected nodes for cleaner layouts"
    },
    category: "editor",
    priority: 6
  },
  {
    id: "group-nodes",
    shortcut: {
      title: "Group Nodes",
      keys: ["Ctrl", "G"],
      description: "Wrap selected nodes in a group"
    },
    category: "editor",
    priority: 5
  },
  {
    id: "bypass-node",
    shortcut: {
      title: "Bypass Node",
      keys: ["B"],
      description: "Toggle bypass on selected nodes"
    },
    category: "editor",
    priority: 4
  },

  // Navigation tips
  {
    id: "fit-view",
    shortcut: {
      title: "Fit View",
      keys: ["F"],
      description: "Fit all nodes into view"
    },
    category: "navigation",
    priority: 8
  },
  {
    id: "zoom-controls",
    shortcut: {
      title: "Zoom In/Out",
      keys: ["Ctrl", "+"],
      description: "Adjust zoom level by 20%"
    },
    category: "navigation",
    priority: 6
  },
  {
    id: "reset-zoom",
    shortcut: {
      title: "Reset Zoom",
      keys: ["Ctrl", "0"],
      description: "Reset zoom to 50%"
    },
    category: "navigation",
    priority: 5
  },

  // Selection tips
  {
    id: "select-all",
    shortcut: {
      title: "Select All",
      keys: ["Ctrl", "A"],
      description: "Select all nodes in the workflow"
    },
    category: "selection",
    priority: 7
  },
  {
    id: "select-connected",
    shortcut: {
      title: "Select Connected",
      keys: ["Shift", "C"],
      description: "Select all connected nodes"
    },
    category: "selection",
    priority: 5
  },
  {
    id: "keyboard-nav",
    shortcut: {
      title: "Navigate Nodes",
      keys: ["Tab"],
      description: "Navigate focus between nodes with Tab"
    },
    category: "selection",
    priority: 6
  },

  // Workflow tips
  {
    id: "run-workflow",
    shortcut: {
      title: "Run Workflow",
      keys: ["Ctrl", "Enter"],
      description: "Execute the current workflow"
    },
    category: "workflow",
    priority: 10
  },
  {
    id: "undo-redo",
    shortcut: {
      title: "Undo/Redo",
      keys: ["Ctrl", "Z"],
      description: "Undo last action"
    },
    category: "editor",
    priority: 9
  },

  // Panel tips
  {
    id: "toggle-inspector",
    shortcut: {
      title: "Toggle Inspector",
      keys: ["I"],
      description: "Show or hide the Inspector panel"
    },
    category: "panel",
    priority: 6
  },
  {
    id: "toggle-workflow-settings",
    shortcut: {
      title: "Workflow Settings",
      keys: ["W"],
      description: "Show or hide Workflow Settings panel"
    },
    category: "panel",
    priority: 5
  }
];

interface ShortcutTipStoreState {
  /** All tips with their state */
  tips: ShortcutTip[];
  /** Whether shortcut tips are enabled */
  enabled: boolean;
  /** Time of last tip display */
  lastTipTime: number | null;
  /** Minimum interval between tips (milliseconds) */
  tipInterval: number;

  // Actions
  setEnabled: (enabled: boolean) => void;
  setTipInterval: (interval: number) => void;
  dismissTip: (tipId: string) => void;
  incrementShowCount: (tipId: string) => void;
  resetTips: () => void;
  getTipById: (tipId: string) => ShortcutTip | undefined;
  getNextTip: (category?: ShortcutTipCategory) => ShortcutTip | null;
  updateLastTipTime: (time: number) => void;
}

/**
 * Zustand store for managing keyboard shortcut tips.
 *
 * Provides functionality for showing contextual keyboard shortcut hints to users,
 * tracking which tips have been shown, and allowing users to dismiss tips they don't want to see.
 *
 * @example
 * ```tsx
 * const enabled = useShortcutTipStore(state => state.enabled);
 * const nextTip = useShortcutTipStore(state => state.getNextTip('editor'));
 * ```
 */
export const useShortcutTipStore = create<ShortcutTipStoreState>()(
  persist(
    (set, get) => ({
      // Initialize tips from predefined list
      tips: SHORTCUT_TIPS.map((tip) => ({
        ...tip,
        showCount: 0,
        dismissed: false
      })),
      enabled: true,
      lastTipTime: null,
      tipInterval: 60000, // 1 minute default

      setEnabled: (enabled: boolean) => set({ enabled }),

      setTipInterval: (interval: number) => set({ tipInterval: interval }),

      dismissTip: (tipId: string) =>
        set((state) => ({
          tips: state.tips.map((tip) =>
            tip.id === tipId ? { ...tip, dismissed: true } : tip
          )
        })),

      incrementShowCount: (tipId: string) =>
        set((state) => ({
          tips: state.tips.map((tip) =>
            tip.id === tipId
              ? { ...tip, showCount: tip.showCount + 1 }
              : tip
          ),
          lastTipTime: Date.now()
        })),

      resetTips: () =>
        set({
          tips: SHORTCUT_TIPS.map((tip) => ({
            ...tip,
            showCount: 0,
            dismissed: false
          })),
          lastTipTime: null
        }),

      getTipById: (tipId: string) => {
        return get().tips.find((tip) => tip.id === tipId);
      },

      getNextTip: (category?: ShortcutTipCategory) => {
        const state = get();
        const now = Date.now();

        // Check if enough time has passed since last tip
        if (
          state.lastTipTime !== null &&
          now - state.lastTipTime < state.tipInterval
        ) {
          return null;
        }

        // Filter by category if specified
        let candidates = state.tips;
        if (category) {
          candidates = candidates.filter((tip) => tip.category === category);
        }

        // Filter out dismissed tips
        candidates = candidates.filter((tip) => !tip.dismissed);

        // Sort by: lowest show count first, then highest priority
        candidates = [...candidates].sort((a, b) => {
          if (a.showCount !== b.showCount) {
            return a.showCount - b.showCount;
          }
          return b.priority - a.priority;
        });

        return candidates.length > 0 ? candidates[0] : null;
      },

      updateLastTipTime: (time: number) => set({ lastTipTime: time })
    }),
    {
      name: "shortcut-tip-storage",
      partialize: (state) => ({
        tips: state.tips,
        enabled: state.enabled,
        tipInterval: state.tipInterval,
        lastTipTime: state.lastTipTime
      })
    }
  )
);
