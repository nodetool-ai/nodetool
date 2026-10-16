/** @jsxImportSource @emotion/react */
import React, { useCallback, useRef, useState, memo, forwardRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";
import { CONTROL, MOTION } from "./tokens";
import { useFieldDensity } from "./fieldDensity";
import { IconButton, InputAdornment, TextField } from "@mui/material";
import { Tooltip } from "./Tooltip";
import { LoadingSpinner } from "./LoadingSpinner";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import type { InputHTMLAttributes, ReactNode } from "react";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useAutoFocusEnabled } from "../../hooks/useAutoFocusEnabled";

export interface SearchInputProps {
  /** Current search value */
  value: string;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Accessible name. Defaults to the placeholder, which is the only visible
   * hint these fields carry — without it the input is announced unnamed. */
  ariaLabel?: string;
  /** Whether to show clear button */
  showClear?: boolean;
  /** Size variant */
  size?: "small" | "medium";
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Auto-focus on mount. Ignored on touch devices, where it would raise the
   * virtual keyboard over the panel that just opened. */
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
  /** Tooltip for clear button. A string also names the button for assistive
   * tech. A node (for example a keyboard hint) falls back to "Clear search". */
  clearTooltip?: ReactNode;
  /** Replaces the leading search icon, e.g. with a mode toggle button. */
  startAdornment?: ReactNode;
  /** Shows a spinner in place of the clear button while a search runs. */
  loading?: boolean;
  /** Key handler that runs before the built-in Enter and Escape handling.
   * Calling `preventDefault()` skips the built-in handling for that key. */
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Escape clears a non-empty query and stops propagation (default). Pass
   * false when a host such as a menu owns Escape. */
  escapeClears?: boolean;
  /** Extra attributes for the native input, such as `id`, `role` or
   * `data-testid`. */
  inputProps?: InputHTMLAttributes<HTMLInputElement> & {
    "data-testid"?: string;
  };
  /** Shown at the end while the field is empty, e.g. a keyboard shortcut
   * hint. Replaced by the clear button once there is a value. */
  endHint?: ReactNode;
  /** `data-testid` for the clear button. */
  clearTestId?: string;
  /** Tooltip placement */
  tooltipPlacement?: "top" | "bottom" | "left" | "right";
  /** Additional sx applied to the underlying TextField root. */
  sx?: SxProps<Theme>;
}

const styles = (theme: Theme, dense: boolean) => css`
  .search-input {
    .MuiInputBase-root {
      border-radius: ${CONTROL.radius};
      background-color: ${theme.vars.palette.Paper.overlay};
      transition: ${MOTION.all};
      min-height: ${CONTROL.height.lg}px;

      &.MuiInputBase-sizeSmall {
        min-height: ${CONTROL.height.sm}px;
      }

      &:hover {
        background-color: ${theme.vars.palette.action.selected};
      }

      &.Mui-focused {
        background-color: ${theme.vars.palette.action.selected};
        box-shadow: 0 0 0 2px ${theme.vars.palette.primary.main}40;
      }
    }

    /* MUI's outlined vertical padding targets ~56px / 40px fields; shrink it
       so the control lands on the CONTROL token heights (36 / 28). */
    .MuiOutlinedInput-input {
      padding-top: 7px;
      padding-bottom: 7px;
    }
    .MuiInputBase-sizeSmall .MuiOutlinedInput-input {
      padding-top: 3px;
      padding-bottom: 3px;
    }

    /* Shared form-control sizing: value at the 15px body token, placeholder
       softened to read as a muted hint rather than entered text. */
    .MuiInputBase-input {
      font-size: ${dense ? "var(--fontSizeSmall)" : "var(--fontSizeNormal)"};
    }
    .MuiInputBase-input::placeholder {
      opacity: 0.6;
    }
    
    .MuiOutlinedInput-notchedOutline {
      border-color: ${theme.vars.palette.divider};
      transition: ${MOTION.border};
    }
    
    &:hover .MuiOutlinedInput-notchedOutline {
      border-color: ${theme.vars.palette.text.disabled};
    }
    
    .Mui-focused .MuiOutlinedInput-notchedOutline {
      border-color: ${theme.vars.palette.primary.main};
    }
  }
  
  .search-icon {
    color: ${theme.vars.palette.text.disabled};
  }
  
  .clear-button {
    padding: 4px;
    color: ${theme.vars.palette.text.disabled};
    transition: color ${MOTION.normal};
    
    &:hover {
      color: ${theme.vars.palette.text.primary};
      background-color: transparent;
    }
    
    &.disabled {
      visibility: hidden;
    }
  }
`;

export const SearchInput = memo(forwardRef<HTMLInputElement, SearchInputProps>(({
  value,
  onChange,
  placeholder = "Search",
  ariaLabel,
  showClear = true,
  size = "small",
  disabled = false,
  autoFocus = false,
  debounceMs = 0,
  onSubmit,
  onClear,
  className,
  fullWidth = false,
  clearTooltip = "Clear search",
  tooltipPlacement = "top",
  startAdornment,
  loading = false,
  onKeyDown,
  escapeClears = true,
  inputProps,
  endHint,
  clearTestId,
  sx
}, ref) => {
  const theme = useTheme();
  const dense = useFieldDensity() === "compact";
  const autoFocusEnabled = useAutoFocusEnabled();
  const [localValue, setLocalValue] = useState(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const setInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref]
  );
  
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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
  }, [onChange, debounceMs]);
  
  const handleClear = useCallback(() => {
    // Drop the pending debounced change, or it fires after the clear and puts
    // the query the user just wiped back into the parent.
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
    setLocalValue("");
    onChange("");
    onClear?.();
    // Keep the cursor in the field so typing can continue after a clear.
    inputRef.current?.focus();
  }, [onChange, onClear]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) {
      return;
    }
    if (e.key === "Enter" && onSubmit) {
      onSubmit(localValue);
    }
    if (escapeClears && e.key === "Escape" && localValue) {
      // Escape clears the query first; a second Escape reaches the menu or
      // dialog around us and closes it. One key press must not do both.
      e.stopPropagation();
      handleClear();
    }
  }, [localValue, onSubmit, handleClear, onKeyDown, escapeClears]);
  const clearLabel =
    typeof clearTooltip === "string" ? clearTooltip : "Clear search";
  
  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  return (
    <div className={`search-input-wrapper nodrag ${className || ""}`} css={styles(theme, dense)}>
      <TextField
        className="search-input"
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        size={size}
        disabled={disabled}
        autoFocus={autoFocus && autoFocusEnabled}
        fullWidth={fullWidth}
        sx={sx}
        inputRef={setInputRef}
        slotProps={{
          htmlInput: { "aria-label": ariaLabel ?? placeholder, ...inputProps },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                {startAdornment ?? (
                  <SearchIcon className="search-icon" fontSize="small" />
                )}
              </InputAdornment>
            ),
            endAdornment: loading ? (
              <InputAdornment position="end">
                <LoadingSpinner size="small" />
              </InputAdornment>
            ) : showClear && localValue ? (
              <InputAdornment position="end">
                <Tooltip 
                  title={clearTooltip} 
                  enterDelay={TOOLTIP_ENTER_DELAY}
                  placement={tooltipPlacement}
                >
                  <IconButton
                    className="clear-button"
                    aria-label={clearLabel}
                    data-testid={clearTestId}
                    onClick={handleClear}
                    size="small"
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </InputAdornment>
            ) : endHint ? (
              <InputAdornment position="end">{endHint}</InputAdornment>
            ) : null
          }
        }}
      />
    </div>
  );
}));

SearchInput.displayName = "SearchInput";

export default SearchInput;
