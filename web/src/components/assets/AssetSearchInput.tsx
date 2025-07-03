/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback, useEffect, useRef, useState, memo } from "react";
import BackspaceIcon from "@mui/icons-material/Backspace";
import { Public as GlobalIcon, Folder as LocalIcon } from "@mui/icons-material";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import { useDebouncedCallback } from "use-debounce";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useAssetSearch } from "../../serverState/useAssetSearch";
import { Tooltip } from "@mui/material";

const styles = (theme: any) =>
  css({
    "&": {
      width: "100%",
      display: "flex",
      position: "relative",
      flexDirection: "row",
      alignItems: "center",
      gap: "0.1em",
      margin: "0",
      padding: 0,
      overflow: "hidden"
    },
    ".search-box": {
      border: 0,
      position: "relative"
    },
    ".search-input": {
      width: "100%",
      flexShrink: "0"
    },
    "input[type='text']": {
      border: 0,
      outline: "none",
      padding: "0 2.5em 0 3em",
      margin: "0",
      height: "36px",
      WebkitAppearance: "none",
      MozAppearance: "none",
      appearance: "none",
      color: "#ffffff",
      backgroundColor: "#1a1a1a",
      borderRadius: "5px",
      transition: "all 0.2s"
    },
    "input[type='text']:focus": {
      backgroundColor: "#2a2a2a",
      borderColor: "var(--palette-primary-main)",
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
      color: theme.palette.grey[400],
      transition: "color 0.2s",
      padding: 0,
      "& svg": {
        fontSize: "1.4rem"
      },
      "&:hover": {
        backgroundColor: "transparent"
      },
      "&:not(.disabled):hover svg": {
        color: "var(--palette-primary-main)",
        backgroundColor: "transparent"
      },
      "&.disabled": {
        color: theme.palette.grey[500]
      }
    },
    ".search-loading-indicator": {
      position: "absolute",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "2em",
      height: "100%",
      top: 0,
      right: "0.7em",
      padding: 0
    },
    ".search-spinner": {
      width: "16px",
      height: "16px",
      border: "2px solid var(--palette-grey-500)",
      borderTop: "2px solid var(--palette-grey-100)",
      borderRadius: "50%",
      animation: "spin 1s linear infinite"
    },
    "@keyframes spin": {
      "0%": { transform: "rotate(0deg)" },
      "100%": { transform: "rotate(360deg)" }
    },
    ".search-mode-toggle": {
      position: "absolute",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "2em",
      height: "100%",
      top: 0,
      left: "0.5em",
      border: 0,
      backgroundColor: "transparent",
      color: theme.palette.grey[400],
      transition: "color 0.2s",
      padding: 0,
      "& svg": {
        fontSize: "1.2rem"
      },
      "&:hover": {
        backgroundColor: "transparent",
        color: "var(--palette-primary-main)"
      },
      "&.global-mode": {
        color: "var(--palette-primary-main)"
      }
    }
  });

interface AssetSearchInputProps {
  onLocalSearchChange: (value: string) => void;
  focusSearchInput?: boolean;
  focusOnTyping?: boolean;
  debounceTime?: number;
  width?: number;
}

