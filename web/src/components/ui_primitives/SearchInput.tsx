/** @jsxImportSource @emotion/react */
import React, { useCallback, useRef, useState, memo, forwardRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";
import { MOTION } from "./tokens";
import { IconButton, Tooltip, InputAdornment, TextField } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

export interface SearchInputProps {
  /** Current search value */
  value: string;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Whether to show clear button */
  showClear?: boolean;
  /** Size variant */
  size?: "small" | "medium";
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
  /** Additional sx applied to the underlying TextField root. */
  sx?: SxProps<Theme>;
}

const styles = (theme: Theme) => css`
  .search-input {
    .MuiInputBase-root {
      border-radius: 8px;
      background-color: ${theme.vars.palette.action.hover};
      transition: ${MOTION.all};

      &:hover {
        background-color: ${theme.vars.palette.action.selected};
      }

      &.Mui-focused {
        background-color: ${theme.vars.palette.action.selected};
        box-shadow: 0 0 0 2px ${theme.vars.palette.primary.main}40;
      }
    }

    /* Shared form-control sizing: value at the 15px body token, placeholder
       softened to read as a muted hint rather than entered text. */
    .MuiInputBase-input {
      font-size: var(--fontSizeNormal);
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
  placeholder = "Search...",
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
  sx
}, ref) => {
  const theme = useTheme();
  const [localValue, setLocalValue] = useState(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  
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
    setLocalValue("");
    onChange("");
    onClear?.();
  }, [onChange, onClear]);
  
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && onSubmit) {
      onSubmit(localValue);
    }
    if (e.key === "Escape") {
      handleClear();
    }
  }, [localValue, onSubmit, handleClear]);
  
  // Sync local value with prop
  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);
  
  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  return (
    <div className={`search-input-wrapper nodrag ${className || ""}`} css={styles(theme)}>
      <TextField
        className="search-input"
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        size={size}
        disabled={disabled}
        autoFocus={autoFocus}
        fullWidth={fullWidth}
        sx={sx}
        inputRef={ref}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon className="search-icon" fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: showClear && localValue ? (
              <InputAdornment position="end">
                <Tooltip 
                  title={clearTooltip} 
                  enterDelay={TOOLTIP_ENTER_DELAY}
                  placement={tooltipPlacement}
                >
                  <IconButton
                    className="clear-button"
                    aria-label={clearTooltip}
                    onClick={handleClear}
                    size="small"
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </InputAdornment>
            ) : null
          }
        }}
      />
    </div>
  );
}));

SearchInput.displayName = "SearchInput";

export default SearchInput;
