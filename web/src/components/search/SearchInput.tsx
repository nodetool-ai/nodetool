/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useCallback, useRef, useState } from "react";
import { MOTION, Tooltip, BORDER_RADIUS, Z_INDEX } from "../ui_primitives";
import BackspaceIcon from "@mui/icons-material/Backspace";
import SearchIcon from "@mui/icons-material/Search";
import {
  registerComboCallback,
  registerTypeToFocus
} from "../../stores/KeyPressedStore";
import { useDebouncedCallback } from "../../hooks/useDebouncedCallback";
import { isMac } from "../../utils/platform";
import { useAutoFocusEnabled } from "../../hooks/useAutoFocusEnabled";
import type { NodeMetadata } from "../../stores/ApiTypes";

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      position: "relative",
      flexDirection: "row",
      alignItems: "center",
      gap: "0.1em",
      margin: "0",
      minWidth: "8em",
      padding: 0,
      overflow: "hidden"
    },
    ".search-icon": {
      position: "absolute",
      left: "0.4em",
      top: "50%",
      transform: "translateY(-50%)",
      color: theme.vars.palette.text.disabled,
      pointerEvents: "none",
      zIndex: Z_INDEX.raised
    },
    ".search-box": {
      position: "relative"
    },
    ".search-input": {
      width: "100%",
      flexShrink: "0"
    },
    "input[type='text']": {
      outline: "none",
      padding: "0 2.5em 0 2.8em",
      margin: "0",
      height: "36px",
      WebkitAppearance: "none",
      MozAppearance: "none",
      appearance: "none",
      color: theme.vars.palette.text.primary,
      backgroundColor: theme.vars.palette.action.hover,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.lg,
      transition: MOTION.all,
      boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)",
      fontSize: theme.fontSizeNormal,
      "::placeholder": {
        color: theme.vars.palette.text.disabled
      }
    },
    "input[type='text']:hover": {
      backgroundColor: theme.vars.palette.action.selected,
      borderColor: theme.vars.palette.text.disabled
    },
    "input[type='text']:focus": {
      backgroundColor: theme.vars.palette.action.selected,
      borderColor: "var(--palette-primary-main)",
      outline: "none",
      boxShadow: `0 0 0 3px rgba(${theme.vars.palette.primary.mainChannel} / 0.15), inset 0 1px 2px rgba(0,0,0,0.05)`
    },
    // Keyboard focus gets a solid ring on top of the soft :focus glow; inset
    // offset avoids clipping by the container's overflow: hidden.
    "input[type='text']:focus-visible": {
      outline: "2px solid var(--palette-primary-main)",
      outlineOffset: "-2px"
    },
    ".clear-search-btn": {
      position: "absolute",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "2em",
      height: "100%",
      top: 0,
      right: "0.5em",
      border: 0,
      backgroundColor: "transparent",
      color: theme.vars.palette.text.disabled,
      transition: `color ${MOTION.normal}`,
      padding: 0,
      "& svg": {
        fontSize: "var(--fontSizeBig)"
      },
      "&:hover": {
        backgroundColor: "transparent"
      },
      "&:not(.disabled):hover svg": {
        color: "var(--palette-primary-main)",
        backgroundColor: "transparent"
      },
      "&.disabled": {
        color: theme.vars.palette.action.disabled
      }
    }
  });

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
  placeholder = "Search...",
  maxWidth = "unset",
  debounceTime = 50,
  searchTerm: externalSearchTerm = "",
  width = 150
}) => {
  const theme = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const autoFocusEnabled = useAutoFocusEnabled();
  const [localSearchTerm, setLocalSearchTerm] = useState(externalSearchTerm);

  // Debounced search - store handles search ID management internally
  const debouncedSetSearchTerm = useDebouncedCallback((value: string) => {
    onSearchChange(value);
  }, debounceTime);

  const resetSearch = useCallback(() => {
    debouncedSetSearchTerm.cancel();
    setLocalSearchTerm("");
    onSearchChange("");
  }, [debouncedSetSearchTerm, onSearchChange]);

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = event.target.value;
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
        onPressEnter?.();
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
      onPressEnter,
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
      bind("enter", () => onPressEnter?.()),
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
    onPressEnter,
    clearSearch
  ]);

  React.useEffect(() => {
    setLocalSearchTerm(externalSearchTerm);
  }, [externalSearchTerm]);

  return (
    <div
      className="search-input-container"
      css={styles(theme)}
      style={{ maxWidth: maxWidth, width: typeof width === 'number' ? `${width}px` : width }}
    >
      <SearchIcon className="search-icon" />
      <input
        id="search-input"
        className="search-input"
        ref={inputRef}
        type="text"
        role="searchbox"
        aria-label={placeholder}
        placeholder={placeholder}
        value={localSearchTerm}
        onChange={handleInputChange}
        onKeyDown={handleInputKeyDown}
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck="false"
        autoComplete="off"
        data-testid="search-input-field"
      />

      <Tooltip
        placement="bottom"
        title={
          isMac() ? (
            <span>
              <kbd>⌘</kbd> + <kbd>⌫</kbd>
            </span>
          ) : (
            <span>
              <kbd>CTRL</kbd> + <kbd>⌫</kbd>
            </span>
          )
        }
      >
        <button
          type="button"
          className={`clear-search-btn ${localSearchTerm.trim() === "" ? "disabled" : ""
            }`}
          tabIndex={-1}
          aria-label="Clear search"
          onClick={clearSearch}
          data-testid="search-clear-btn"
        >
          <BackspaceIcon />
        </button>
      </Tooltip>
    </div>
  );
};

export default React.memo(SearchInput);