const AssetSearchInput: React.FC<AssetSearchInputProps> = ({
  onLocalSearchChange,
  focusSearchInput = false,
  focusOnTyping = false,
  debounceTime = 500,
  width = 150
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localSearchTerm, setLocalSearchTerm] = useState("");
  const isControlOrMetaPressed = useKeyPressedStore(
    (state) => state.isKeyPressed("control") || state.isKeyPressed("meta")
  );

  // Global search state and hooks
  const isGlobalSearchMode = useAssetGridStore(
    (state) => state.isGlobalSearchMode
  );
  const setIsGlobalSearchMode = useAssetGridStore(
    (state) => state.setIsGlobalSearchMode
  );
  const setGlobalSearchResults = useAssetGridStore(
    (state) => state.setGlobalSearchResults
  );
  const setIsGlobalSearchActive = useAssetGridStore(
    (state) => state.setIsGlobalSearchActive
  );
  const setGlobalSearchQuery = useAssetGridStore(
    (state) => state.setGlobalSearchQuery
  );

  const { searchAssets, isSearching } = useAssetSearch();

  // Keep track of current search abort controller
  const abortControllerRef = useRef<AbortController | null>(null);

  // Debounced search implementation for both local and global search
  const debouncedSetSearchTerm = useDebouncedCallback(async (value: string) => {
    if (isGlobalSearchMode) {
      // Cancel any previous search
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Handle global search
      if (value.length < 2) {
        setIsGlobalSearchActive(false);
        setGlobalSearchResults([]);
        setGlobalSearchQuery(value);
        return;
      }

      // Create new abort controller for this search
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const result = await searchAssets(
          value,
          undefined,
          100,
          undefined,
          abortController.signal
        );

        // Only update state if this search wasn't aborted
        if (!abortController.signal.aborted && result) {
          setGlobalSearchResults(result.assets);
          setIsGlobalSearchActive(true);
          setGlobalSearchQuery(value);
        }
      } catch (error) {
        // Don't log errors for aborted requests
        if (!abortController.signal.aborted) {
          console.error("Global search error:", error);
          setIsGlobalSearchActive(false);
          setGlobalSearchResults([]);
        }
      }
    } else {
      // Handle local search
      onLocalSearchChange(value);
    }
  }, debounceTime);

  // Reset search state and cancel any pending searches
  const resetSearch = useCallback(() => {
    // Cancel any in-flight API requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Clear local input state
    setLocalSearchTerm("");

    if (isGlobalSearchMode) {
      // Reset global search state
      setIsGlobalSearchActive(false);
      setGlobalSearchResults([]);
      setGlobalSearchQuery("");
    } else {
      // Reset local search state
      onLocalSearchChange("");
    }

    // Cancel any pending debounced searches
    debouncedSetSearchTerm.cancel();
  }, [
    debouncedSetSearchTerm,
    onLocalSearchChange,
    isGlobalSearchMode,
    setIsGlobalSearchActive,
    setGlobalSearchResults,
    setGlobalSearchQuery
  ]);

  // Toggle between local and global search modes
  const toggleSearchMode = useCallback(() => {
    const newMode = !isGlobalSearchMode;
    setIsGlobalSearchMode(newMode);

    // Reset search when switching modes
    resetSearch();
  }, [isGlobalSearchMode, setIsGlobalSearchMode, resetSearch]);

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

  useEffect(() => {
    if (focusSearchInput) {
      inputRef.current?.focus();
    }
  }, [focusSearchInput]);

  // Cleanup: cancel any pending requests when component unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
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
    debouncedSetSearchTerm,
    clearSearch
  ]);

  // Dynamic placeholder based on search mode
  const effectivePlaceholder = isGlobalSearchMode
    ? "Search all assets..."
    : "Search current folder...";

  return (
    <div
      className={`asset-search-input-container with-global-search ${
        isGlobalSearchMode ? "global-mode" : "local-mode"
      }`}
      css={styles}
      style={{ width: `${width}px` }}
    >
      <Tooltip
        title={
          isGlobalSearchMode
            ? "Switch to local search"
            : "Switch to global search"
        }
      >
        <button
          className={`search-mode-toggle ${
            isGlobalSearchMode ? "global-mode" : ""
          }`}
          onClick={toggleSearchMode}
          data-testid="asset-search-mode-toggle"
          tabIndex={-1}
        >
          {isGlobalSearchMode ? <GlobalIcon /> : <LocalIcon />}
        </button>
      </Tooltip>

      <input
        id="asset-search-input"
        className="search-input"
        ref={inputRef}
        type="text"
        placeholder={effectivePlaceholder}
        value={localSearchTerm}
        onChange={handleInputChange}
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck="false"
        autoComplete="off"
        data-testid="asset-search-input-field"
        data-search-mode={isGlobalSearchMode ? "global" : "local"}
      />

      {isSearching && isGlobalSearchMode && localSearchTerm.length >= 2 ? (
        <div className="search-loading-indicator">
          <div className="search-spinner"></div>
        </div>
      ) : (
        <button
          className={`clear-search-btn ${
            localSearchTerm.trim() === "" ? "disabled" : ""
          }`}
          tabIndex={-1}
          onClick={clearSearch}
          data-testid="asset-search-clear-btn"
        >
          <BackspaceIcon />
        </button>
      )}
    </div>
  );
};

export default memo(AssetSearchInput);
