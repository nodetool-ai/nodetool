/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback, useEffect, useRef, useState, memo } from "react";
import { Public as GlobalIcon, Folder as LocalIcon } from "@mui/icons-material";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import { useDebouncedCallback } from "use-debounce";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useAssetSearch } from "../../serverState/useAssetSearch";
import { SearchInput, Tooltip } from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import log from "loglevel";

const styles = (theme: Theme) =>
  css({
    "&": {
      width: "100%",
      display: "flex",
      position: "relative",
      flexDirection: "row",
      alignItems: "center",
      margin: "0",
      padding: 0,
      overflow: "hidden"
    },
    ".search-mode-toggle": {
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      border: 0,
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[400],
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
  onLocalSearchChange: (_value: string) => void;
  focusSearchInput?: boolean;
  focusOnTyping?: boolean;
  debounceTime?: number;
  // Acts as a max width. The input will always try to take 100% width of its
  // container up to this value. Accepts number (px) or any CSS width string.
  width?: number | string;
}

const AssetSearchInput: React.FC<AssetSearchInputProps> = ({
  onLocalSearchChange,
  focusSearchInput = false,
  focusOnTyping = false,
  debounceTime = 500,
  width
}) => {
  const theme = useTheme();
  const inputRef = useRef<HTMLInputElement | null>(null);
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
          log.error("Global search error:", error);
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

  // Toggle between local and global search modes without clearing the input
  const toggleSearchMode = useCallback(async () => {
    const newMode = !isGlobalSearchMode;
    setIsGlobalSearchMode(newMode);

    if (newMode) {
      // Switching to global: run global search with current term
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (localSearchTerm.length < 2) {
        setIsGlobalSearchActive(false);
        setGlobalSearchResults([]);
        setGlobalSearchQuery(localSearchTerm);
        return;
      }
      const ac = new AbortController();
      abortControllerRef.current = ac;
      try {
        const result = await searchAssets(
          localSearchTerm,
          undefined,
          100,
          undefined,
          ac.signal
        );
        if (!ac.signal.aborted && result) {
          setGlobalSearchResults(result.assets);
          setIsGlobalSearchActive(true);
          setGlobalSearchQuery(localSearchTerm);
        }
      } catch (_error) {
        if (!ac.signal.aborted) {
          setIsGlobalSearchActive(false);
          setGlobalSearchResults([]);
        }
      }
    } else {
      // Switching to local: apply filter with current term
      onLocalSearchChange(localSearchTerm);
    }
  }, [
    isGlobalSearchMode,
    setIsGlobalSearchMode,
    localSearchTerm,
    searchAssets,
    setIsGlobalSearchActive,
    setGlobalSearchResults,
    setGlobalSearchQuery,
    onLocalSearchChange
  ]);

  const handleSearchChange = useCallback(
    (value: string) => {
      setLocalSearchTerm(value);
      debouncedSetSearchTerm(value);
    },
    [debouncedSetSearchTerm]
  );

  const clearSearch = useCallback(() => {
    setLocalSearchTerm("");
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

      if (!shouldHandleEvent) { return; }

      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        isControlOrMetaPressed
      ) {
        event.preventDefault();
        clearSearch();
        return;
      }

      if (focusOnTyping) {
        if (isControlOrMetaPressed) { return; }
        if (event.key.length === 1 && /[a-zA-Z0-9]/.test(event.key)) {
          if (document.activeElement !== inputRef.current) {
            event.preventDefault();
            inputRef.current?.focus();
            handleSearchChange(event.key);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    focusOnTyping,
    isControlOrMetaPressed,
    clearSearch,
    handleSearchChange
  ]);

  // Dynamic placeholder based on search mode
  const effectivePlaceholder = isGlobalSearchMode
    ? "Search all assets..."
    : "Search current folder...";

  const showSpinner =
    isSearching && isGlobalSearchMode && localSearchTerm.length >= 2;

  const modeToggleNode = (
    <Tooltip
      title={
        isGlobalSearchMode
          ? "Switch to local search"
          : "Switch to global search"
      }
    >
      <button
        className={`search-mode-toggle ${isGlobalSearchMode ? "global-mode" : ""}`}
        onClick={toggleSearchMode}
        data-testid="asset-search-mode-toggle"
        tabIndex={-1}
      >
        {isGlobalSearchMode ? <GlobalIcon /> : <LocalIcon />}
      </button>
    </Tooltip>
  );

  return (
    <div
      className={`asset-search-input-container with-global-search ${
        isGlobalSearchMode ? "global-mode" : "local-mode"
      }`}
      css={styles(theme)}
      style={{
        width: "100%",
        maxWidth:
          typeof width === "number"
            ? `${width}px`
            : (width as string | undefined)
      }}
    >
      <SearchInput
        value={localSearchTerm}
        onChange={handleSearchChange}
        onClear={clearSearch}
        placeholder={effectivePlaceholder}
        showClear={!showSpinner}
        startNode={modeToggleNode}
        isLoading={showSpinner}
        fullWidth
        debounceMs={0}
        inputTestId="asset-search-input-field"
        inputRef={inputRef}
      />
    </div>
  );
};

export default memo(AssetSearchInput);
