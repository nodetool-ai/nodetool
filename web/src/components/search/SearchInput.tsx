/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useCallback, useRef, useState } from "react";
import { Tooltip } from "@mui/material";
import BackspaceIcon from "@mui/icons-material/Backspace";
import SearchIcon from "@mui/icons-material/Search";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import { useDebouncedCallback } from "use-debounce";
import { NodeMetadata } from "../../stores/ApiTypes";
import { isMac } from "../../utils/platform";

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
      zIndex: 1
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
      borderRadius: "10px",
      transition: "all 0.2s ease",
      boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)",
      fontSize: (theme as any).fontSizeNormal ?? undefined,
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
      transition: "color 0.2s",
      padding: 0,
      "& svg": {
        fontSize: "1.2rem"
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
  focusSearchInput?: boolean;
  focusOnTyping?: boolean;
  placeholder?: string;
  debounceTime?: number;
  maxWidth?: string;
  searchTerm?: string;
  searchResults?: NodeMetadata[];
  width?: number;
}

const SearchInput: React.FC<SearchInputProps> = ({
  onSearchChange,
  onPressEscape,
  focusSearchInput = true,
  focusOnTyping = false,
  placeholder = "Search...",
  maxWidth = "unset",
  debounceTime = 50,
  searchTerm: externalSearchTerm = "",
  searchResults = [],
  width = 150
}) => {
  const theme = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localSearchTerm, setLocalSearchTerm] = useState(externalSearchTerm);
  const isControlOrMetaPressed = useKeyPressedStore(
    (state) => state.isKeyPressed("control") || state.isKeyPressed("meta")
  );

  // Debounced search - store handles search ID management internally
  const debouncedSetSearchTerm = useDebouncedCallback((value: string) => {
    onSearchChange(value);
  }, debounceTime);

  // Reset search state and cancel any pending searches
  const resetSearch = useCallback(() => {
    // Cancel any pending debounced searches first
    debouncedSetSearchTerm.cancel();
    // Clear local input state
    setLocalSearchTerm("");
    // Reset search in store
    onSearchChange("");
  }, [debouncedSetSearchTerm, onSearchChange]);


  // Handle input changes with debouncing
  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = event.target.value;
      // Update local state immediately for UI responsiveness
      setLocalSearchTerm(newValue);
      // Schedule debounced search
      debouncedSetSearchTerm(newValue);
    },
    [debouncedSetSearchTerm]
  );

  const clearSearch = useCallback(() => {
    resetSearch();
    inputRef.current?.focus();
  }, [resetSearch]);

  React.useEffect(() => {
    if (focusSearchInput) {
      inputRef.current?.focus();
    }
  }, [focusSearchInput]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const shouldHandleEvent =
        document.activeElement === inputRef.current ||
        (focusOnTyping &&
          !document.activeElement?.classList.contains("search-input"));

      if (!shouldHandleEvent) {return;}

      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        isControlOrMetaPressed
      ) {
        event.preventDefault();
        clearSearch();
        return;
      }

      if (event.key === "Escape") {
        onPressEscape?.();
        return;
      }

      if (focusOnTyping) {
        if (isControlOrMetaPressed) {return;}
        if (event.key.length === 1 && /[a-zA-Z0-9]/.test(event.key)) {
          if (document.activeElement !== inputRef.current) {
            event.preventDefault();
            inputRef.current?.focus();
            setLocalSearchTerm(event.key);
            debouncedSetSearchTerm(event.key);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    focusOnTyping,
    isControlOrMetaPressed,
    onPressEscape,
    debouncedSetSearchTerm,
    clearSearch,
    searchResults
  ]);

  React.useEffect(() => {
    setLocalSearchTerm(externalSearchTerm);
  }, [externalSearchTerm]);

  return (
    <div
      className="search-input-container"
      css={styles(theme)}
      style={{ maxWidth: maxWidth, width: `${width}px` }}
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
          className={`clear-search-btn ${
            localSearchTerm.trim() === "" ? "disabled" : ""
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
