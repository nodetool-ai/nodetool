/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback, useRef, useState } from "react";
import BackspaceIcon from "@mui/icons-material/Backspace";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import { useDebouncedCallback } from "use-debounce";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { NodeMetadata } from "../../stores/ApiTypes";
import { useCreateNode } from "../../hooks/useCreateNode";

const styles = (theme: any) =>
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
    ".search-box": {
      position: "relative"
    },
    ".search-input": {
      width: "100%",
      flexShrink: "0"
    },
    "input[type='text']": {
      outline: "none",
      padding: "0 2.5em 0 1em",
      margin: "0",
      height: "36px",
      WebkitAppearance: "none",
      MozAppearance: "none",
      appearance: "none",
      color: "#ffffff",
      backgroundColor: "#1a1a1a",
      border: "1px solid #404040",
      borderRadius: "5px",
      transition: "all 0.2s"
    },
    "input[type='text']:focus": {
      backgroundColor: "#2a2a2a",
      borderColor: theme.palette.c_hl1,
      outline: "none"
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
      right: "0.7em",
      border: 0,
      backgroundColor: "transparent",
      color: theme.palette.c_gray4,
      transition: "color 0.2s",
      padding: 0,
      "& svg": {
        fontSize: "1.4rem"
      },
      "&:hover": {
        backgroundColor: "transparent"
      },
      "&:not(.disabled):hover svg": {
        color: theme.palette.c_hl1,
        backgroundColor: "transparent"
      },
      "&.disabled": {
        color: theme.palette.c_gray3
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
    // Increment counter to get new unique search ID
    const searchId = ++searchIdCounter.current;
    // Update store with current search ID
    setCurrentSearchId(searchId);
    // Trigger search with new term
    onSearchChange(value);
  }, debounceTime);

  // Reset search state and cancel any pending searches
  const resetSearch = useCallback(() => {
    // Clear local input state
    setLocalSearchTerm("");
    // Generate new search ID to cancel any pending searches
    const searchId = ++searchIdCounter.current;
    setCurrentSearchId(searchId);
    // Cancel any pending debounced searches
    debouncedSetSearchTerm.cancel();
    // Trigger immediate search with empty term
    onSearchChange("");
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
  // const handleCreateNode = useCreateNode();
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

      // if (searchResults.length > 0) {
      //   switch (event.key) {
      //     case "ArrowDown":
      //       event.preventDefault();
      //       setFocusedNodeIndex(
      //         focusedNodeIndex < searchResults.length - 1
      //           ? focusedNodeIndex + 1
      //           : focusedNodeIndex
      //       );
      //       break;

      //     case "ArrowUp":
      //       event.preventDefault();
      //       setFocusedNodeIndex(
      //         focusedNodeIndex > 0 ? focusedNodeIndex - 1 : focusedNodeIndex
      //       );
      //       break;

      //     case "Enter":
      //       event.preventDefault();
      //       if (
      //         focusedNodeIndex >= 0 &&
      //         focusedNodeIndex < (searchResults?.length ?? 0)
      //       ) {
      //         handleCreateNode?.(searchResults[focusedNodeIndex]);
      //         closeNodeMenu();
      //       }
      //       break;
      //   }
      // }
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
      css={styles}
      style={{ maxWidth: maxWidth, width: `${width}px` }}
    >
      <input
        id={`search-input`}
        className="search-input"
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={localSearchTerm}
        onChange={handleInputChange}
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck="false"
        autoComplete="off"
      />

      <button
        className={`clear-search-btn ${
          localSearchTerm.trim() === "" ? "disabled" : ""
        }`}
        tabIndex={-1}
        onClick={clearSearch}
      >
        <BackspaceIcon />
      </button>
    </div>
  );
};

export default React.memo(SearchInput);
