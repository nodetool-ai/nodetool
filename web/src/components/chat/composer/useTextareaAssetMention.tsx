/** @jsxImportSource @emotion/react */
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";

import type { Asset } from "../../../stores/ApiTypes";
import { Z_INDEX } from "../../ui_primitives";
import { useRecentAssetsStore } from "../../../stores/RecentAssetsStore";
import { AssetMentionMenu } from "../../node_types/editing/promptComposer/AssetMentionMenu";
import { useAssetMentionSearch } from "../../node_types/editing/promptComposer/useAssetMentionSearch";

/** An active `@`-mention span in a textarea's value. */
export interface MentionTrigger {
  /** Index of the `@` character. */
  start: number;
  /** Caret position; the query is `value.slice(start + 1, end)`. */
  end: number;
  query: string;
}

const MAX_QUERY_LENGTH = 64;

/**
 * Find the `@`-mention being typed at `caret`, or `null` when none is active.
 *
 * A mention starts at an `@` that sits at the start of the value or right after
 * whitespace (so `user@host` isn't a trigger) and runs, without whitespace, up
 * to the caret. Pure and side-effect free so the detection is unit-testable.
 */
export const findMentionTrigger = (
  value: string,
  caret: number
): MentionTrigger | null => {
  for (let i = caret - 1; i >= 0; i--) {
    const ch = value[i];
    if (ch === "@") {
      const before = i > 0 ? value[i - 1] : "";
      if (before !== "" && !/\s/.test(before)) {
        return null;
      }
      const query = value.slice(i + 1, caret);
      if (query.length > MAX_QUERY_LENGTH) {
        return null;
      }
      return { start: i, end: caret, query };
    }
    if (/\s/.test(ch)) {
      return null;
    }
  }
  return null;
};

const readCaret = (el: HTMLTextAreaElement, value: string): number =>
  el.selectionStart ?? value.length;

const menuWrapperStyles = (rect: DOMRect): React.CSSProperties => ({
  position: "fixed",
  left: Math.max(8, rect.left),
  // Open upward — the composer usually sits at the bottom of the panel.
  bottom: Math.max(8, window.innerHeight - rect.top + 6),
  zIndex: Z_INDEX.tooltip
});

export interface UseTextareaAssetMention {
  /** The positioned picker, or `null` when no mention is active. */
  mentionMenu: React.ReactNode;
  /**
   * Keyboard handler for the textarea. Returns `true` when it consumed the
   * event (nav / select / dismiss) so the caller skips its own handling.
   */
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
}

export interface UseTextareaAssetMentionOptions {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  /** Replace the textarea value (used to strip the `@query` on selection). */
  setValue: (next: string) => void;
  /** Called with the picked asset once the `@query` has been removed. */
  onSelectAsset: (asset: Asset) => void;
}

/**
 * Wire `@`-mention asset picking into a plain `<textarea>`. Detects the trigger
 * from the caret, renders the shared {@link AssetMentionMenu} above the input,
 * and on selection strips the typed `@query` and hands the asset to
 * `onSelectAsset` (the composer attaches it). Keyboard nav, Enter/Tab to pick,
 * and Escape to dismiss are handled via {@link handleKeyDown}.
 */
export const useTextareaAssetMention = ({
  textareaRef,
  value,
  setValue,
  onSelectAsset
}: UseTextareaAssetMentionOptions): UseTextareaAssetMention => {
  const addRecentAsset = useRecentAssetsStore((state) => state.addRecentAsset);

  const [trigger, setTrigger] = useState<MentionTrigger | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  // Position of a dismissed trigger — keeps the picker closed until the user
  // moves off that `@` (or starts a new one) so Escape actually dismisses.
  const dismissedStartRef = useRef<number | null>(null);
  // Pending caret to restore after a value edit re-renders the textarea.
  const pendingCaretRef = useRef<number | null>(null);

  const { activeTab, setActiveTab, displayedAssets, handleRename } =
    useAssetMentionSearch(trigger ? trigger.query : null);

  const measure = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      setRect(el.getBoundingClientRect());
    }
  }, [textareaRef]);

  const close = useCallback(() => {
    setTrigger(null);
    setSelectedIndex(0);
  }, []);

  const syncFromTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) {
      close();
      return;
    }
    const next = findMentionTrigger(value, readCaret(el, value));
    if (!next) {
      dismissedStartRef.current = null;
      close();
      return;
    }
    if (dismissedStartRef.current === next.start) {
      // Still on the dismissed `@` — stay closed but track the span.
      return;
    }
    dismissedStartRef.current = null;
    setTrigger((prev) => {
      if (!prev || prev.start !== next.start) {
        setSelectedIndex(0);
      }
      return next;
    });
    measure();
  }, [textareaRef, value, close, measure]);

  // Re-evaluate whenever the value changes (typing, paste, programmatic edits).
  useEffect(() => {
    syncFromTextarea();
  }, [value, syncFromTextarea]);

  // Re-evaluate on caret moves (arrow keys, clicks) while the textarea is focused.
  useEffect(() => {
    const onSelectionChange = () => {
      if (document.activeElement === textareaRef.current) {
        syncFromTextarea();
      }
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", onSelectionChange);
  }, [textareaRef, syncFromTextarea]);

  // Keep the picker glued to the input while it's open.
  useEffect(() => {
    if (!trigger) {
      return;
    }
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [trigger, measure]);

  // Restore the caret after we strip the `@query` from the value.
  useLayoutEffect(() => {
    const caret = pendingCaretRef.current;
    if (caret === null) {
      return;
    }
    pendingCaretRef.current = null;
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(caret, caret);
    }
  }, [value, textareaRef]);

  const selectAsset = useCallback(
    (asset: Asset) => {
      if (trigger) {
        pendingCaretRef.current = trigger.start;
        setValue(value.slice(0, trigger.start) + value.slice(trigger.end));
      }
      onSelectAsset(asset);
      addRecentAsset(asset);
      close();
    },
    [trigger, value, setValue, onSelectAsset, addRecentAsset, close]
  );

  const optionCount = displayedAssets.length;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!trigger) {
        return false;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        dismissedStartRef.current = trigger.start;
        close();
        return true;
      }
      if (optionCount === 0) {
        // Nothing to pick — let Enter and friends fall through to the composer.
        return false;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % optionCount);
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + optionCount) % optionCount);
        return true;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        const asset = displayedAssets[Math.min(selectedIndex, optionCount - 1)];
        if (asset) {
          e.preventDefault();
          selectAsset(asset);
          return true;
        }
      }
      return false;
    },
    [trigger, optionCount, displayedAssets, selectedIndex, selectAsset, close]
  );

  const mentionMenu = useMemo(() => {
    if (!trigger || !rect) {
      return null;
    }
    return createPortal(
      <div style={menuWrapperStyles(rect)}>
        <AssetMentionMenu
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setSelectedIndex(0);
          }}
          assets={displayedAssets}
          selectedIndex={selectedIndex}
          onSelect={(index) => {
            const asset = displayedAssets[index];
            if (asset) {
              selectAsset(asset);
            }
          }}
          onHighlight={setSelectedIndex}
          onRename={handleRename}
          queryString={trigger.query}
        />
      </div>,
      document.body
    );
  }, [
    trigger,
    rect,
    activeTab,
    setActiveTab,
    displayedAssets,
    selectedIndex,
    selectAsset,
    handleRename
  ]);

  return { mentionMenu, handleKeyDown };
};
