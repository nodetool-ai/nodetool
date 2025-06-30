/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback, useRef, useState } from "react";
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
      color: theme.palette.c_gray4,
      transition: "color 0.2s",
      padding: 0,
      "& svg": {
        fontSize: "1.2rem"
      },
      "&:hover": {
        backgroundColor: "transparent",
        color: theme.palette.c_hl1
      },
      "&.global-mode": {
        color: theme.palette.c_hl1
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

  const { searchAssets } = useAssetSearch();

  // Debounced search implementation for both local and global search
  const debouncedSetSearchTerm = useDebouncedCallback(async (value: string) => {
    if (isGlobalSearchMode) {
      // Handle global search
      if (value.length < 2) {
        setIsGlobalSearchActive(false);
        setGlobalSearchResults([]);
        setGlobalSearchQuery(value);
        return;
      }

      try {
        const result = await searchAssets(value);
        if (result) {
          setGlobalSearchResults(result.assets);
          setIsGlobalSearchActive(true);
          setGlobalSearchQuery(value);
        }
      } catch (error) {
        console.error("Global search error:", error);
        setIsGlobalSearchActive(false);
        setGlobalSearchResults([]);
      }
    } else {
      // Handle local search
      onLocalSearchChange(value);
    }
  }, debounceTime);

  // Reset search state and cancel any pending searches
  const resetSearch = useCallback(() => {
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
    </div>
  );
};

export default React.memo(AssetSearchInput);
