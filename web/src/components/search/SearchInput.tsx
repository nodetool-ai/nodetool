import React, { useCallback, useMemo, useRef, useState } from "react";
import { SearchInput as SearchField } from "../ui_primitives";
import {
  registerComboCallback,
  registerTypeToFocus
} from "../../stores/KeyPressedStore";
import { useDebouncedCallback } from "../../hooks/useDebouncedCallback";
import { isMac } from "../../utils/platform";
import { useAutoFocusEnabled } from "../../hooks/useAutoFocusEnabled";
import type { NodeMetadata } from "../../stores/ApiTypes";

interface SearchInputProps {
  onSearchChange: (value: string) => void;
  onPressEscape?: () => void;
  onPressArrowDown?: () => void;
  onPressArrowUp?: () => void;
  onPressEnter?: () => void;
  /**
   * Called when Space is pressed while the input is focused and empty. Lets a
   * host (e.g. the node menu) make Space a toggle without breaking multi-word
   * search — once there's text, Space types normally.
   */
  onPressSpaceWhenEmpty?: () => void;
  focusSearchInput?: boolean;
  focusOnTyping?: boolean;
  placeholder?: string;
  debounceTime?: number;
  maxWidth?: string;
  searchTerm?: string;
  searchResults?: NodeMetadata[];
  width?: number | string;
}

