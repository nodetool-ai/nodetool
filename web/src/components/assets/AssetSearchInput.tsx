import React, { useCallback, useEffect, useRef, useState, memo } from "react";
import Public from "@mui/icons-material/Public";
import Folder from "@mui/icons-material/Folder";
import { registerTypeToFocus } from "../../stores/KeyPressedStore";
import { useDebouncedCallback } from "../../hooks/useDebouncedCallback";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useAssetSearch } from "../../serverState/useAssetSearch";
import { SearchInput, ToolbarIconButton } from "../ui_primitives";
import { isNumber } from "../../utils/typePredicates";


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
  const inputRef = useRef<HTMLInputElement>(null);
  const [localSearchTerm, setLocalSearchTerm] = useState("");
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
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      if (value.length < 2) {
        setIsGlobalSearchActive(false);
        setGlobalSearchResults([]);
        setGlobalSearchQuery(value);
        return;
      }

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

    setLocalSearchTerm("");

    if (isGlobalSearchMode) {
      setIsGlobalSearchActive(false);
      setGlobalSearchResults([]);
      setGlobalSearchQuery("");
    } else {
      onLocalSearchChange("");
    }

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
      } catch {
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

  // Handle input changes with debouncing
  const handleInputChange = useCallback(
    (newValue: string) => {
      // Update local state immediately for UI responsiveness
      setLocalSearchTerm(newValue);
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

  // Element-scoped: clearing acts on the field the user is typing in.
  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        (event.ctrlKey || event.metaKey)
      ) {
        event.preventDefault();
        clearSearch();
      }
    },
    [clearSearch]
  );

  // Type anywhere to search. The store decides whether this input may pull
  // focus (nothing editable focused AND canTakeFocus), so a copy of this
  // component in an inert background tab never steals the keystroke.
  useEffect(() => {
    if (!focusOnTyping) {
      return;
    }
    return registerTypeToFocus(inputRef, (key) => {
      setLocalSearchTerm(key);
      debouncedSetSearchTerm(key);
    });
  }, [focusOnTyping, debouncedSetSearchTerm]);

  const effectivePlaceholder = isGlobalSearchMode
    ? "Search all assets"
    : "Search current folder";

  const toggleLabel = isGlobalSearchMode
    ? "Switch to local search"
    : "Switch to global search";

  return (
    <div
      className={`asset-search-input-container with-global-search ${
        isGlobalSearchMode ? "global-mode" : "local-mode"
      }`}
      style={{
        width: "100%",
        maxWidth: isNumber(width) ? `${width}px` : width
      }}
    >
      <SearchInput
        ref={inputRef}
        value={localSearchTerm}
        onChange={handleInputChange}
        onClear={clearSearch}
        onKeyDown={handleInputKeyDown}
        escapeClears={false}
        placeholder={effectivePlaceholder}
        fullWidth
        loading={isSearching && isGlobalSearchMode && localSearchTerm.length >= 2}
        clearTestId="asset-search-clear-btn"
        startAdornment={
          <ToolbarIconButton
            icon={isGlobalSearchMode ? <Public /> : <Folder />}
            tooltip={toggleLabel}
            aria-label={toggleLabel}
            active={isGlobalSearchMode}
            onClick={toggleSearchMode}
            data-testid="asset-search-mode-toggle"
          />
        }
        inputProps={{
          id: "asset-search-input",
          autoCorrect: "off",
          autoCapitalize: "none",
          spellCheck: false,
          autoComplete: "off",
          "data-testid": "asset-search-input-field",
          "data-search-mode": isGlobalSearchMode ? "global" : "local"
        } as React.InputHTMLAttributes<HTMLInputElement>}
      />
    </div>
  );
};

export default memo(AssetSearchInput);
