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
import type { Entity } from "@nodetool-ai/protocol";
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
  /**
   * Called with the picked entity after its name has replaced the `@query`
   * in the text. When omitted, entities are not offered in the picker.
   */
  onSelectEntity?: (entity: Entity) => void;
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
  onSelectAsset,
  onSelectEntity
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
  // The portaled menu's DOM node, so outside-click detection can exempt it.
  const menuRef = useRef<HTMLDivElement | null>(null);

  const {
    activeTab,
    setActiveTab,
    entities: matchedEntities,
    displayedAssets,
    hasMoreSaved,
    loadMoreSaved,
    handleRename
  } = useAssetMentionSearch(trigger ? trigger.query : null);
  // Entities are only offered when the host can do something with one.
  const entities = (onSelectEntity && matchedEntities) || [];

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

  // Dismiss on an outside click — anywhere but the textarea itself or the
  // picker menu.
  useEffect(() => {
    if (!trigger) {
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) {
        return;
      }
      if (textareaRef.current?.contains(target)) {
        return;
      }
      if (menuRef.current?.contains(target)) {
        return;
      }
      dismissedStartRef.current = trigger.start;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [trigger, textareaRef, close]);

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

  // An entity reads as part of the sentence: its name replaces the typed
  // `@query` inline, then the host attaches its reference image.
  const selectEntity = useCallback(
    (entity: Entity) => {
      if (trigger) {
        const inserted = `${entity.name} `;
        pendingCaretRef.current = trigger.start + inserted.length;
        setValue(
          value.slice(0, trigger.start) + inserted + value.slice(trigger.end)
        );
      }
      onSelectEntity?.(entity);
      close();
    },
    [trigger, value, setValue, onSelectEntity, close]
  );

  // Combined selection order: entities first, then the active asset bucket.
  const optionCount = entities.length + displayedAssets.length;

  const selectIndex = useCallback(
    (index: number) => {
      if (index < entities.length) {
        selectEntity(entities[index]);
        return;
      }
      const asset = displayedAssets[index - entities.length];
      if (asset) {
        selectAsset(asset);
      }
    },
    [entities, displayedAssets, selectEntity, selectAsset]
  );

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
        e.preventDefault();
        selectIndex(Math.min(selectedIndex, optionCount - 1));
        return true;
      }
      return false;
    },
    [trigger, optionCount, selectedIndex, selectIndex, close]
  );

  const mentionMenu = useMemo(() => {
    if (!trigger || !rect) {
      return null;
    }
    return createPortal(
      <div ref={menuRef} style={menuWrapperStyles(rect)}>
        <AssetMentionMenu
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setSelectedIndex(0);
          }}
          entities={entities}
          assets={displayedAssets}
          selectedIndex={selectedIndex}
          onSelect={selectIndex}
          onHighlight={setSelectedIndex}
          onRename={handleRename}
          queryString={trigger.query}
          hasMore={hasMoreSaved}
          onLoadMore={loadMoreSaved}
        />
      </div>,
      document.body
    );
  }, [
    trigger,
    rect,
    activeTab,
    setActiveTab,
    entities,
    displayedAssets,
    selectedIndex,
    selectIndex,
    handleRename,
    hasMoreSaved,
    loadMoreSaved
  ]);

  return { mentionMenu, handleKeyDown };
};