const SearchInput: React.FC<SearchInputProps> = ({
  onSearchChange,
  onPressEscape,
  onPressArrowDown,
  onPressArrowUp,
  onPressEnter,
  onPressSpaceWhenEmpty,
  focusSearchInput = true,
  focusOnTyping = false,
  placeholder = "Search",
  maxWidth = "unset",
  debounceTime = 50,
  searchTerm: externalSearchTerm = "",
  width = 150
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const autoFocusEnabled = useAutoFocusEnabled();
  const [localSearchTerm, setLocalSearchTerm] = useState(externalSearchTerm);
  // The typed value the debounce has not delivered yet, or null.
  const pendingSearchRef = useRef<string | null>(null);
  // Enter pressed while a search was pending: flushed, then delivered after
  // the host re-renders with the new results.
  const [enterRequest, setEnterRequest] = useState(0);
  const onPressEnterRef = useRef(onPressEnter);
  onPressEnterRef.current = onPressEnter;

  // Debounced search - store handles search ID management internally
  const debounced = useDebouncedCallback((value: string) => {
    pendingSearchRef.current = null;
    onSearchChange(value);
  }, debounceTime);
  const debouncedSetSearchTerm = useMemo(() => {
    const fn = (value: string) => {
      pendingSearchRef.current = value;
      debounced(value);
    };
    fn.cancel = () => {
      pendingSearchRef.current = null;
      debounced.cancel();
    };
    return fn;
  }, [debounced]);

  const pressEnter = useCallback(() => {
    const pending = pendingSearchRef.current;
    if (pending === null) {
      onPressEnter?.();
      return;
    }
    debouncedSetSearchTerm.cancel();
    onSearchChange(pending);
    setEnterRequest((n) => n + 1);
  }, [debouncedSetSearchTerm, onSearchChange, onPressEnter]);

  React.useEffect(() => {
    if (enterRequest > 0) {
      onPressEnterRef.current?.();
    }
  }, [enterRequest]);

  const resetSearch = useCallback(() => {
    debouncedSetSearchTerm.cancel();
    setLocalSearchTerm("");
    onSearchChange("");
  }, [debouncedSetSearchTerm, onSearchChange]);

  const handleInputChange = useCallback(
    (newValue: string) => {
      // Update local state immediately for responsiveness; debounce the search.
      setLocalSearchTerm(newValue);
      debouncedSetSearchTerm(newValue);
    },
    [debouncedSetSearchTerm]
  );

  const clearSearch = useCallback(() => {
    resetSearch();
    inputRef.current?.focus();
  }, [resetSearch]);

  // Skipped on touch, where the virtual keyboard would cover the menu that
  // just opened.
  React.useEffect(() => {
    if (focusSearchInput && autoFocusEnabled) {
      inputRef.current?.focus();
    }
  }, [focusSearchInput, autoFocusEnabled]);

  // Element-scoped: these keys act on the field the user is typing in, so they
  // ride on the input itself instead of a window listener.
  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        (event.ctrlKey || event.metaKey)
      ) {
        event.preventDefault();
        clearSearch();
        return;
      }
      if (event.key === "Escape") {
        onPressEscape?.();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        onPressArrowDown?.();
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        onPressArrowUp?.();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        pressEnter();
        return;
      }
      // Space on an empty, focused search toggles the host closed (e.g. the node
      // menu). Once there's text, Space falls through and types normally so
      // multi-word searches still work.
      if (
        onPressSpaceWhenEmpty &&
        event.key === " " &&
        event.currentTarget.value.length === 0
      ) {
        event.preventDefault();
        onPressSpaceWhenEmpty();
      }
    },
    [
      clearSearch,
      onPressEscape,
      onPressArrowDown,
      onPressArrowUp,
      pressEnter,
      onPressSpaceWhenEmpty
    ]
  );

  // Type anywhere to search. The store owns the "may I pull focus?" decision
  // (nothing editable focused AND this input can take focus), so an instance in
  // an inert background tab never steals the keystroke.
  React.useEffect(() => {
    if (!focusOnTyping) {
      return;
    }
    return registerTypeToFocus(inputRef, (key) => {
      setLocalSearchTerm(key);
      debouncedSetSearchTerm(key);
    });
  }, [focusOnTyping, debouncedSetSearchTerm]);

  // With focusOnTyping the old window listener also handled navigation while
  // focus sat outside the search box (e.g. on the dialog's filter bar), so the
  // model list stayed arrow-navigable. Kept as combos with allowInInputs, which
  // is the same looser gate; the field's own keys are handled above.
  React.useEffect(() => {
    if (!focusOnTyping) {
      return;
    }
    const isSelfFocused = () => document.activeElement === inputRef.current;
    const bind = (combo: string, handler: () => void) =>
      registerComboCallback(combo, {
        preventDefault: true,
        allowInInputs: true,
        target: () => inputRef.current,
        callback: () => {
          if (isSelfFocused()) {
            return;
          }
          handler();
        }
      });
    const disposers = [
      bind("escape", () => onPressEscape?.()),
      bind("arrowdown", () => onPressArrowDown?.()),
      bind("arrowup", () => onPressArrowUp?.()),
      bind("enter", pressEnter),
      bind("backspace+control", clearSearch),
      bind("backspace+meta", clearSearch),
      bind("control+delete", clearSearch),
      bind("delete+meta", clearSearch)
    ];
    return () => disposers.forEach((dispose) => dispose());
  }, [
    focusOnTyping,
    onPressEscape,
    onPressArrowDown,
    onPressArrowUp,
    pressEnter,
    clearSearch
  ]);

  React.useEffect(() => {
    setLocalSearchTerm(externalSearchTerm);
  }, [externalSearchTerm]);

  const clearHint = isMac() ? (
    <span>
      <kbd>⌘</kbd> + <kbd>⌫</kbd>
    </span>
  ) : (
    <span>
      <kbd>CTRL</kbd> + <kbd>⌫</kbd>
    </span>
  );

  return (
    <div
      className="search-input-container"
      style={{ maxWidth: maxWidth, width: typeof width === 'number' ? `${width}px` : width }}
    >
      <SearchField
        ref={inputRef}
        value={localSearchTerm}
        onChange={handleInputChange}
        onClear={clearSearch}
        onKeyDown={handleInputKeyDown}
        escapeClears={false}
        placeholder={placeholder}
        size="medium"
        fullWidth
        clearTooltip={clearHint}
        tooltipPlacement="bottom"
        clearTestId="search-clear-btn"
        inputProps={{
          id: "search-input",
          role: "searchbox",
          autoCorrect: "off",
          autoCapitalize: "none",
          spellCheck: false,
          autoComplete: "off",
          "data-testid": "search-input-field"
        }}
      />
    </div>
  );
};

export default React.memo(SearchInput);
