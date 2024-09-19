/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback, useRef, useState } from "react";
import BackspaceIcon from "@mui/icons-material/Backspace";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import { useDebouncedCallback } from "use-debounce";

const styles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      position: "relative",
      flexDirection: "row",
      alignItems: "center",
      gap: "0.1em",
      width: "200px",
      margin: "0",
      padding: 0,
      overflow: "hidden"
    },
    ".search-box": {
      position: "relative"
    },
    ".search-input": {
      width: "100%",
      height: "25px",
      flexShrink: "0"
    },
    "input[type='text']": {
      outline: "none",
      padding: ".5em",
      margin: "0",
      WebkitAppearance: "none",
      MozAppearance: "none",
      appearance: "none",
      color: "#ddd",
      backgroundColor: "#313131",
      border: "none",
      borderRadius: "5px",
      transition: "background-color 0.2s"
    },
    "input[type='text']:focus": {
      backgroundColor: theme.palette.c_gray1,
      outline: "none"
    },
    ".clear-search-btn": {
      position: "absolute",
      cursor: "pointer",
      width: "2em",
      top: 0,
      right: "0.2em",
      padding: "0.1em 0em 0.2em 0.1em",
      border: 0,
      backgroundColor: "transparent",
      color: theme.palette.c_gray4,
      transition: "color 0.2s",
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
  setSelectedPath?: (path: string[]) => void;
}

const SearchInput: React.FC<SearchInputProps> = ({
  onSearchChange,
  onPressEscape,
  focusSearchInput = true,
  focusOnTyping = false,
  placeholder = "Search...",
  maxWidth = "unset",
  debounceTime = 300,
  searchTerm: externalSearchTerm = "",
  setSelectedPath = (path: string[]) => {}
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localSearchTerm, setLocalSearchTerm] = useState(externalSearchTerm);
  const isControlOrMetaPressed = useKeyPressedStore(
    (state) => state.isKeyPressed("control") || state.isKeyPressed("meta")
  );

  const debouncedSetSearchTerm = useDebouncedCallback((value: string) => {
    onSearchChange(value);
  }, debounceTime);

  const resetSearch = useCallback(() => {
    setLocalSearchTerm("");
    debouncedSetSearchTerm("");
    setSelectedPath([]);
    onSearchChange("");
  }, [debouncedSetSearchTerm, setSelectedPath, onSearchChange]);

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = event.target.value;
      setLocalSearchTerm(newValue);
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
    clearSearch
  ]);

  return (
    <div
      className="search-input-container"
      css={styles}
      style={{ maxWidth: maxWidth }}
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
        onClick={clearSearch}
      >
        <BackspaceIcon />
      </button>
    </div>
  );
};

export default React.memo(SearchInput);
