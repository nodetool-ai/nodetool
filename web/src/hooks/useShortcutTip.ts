import { useEffect, useState, useCallback } from "react";
import {
  useShortcutTipStore,
  type ShortcutTip,
  type ShortcutTipCategory
} from "../stores/ShortcutTipStore";

interface UseShortcutTipOptions {
  /** Whether to automatically show tips on mount */
  autoShow?: boolean;
  /** Category filter for tips (if not specified, shows all categories) */
  category?: ShortcutTipCategory;
  /** Delay before showing first tip (milliseconds) */
  initialDelay?: number;
}

interface UseShortcutTipReturn {
  /** Current tip to display */
  currentTip: ShortcutTip | null;
  /** Whether tips are enabled */
  enabled: boolean;
  /** Manually show a tip */
  showTip: () => void;
  /** Dismiss the current tip */
  dismissTip: () => void;
  /** Enable/disable tips */
  setEnabled: (enabled: boolean) => void;
  /** Reset all tips to unseen state */
  resetTips: () => void;
}

/**
 * Hook for managing keyboard shortcut tips.
 *
 * Provides functionality for showing contextual keyboard shortcut hints to users,
 * with automatic tracking of shown tips and user preferences.
 *
 * @example
 * ```tsx
 * // Auto-show tips with default settings
 * const { currentTip, dismissTip } = useShortcutTip({ autoShow: true });
 *
 * // Show tips for specific category
 * const { currentTip } = useShortcutTip({ category: 'editor' });
 *
 * // Manual tip display
 * const { currentTip, showTip, dismissTip } = useShortcutTip();
 * ```
 */
export const useShortcutTip = (
  options: UseShortcutTipOptions = {}
): UseShortcutTipReturn => {
  const { autoShow = false, category, initialDelay = 2000 } = options;

  // Use selective Zustand subscriptions to prevent unnecessary re-renders
  const enabled = useShortcutTipStore((state) => state.enabled);
  const getNextTip = useShortcutTipStore((state) => state.getNextTip);
  const incrementShowCount = useShortcutTipStore((state) => state.incrementShowCount);
  const dismissTipStore = useShortcutTipStore((state) => state.dismissTip);
  const setEnabledStore = useShortcutTipStore((state) => state.setEnabled);
  const resetTipsStore = useShortcutTipStore((state) => state.resetTips);

  const [currentTip, setCurrentTip] = useState<ShortcutTip | null>(null);

  // Show a tip and track that it was shown
  const showTip = useCallback(() => {
    if (!enabled) {
      return;
    }

    const tip = getNextTip(category);
    if (tip) {
      setCurrentTip(tip);
      incrementShowCount(tip.id);
    }
  }, [enabled, category, getNextTip, incrementShowCount]);

  // Dismiss the current tip
  const dismissTip = useCallback(() => {
    if (currentTip) {
      dismissTipStore(currentTip.id);
    }
    setCurrentTip(null);
  }, [currentTip, dismissTipStore]);

  // Set enabled state
  const setEnabled = useCallback((enabled: boolean) => {
    setEnabledStore(enabled);
  }, [setEnabledStore]);

  // Reset all tips
  const resetTips = useCallback(() => {
    resetTipsStore();
    setCurrentTip(null);
  }, [resetTipsStore]);

  // Auto-show on mount if enabled
  useEffect(() => {
    if (autoShow && enabled) {
      const timer = setTimeout(() => {
        showTip();
      }, initialDelay);

      return () => {
        clearTimeout(timer);
      };
    }
  }, [autoShow, enabled, initialDelay, showTip]);

  return {
    currentTip,
    enabled,
    showTip,
    dismissTip,
    setEnabled,
    resetTips
  };
};
