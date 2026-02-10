import { useMemo, useState, useCallback } from "react";
import { useNodes } from "../contexts/NodeContext";
import { shallow } from "zustand/shallow";

/**
 * Configuration for contextual shortcut hints based on editor state.
 */
interface HintContext {
  /** The minimum number of selected nodes required for this context */
  minSelection?: number;
  /** The maximum number of selected nodes for this context */
  maxSelection?: number;
  /** Array of shortcut slugs to display in this context */
  shortcuts: string[];
  /** Priority of this context (higher is more specific) */
  priority?: number;
}

/**
 * Map of context keys to their hint configurations.
 */
type HintContexts = Record<string, HintContext>;

/**
 * Default hint contexts for different editor states.
 */
export const DEFAULT_HINT_CONTEXTS: HintContexts = {
  // When 2+ nodes are selected - show alignment and group shortcuts
  multiple_selected: {
    minSelection: 2,
    maxSelection: Infinity,
    shortcuts: [
      "align",
      "alignWithSpacing",
      "distributeHorizontal",
      "groupSelected",
      "copy",
      "duplicate"
    ],
    priority: 10
  },
  // When exactly 1 node is selected - show manipulation shortcuts
  single_selected: {
    minSelection: 1,
    maxSelection: 1,
    shortcuts: [
      "copy",
      "cut",
      "duplicate",
      "duplicateVertical",
      "bypassNode",
      "deleteNode",
      "nodeInfo"
    ],
    priority: 5
  },
  // When any nodes are selected - show common shortcuts
  any_selected: {
    minSelection: 1,
    maxSelection: Infinity,
    shortcuts: ["selectConnectedAll", "selectConnectedInputs", "selectConnectedOutputs"],
    priority: 1
  },
  // Default context - always show basic navigation
  default: {
    shortcuts: ["openNodeMenu", "findInWorkflow", "fitView", "saveWorkflow"],
    priority: 0
  }
};

/**
 * Result of the useKeyboardShortcutHints hook.
 */
interface UseKeyboardShortcutHintsResult {
  /** Array of shortcut slugs to display */
  hintSlugs: string[];
  /** Whether hints are currently visible */
  isVisible: boolean;
  /** Manually set visibility (useful for user preferences) */
  setVisible: (visible: boolean) => void;
}

/**
 * Hook for managing contextual keyboard shortcut hints in the node editor.
 *
 * Automatically determines which shortcuts to show based on:
 * - Number of selected nodes
 * - Current editor state
 * - Configurable hint contexts
 *
 * Features:
 * - Context-aware hint selection
 * - Priority-based hint resolution
 * - User visibility preference
 * - Optimized with selectors and memoization
 *
 * @param hintContexts - Optional custom hint contexts (defaults to DEFAULT_HINT_CONTEXTS)
 * @param enabled - Whether hints are enabled (default: true)
 *
 * @example
 * ```typescript
 * // Use default contexts
 * const { hintSlugs, isVisible, setVisible } = useKeyboardShortcutHints();
 *
 * // With custom contexts
 * const customContexts = {
 *   my_context: {
 *     minSelection: 1,
 *     shortcuts: ["myShortcut1", "myShortcut2"],
 *     priority: 20
 *   }
 * };
 * const { hintSlugs } = useKeyboardShortcutHints(customContexts);
 * ```
 */
export const useKeyboardShortcutHints = (
  hintContexts: HintContexts = DEFAULT_HINT_CONTEXTS,
  enabled: boolean = true
): UseKeyboardShortcutHintsResult => {
  // Use selective subscription to avoid unnecessary re-renders
  const selectedNodes = useNodes(
    (state) => state.nodes.filter((node) => node.selected),
    shallow
  );

  const [userVisible, setUserVisible] = useState<boolean>(true);

  // Determine which hints to show based on selection state
  const hintSlugs = useMemo(() => {
    if (!enabled || !userVisible) {
      return [];
    }

    const selectionCount = selectedNodes.length;

    // Find all matching contexts
    const matchingContexts = Object.entries(hintContexts)
      .filter(([_, context]) => {
        const min = context.minSelection ?? 0;
        const max = context.maxSelection ?? Infinity;
        return selectionCount >= min && selectionCount <= max;
      })
      .sort(([, a], [, b]) => (b.priority ?? 0) - (a.priority ?? 0));

    // Collect shortcuts from highest priority contexts
    const shortcutsSet = new Set<string>();
    for (const [, context] of matchingContexts) {
      context.shortcuts.forEach((shortcut) => {
        shortcutsSet.add(shortcut);
      });
    }

    return Array.from(shortcutsSet);
  }, [enabled, userVisible, selectedNodes.length, hintContexts]);

  // Determine if hints should be visible
  const isVisible = useMemo(() => {
    return enabled && userVisible && hintSlugs.length > 0;
  }, [enabled, userVisible, hintSlugs]);

  // Stable callback for setting visibility
  const setVisible = useCallback((visible: boolean) => {
    setUserVisible(visible);
  }, []);

  return {
    hintSlugs,
    isVisible,
    setVisible
  };
};

export type { HintContext, HintContexts, UseKeyboardShortcutHintsResult };
