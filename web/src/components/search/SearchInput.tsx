/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import BackspaceIcon from "@mui/icons-material/Backspace";
import useKeyPressedListener from "../../utils/KeyPressedListener";
import { useHotkeys } from "react-hotkeys-hook";
import { debounce } from "lodash";

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
      height: "2em",
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
      borderRadius: "0px",
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
      right: ".5em",
      padding: "0.2em 0.1em 0.2em 0.1em",
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
  onSearchClear?: () => void;
  focusSearchInput?: boolean;
  focusOnTyping?: boolean;
  debounceTime?: number;
  placeholder?: string;
  focusOnEscapeKey?: boolean;
  maxWidth?: string;
}

const SearchInput: React.FC<SearchInputProps> = ({
  onSearchChange,
  onSearchClear = () => {},
  focusSearchInput = true,
  focusOnTyping = false,
  focusOnEscapeKey = true,
  debounceTime = 0,
  placeholder = "Search...",
  maxWidth = "unset"
}) => {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const controlKeyPressed = useKeyPressedListener("Control");

  const setSearchFocused = () => {
    inputRef.current?.focus();
  };

  const debouncedSearchChange = useRef(
    debounce((nextValue: string) => {
      onSearchChange(nextValue);
    }, debounceTime)
  );

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setValue(nextValue);
    debouncedSearchChange.current(nextValue);
  };

  const clearSearch = () => {
    setValue("");
    onSearchChange("");
    onSearchClear();
    setSearchFocused();
  };

  const clearSearchOnEscape = () => {
    if (focusOnEscapeKey || document.activeElement === inputRef.current) {
      setValue("");
      onSearchChange("");
      onSearchClear();
      setSearchFocused();
    }
  };

  useHotkeys("Escape", clearSearchOnEscape);

  // focus on mount
  useLayoutEffect(() => {
    if (focusSearchInput && inputRef.current) {
      if (inputRef.current) {
        inputRef.current?.focus();
      }
      setValue("");
    }
  }, [focusSearchInput]);

  // focus on keydown
  useEffect(() => {
    if (focusOnTyping) {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (controlKeyPressed) return;
        if (event.key.length === 1 && /[a-zA-Z0-9]/.test(event.key)) {
          if (document.activeElement !== inputRef.current) {
            event.preventDefault();
            inputRef.current?.focus();
            const newSearchTerm = event.key;
            if (
              inputRef.current &&
              document.activeElement !== inputRef.current
            ) {
              inputRef.current.value = newSearchTerm;
            }
            setValue(newSearchTerm);
          }
        }
      };

      window.addEventListener("keydown", handleKeyDown);

      return () => {
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [focusOnTyping, controlKeyPressed]);

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
        value={value}
        onChange={handleInputChange}
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck="false"
        autoComplete="off"
      />

      <button
        className={`clear-search-btn ${value.trim() === "" ? "disabled" : ""}`}
        onClick={clearSearch}
      >
        <BackspaceIcon />
      </button>
    </div>
  );
};

export default SearchInput;
