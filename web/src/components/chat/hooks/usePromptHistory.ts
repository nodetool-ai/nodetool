import { useCallback, useRef } from "react";

interface UsePromptHistoryOptions {
  /** Current textarea value (the live draft). */
  value: string;
  /** Setter for the textarea value. */
  setValue: (next: string) => void;
  /** Ref to the textarea, used to read/move the caret. */
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  /** Maximum number of prompts to keep. Oldest are dropped past this. */
  maxEntries?: number;
}

interface UsePromptHistoryReturn {
  /** Record a submitted prompt so it can be recalled later. */
  record: (prompt: string) => void;
  /**
   * Shell-style history navigation for the composer. Returns `true` when the
   * key was handled (the caller should stop processing the event).
   *
   * - ArrowUp at the very start of an empty-or-any field steps back through
   *   previously sent prompts; once navigating, further ArrowUp keeps stepping
   *   back regardless of caret position.
   * - ArrowDown while navigating steps forward, and past the newest entry
   *   restores the draft the user was typing before navigation began.
   */
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
  /** Reset navigation state — call when the user edits the field manually. */
  resetNavigation: () => void;
}

/**
 * Terminal-style prompt history for chat composers: ArrowUp/ArrowDown recall
 * previously sent messages so they can be edited and resent. History is kept
 * in memory for the life of the composer.
 */
export function usePromptHistory({
  value,
  setValue,
  textareaRef,
  maxEntries = 50
}: UsePromptHistoryOptions): UsePromptHistoryReturn {
  const historyRef = useRef<string[]>([]);
  // -1 means "not navigating": the field holds the live draft.
  const indexRef = useRef<number>(-1);
  // The live draft captured when navigation begins, restored on the way back.
  const stashRef = useRef<string>("");

  const record = useCallback(
    (prompt: string) => {
      if (prompt.trim().length === 0) {
        return;
      }
      const history = historyRef.current;
      // Skip consecutive duplicates so repeated sends don't clutter history.
      if (history[history.length - 1] !== prompt) {
        history.push(prompt);
        if (history.length > maxEntries) {
          history.shift();
        }
      }
      indexRef.current = -1;
      stashRef.current = "";
    },
    [maxEntries]
  );

  const resetNavigation = useCallback(() => {
    indexRef.current = -1;
  }, []);

  const applyValue = useCallback(
    (next: string) => {
      setValue(next);
      // Move the caret to the end after React commits the new value so the next
      // ArrowUp/ArrowDown reads a settled caret position.
      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (textarea) {
          const end = next.length;
          textarea.setSelectionRange(end, end);
        }
      });
    },
    [setValue, textareaRef]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") {
        return false;
      }
      if (
        e.nativeEvent.isComposing ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        e.shiftKey
      ) {
        return false;
      }
      const textarea = textareaRef.current;
      if (!textarea) {
        return false;
      }
      const history = historyRef.current;
      if (history.length === 0) {
        return false;
      }
      const caretStart = textarea.selectionStart;
      const caretEnd = textarea.selectionEnd;

      if (e.key === "ArrowUp") {
        if (indexRef.current === -1) {
          // Only hijack ArrowUp from the very start of the field, so it never
          // interferes with moving the caret up through multi-line text.
          if (caretStart !== 0 || caretEnd !== 0) {
            return false;
          }
          stashRef.current = value;
          indexRef.current = history.length - 1;
          e.preventDefault();
          applyValue(history[indexRef.current]);
          return true;
        }
        if (indexRef.current > 0) {
          indexRef.current -= 1;
          e.preventDefault();
          applyValue(history[indexRef.current]);
          return true;
        }
        // Already at the oldest entry — swallow so the caret doesn't jump.
        e.preventDefault();
        return true;
      }

      // ArrowDown only acts while navigating history.
      if (indexRef.current === -1) {
        return false;
      }
      // Require the caret at the end so ArrowDown can still move down through
      // multi-line recalled text.
      if (caretStart !== value.length || caretEnd !== value.length) {
        return false;
      }
      if (indexRef.current < history.length - 1) {
        indexRef.current += 1;
        e.preventDefault();
        applyValue(history[indexRef.current]);
        return true;
      }
      // Past the newest entry: restore the stashed live draft.
      indexRef.current = -1;
      e.preventDefault();
      applyValue(stashRef.current);
      return true;
    },
    [value, textareaRef, applyValue]
  );

  return { record, handleKeyDown, resetNavigation };
}
