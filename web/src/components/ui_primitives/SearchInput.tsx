/** @jsxImportSource @emotion/react */
import React, { useCallback, useRef, useState, memo, ReactNode } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { Tooltip } from "./Tooltip";

export interface SearchInputProps {
  /** Current search value (optional – manages internal state when not provided) */
  value?: string;
  /** Callback when value changes (after optional debounce) */
  onChange: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Whether to show clear button */
  showClear?: boolean;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Auto-focus on mount */
  autoFocus?: boolean;
  /** Debounce delay in ms (0 = no debounce) */
  debounceMs?: number;
  /** Callback when Enter is pressed */
  onSubmit?: (value: string) => void;
  /** Callback when clear button is clicked */
  onClear?: () => void;
  /** Additional className */
  className?: string;
  /** Full width */
  fullWidth?: boolean;
  /** Tooltip for clear button */
  clearTooltip?: string;
  /** Tooltip placement */
  tooltipPlacement?: "top" | "bottom" | "left" | "right";
  /** Custom start node – replaces the default search icon */
  startNode?: ReactNode;
  /** Show loading spinner in end position instead of clear button */
  isLoading?: boolean;
  /** data-testid forwarded to the inner <input> element */
  inputTestId?: string;
  /** Ref forwarded to the inner <input> element */
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** Callback when Escape is pressed */
  onPressEscape?: () => void;
}

const styles = (theme: Theme) => css`
  display: flex;
  position: relative;
  flex-direction: row;
  align-items: center;
  margin: 0;
  padding: 0;
  overflow: hidden;

  .search-start {
    position: absolute;
    left: 0.5em;
    top: 50%;
    transform: translateY(-50%);
    color: ${theme.vars.palette.text.disabled};
    pointer-events: none;
    z-index: 1;
    display: flex;
    align-items: center;
    font-size: 1.1rem;

    svg {
      font-size: inherit;
    }
  }

  input[type="text"] {
    width: 100%;
    outline: none;
    padding: 0 2.4em 0 2.6em;
    margin: 0;
    height: 36px;
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    color: ${theme.vars.palette.text.primary};
    background-color: ${theme.vars.palette.action.hover};
    border: 1px solid ${theme.vars.palette.divider};
    border-radius: 10px;
    transition: background-color 0.2s ease, border-color 0.2s ease,
      box-shadow 0.2s ease;
    font-size: ${theme.fontSizeNormal};
    box-sizing: border-box;

    &::placeholder {
      color: ${theme.vars.palette.text.disabled};
    }

    &:hover {
      background-color: ${theme.vars.palette.action.selected};
      border-color: ${theme.vars.palette.text.disabled};
    }

    &:focus {
      background-color: ${theme.vars.palette.action.selected};
      border-color: var(--palette-primary-main);
      box-shadow: 0 0 0 2px
        rgba(${theme.vars.palette.primary.mainChannel} / 0.15);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .search-end {
    position: absolute;
    right: 0.4em;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .clear-btn {
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.6em;
    height: 1.6em;
    border: 0;
    border-radius: 4px;
    background-color: transparent;
    color: ${theme.vars.palette.text.disabled};
    transition: color 0.2s, background-color 0.2s;
    padding: 0;

    svg {
      font-size: 1rem;
    }

    &:hover {
      color: ${theme.vars.palette.text.primary};
      background-color: ${theme.vars.palette.action.hover};
    }

    &.hidden {
      visibility: hidden;
      pointer-events: none;
    }
  }

  .search-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid ${theme.vars.palette.grey[500]};
    border-top-color: ${theme.vars.palette.grey[100]};
    border-radius: 50%;
    animation: search-input-spin 0.8s linear infinite;
  }

  @keyframes search-input-spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

export const SearchInput: React.FC<SearchInputProps> = memo(
  ({
    value = "",
    onChange,
    placeholder = "Search...",
    showClear = true,
    disabled = false,
    autoFocus = false,
    debounceMs = 0,
    onSubmit,
    onClear,
    className,
    fullWidth = false,
    clearTooltip = "Clear search",
    tooltipPlacement = "top",
    startNode,
    isLoading = false,
    inputTestId,
    inputRef: externalInputRef,
    onPressEscape
  }) => {
    const theme = useTheme();
    const [localValue, setLocalValue] = useState(value);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
      undefined
    );
    const internalInputRef = useRef<HTMLInputElement>(null);
    const resolvedInputRef =
      externalInputRef ?? (internalInputRef as React.RefObject<HTMLInputElement | null>);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setLocalValue(newValue);

        if (debounceMs > 0) {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          timeoutRef.current = setTimeout(() => {
            onChange(newValue);
          }, debounceMs);
        } else {
          onChange(newValue);
        }
      },
      [onChange, debounceMs]
    );

    const handleClear = useCallback(() => {
      setLocalValue("");
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      onChange("");
      onClear?.();
    }, [onChange, onClear]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && onSubmit) {
          onSubmit(localValue);
        }
        if (e.key === "Escape") {
          if (onPressEscape) {
            onPressEscape();
          } else {
            handleClear();
          }
        }
      },
      [localValue, onSubmit, handleClear, onPressEscape]
    );

    // Sync local value when controlled value prop changes
    React.useEffect(() => {
      setLocalValue(value);
    }, [value]);

    // Cleanup debounce timer on unmount
    React.useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, []);

    const showClearButton = showClear && !isLoading && localValue.length > 0;

    return (
      <div
        className={`search-input-wrapper nodrag${className ? ` ${className}` : ""}`}
        css={styles(theme)}
        style={fullWidth ? { width: "100%" } : undefined}
      >
        <span
          className="search-start"
          aria-hidden={!startNode}
          style={startNode ? { pointerEvents: "auto" } : undefined}
        >
          {startNode ?? <SearchIcon />}
        </span>

        <input
          ref={resolvedInputRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={localValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          autoComplete="off"
          data-testid={inputTestId}
        />

        <span className="search-end">
          {isLoading ? (
            <span className="search-spinner" aria-hidden="true" />
          ) : (
            <Tooltip
              title={clearTooltip}
              enterDelay={TOOLTIP_ENTER_DELAY}
              placement={tooltipPlacement}
            >
              <button
                type="button"
                className={`clear-btn${showClearButton ? "" : " hidden"}`}
                aria-label={clearTooltip}
                tabIndex={-1}
                onClick={handleClear}
              >
                <ClearIcon />
              </button>
            </Tooltip>
          )}
        </span>
      </div>
    );
  }
);

SearchInput.displayName = "SearchInput";

export default SearchInput;
