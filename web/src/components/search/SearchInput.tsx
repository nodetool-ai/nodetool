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
import useNodeMenuStore from "../../stores/NodeMenuStore";
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
      left: "0.8em",
      top: "50%",
      transform: "translateY(-50%)",
      color: "rgba(255, 255, 255, 0.4)",
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
      backgroundColor: "rgba(255, 255, 255, 0.05)",
      border: `1px solid rgba(255, 255, 255, 0.1)`,
      borderRadius: "10px",
      transition: "all 0.2s ease",
      boxShadow: "inset 0 1px 2px rgba(0,0,0,0.1)",
      fontSize: (theme as any).fontSizeNormal ?? undefined,
      "::placeholder": {
        color: "rgba(255, 255, 255, 0.3)"
      }
    },
    "input[type='text']:hover": {
      backgroundColor: "rgba(255, 255, 255, 0.08)",
      borderColor: "rgba(255, 255, 255, 0.2)"
    },
    "input[type='text']:focus": {
      backgroundColor: "rgba(255, 255, 255, 0.1)",
      borderColor: "var(--palette-primary-main)",
      outline: "none",
      boxShadow: `0 0 0 3px rgba(${theme.vars.palette.primary.mainChannel} / 0.15), inset 0 1px 2px rgba(0,0,0,0.1)`
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
      color: "rgba(255, 255, 255, 0.3)",
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
        color: "rgba(255, 255, 255, 0.1)"
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
  debounceTime = 30,
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

  // Counter to generate unique IDs for each search request
  // This helps prevent race conditions with debounced searches
  const searchIdCounter = useRef(0);

  const { setCurrentSearchId } = useNodeMenuStore((state) => ({
    setCurrentSearchId: state.setCurrentSearchId
  }));

  // Debounced search implementation:
  // - Waits for user to stop typing for [debounceTime] ms
  // - Cancels pending searches if user types again
  // - Assigns unique ID to each search request
  const debouncedSetSearchTerm = useDebouncedCallback((value: string) => {
    const searchId = ++searchIdCounter.current;
    setCurrentSearchId(searchId);
    onSearchChange(value);
  }, debounceTime);

  // Reset search state and cancel any pending searches
  const resetSearch = useCallback(() => {
    // Clear local input state
    setLocalSearchTerm("");

    // Reset search state
    const searchId = ++searchIdCounter.current;
    setCurrentSearchId(searchId);
    onSearchChange("");

    // Cancel any pending debounced searches
    debouncedSetSearchTerm.cancel();
  }, [debouncedSetSearchTerm, onSearchChange, setCurrentSearchId]);

  const { closeNodeMenu } = useNodeMenuStore((state) => ({
    closeNodeMenu: state.closeNodeMenu
  }));

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

      if (!shouldHandleEvent) return;

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
        if (isControlOrMetaPressed) return;
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
    closeNodeMenu,
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
