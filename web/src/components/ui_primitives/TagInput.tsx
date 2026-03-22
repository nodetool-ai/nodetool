/** @jsxImportSource @emotion/react */
/**
 * TagInput Component
 *
 * A reusable input component for managing tags/chips with full keyboard support.
 * Users can add tags by typing and pressing Enter, and remove tags by clicking
 * the delete button or pressing Backspace.
 *
 * Features:
 * - Add tags via Enter key or button click
 * - Remove tags via click, Backspace/Delete keys
 * - Duplicate tag prevention
 * - Optional tag validation
 * - Full keyboard navigation
 * - Accessible with proper ARIA labels
 *
 * @example
 * <TagInput
 *   tags={tags}
 *   onTagsChange={setTags}
 *   placeholder="Add a tag..."
 *   label="Tags"
 * />
 */

import React, { memo, useCallback, useRef, useState, useEffect, KeyboardEvent } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  Chip,
  IconButton,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1),
    ".tag-input-container": {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: theme.spacing(1),
      padding: theme.spacing(1),
      minHeight: "48px",
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: theme.shape.borderRadius,
      backgroundColor: theme.vars.palette.background.paper,
      transition: "border-color 0.2s ease, box-shadow 0.2s ease",
      "&:focus-within": {
        borderColor: theme.vars.palette.primary.main,
        boxShadow: `0 0 0 2px ${theme.vars.palette.primary.main}33`,
      },
      "&:hover": {
        borderColor: theme.vars.palette.action.hover,
      },
    },
    ".tag-input-container-disabled": {
      backgroundColor: theme.vars.palette.action.disabledBackground,
      borderColor: theme.vars.palette.action.disabled,
      cursor: "not-allowed",
    },
    ".tag-input-container-error": {
      borderColor: theme.vars.palette.error.main,
      "&:focus-within": {
        boxShadow: `0 0 0 2px ${theme.vars.palette.error.main}33`,
      },
    },
    ".tag-chip": {
      transition: "all 0.2s ease",
      "&:hover": {
        transform: "scale(1.02)",
      },
    },
    ".tag-input": {
      flex: 1,
      minWidth: "120px",
      border: "none",
      outline: "none",
      background: "transparent",
      fontSize: "0.875rem",
      color: theme.vars.palette.text.primary,
      "&::placeholder": {
        color: theme.vars.palette.text.secondary,
      },
    },
    ".tag-input-disabled": {
      cursor: "not-allowed",
    },
    ".add-button": {
      flexShrink: 0,
    },
    ".helper-text": {
      fontSize: "0.75rem",
      color: theme.vars.palette.text.secondary,
      marginTop: theme.spacing(0.25),
    },
    ".helper-text-error": {
      color: theme.vars.palette.error.main,
    },
  });

export type TagValidationResult = {
  valid: boolean;
  errorMessage?: string;
};

export interface TagInputProps {
  /** Array of tag strings */
  tags: string[];
  /** Callback when tags change */
  onTagsChange: (tags: string[]) => void;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Label for the input */
  label?: string;
  /** Allow duplicate tags */
  allowDuplicates?: boolean;
  /** Maximum number of tags */
  maxTags?: number;
  /** Custom validation function */
  validateTag?: (tag: string) => TagValidationResult;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Whether the input has an error */
  error?: boolean;
  /** Helper text to display */
  helperText?: string;
  /** Size variant for chips */
  chipSize?: "small" | "medium";
  /** Custom class name */
  className?: string;
}

/**
 * A tag input component for managing tags/chips.
 *
 * Provides an intuitive interface for adding and removing tags with full
 * keyboard support and accessibility features.
 */
export const TagInput: React.FC<TagInputProps> = memo(
  function TagInput({
    tags,
    onTagsChange,
    placeholder = "Type and press Enter to add a tag...",
    label,
    allowDuplicates = false,
    maxTags,
    validateTag,
    disabled = false,
    error = false,
    helperText,
    chipSize = "small",
    className,
  }) {
    const theme = useTheme();
    const [inputValue, setInputValue] = useState("");
    const [validationError, setValidationError] = useState<string>("");
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Clear validation error when input changes
    useEffect(() => {
      if (inputValue.trim() === "") {
        setValidationError("");
      }
    }, [inputValue]);

    // Focus input on mount if not disabled
    useEffect(() => {
      if (!disabled && inputRef.current && document.activeElement === containerRef.current) {
        inputRef.current.focus();
      }
    }, [disabled]);

    const validateAndAddTag = useCallback(
      (tag: string): boolean => {
        const trimmedTag = tag.trim();

        // Empty tag check
        if (trimmedTag === "") {
          setValidationError("Tag cannot be empty");
          return false;
        }

        // Duplicate check
        if (!allowDuplicates && tags.includes(trimmedTag)) {
          setValidationError("This tag already exists");
          return false;
        }

        // Max tags check
        if (maxTags !== undefined && tags.length >= maxTags) {
          setValidationError(`Maximum ${maxTags} tags allowed`);
          return false;
        }

        // Custom validation
        if (validateTag) {
          const result = validateTag(trimmedTag);
          if (!result.valid) {
            setValidationError(result.errorMessage || "Invalid tag");
            return false;
          }
        }

        return true;
      },
      [tags, allowDuplicates, maxTags, validateTag]
    );

    const addTag = useCallback(
      (tag: string) => {
        if (disabled) {
          return;
        }

        if (validateAndAddTag(tag)) {
          const trimmedTag = tag.trim();
          onTagsChange([...tags, trimmedTag]);
          setInputValue("");
          setValidationError("");
        }
      },
      [disabled, tags, onTagsChange, validateAndAddTag]
    );

    const removeTag = useCallback(
      (indexToRemove: number) => {
        if (disabled) {
          return;
        }
        onTagsChange(tags.filter((_, index) => index !== indexToRemove));
      },
      [disabled, tags, onTagsChange]
    );

    const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(event.target.value);
    }, []);

    const handleInputKeyDown = useCallback(
      (event: KeyboardEvent<HTMLInputElement>) => {
        switch (event.key) {
          case "Enter":
            event.preventDefault();
            if (inputValue.trim()) {
              addTag(inputValue);
            }
            break;
          case "Backspace":
            if (inputValue === "" && tags.length > 0) {
              event.preventDefault();
              removeTag(tags.length - 1);
            }
            break;
          case "Escape":
            setInputValue("");
            setValidationError("");
            break;
        }
      },
      [inputValue, tags, addTag, removeTag]
    );

    const handleAddButtonClick = useCallback(() => {
      if (inputValue.trim()) {
        addTag(inputValue);
      }
    }, [inputValue, addTag]);

    const handleContainerClick = useCallback(() => {
      if (!disabled && inputRef.current) {
        inputRef.current.focus();
      }
    }, [disabled]);

    const isMaxReached = maxTags !== undefined && tags.length >= maxTags;
    const hasError = error || Boolean(validationError);
    const displayHelperText = validationError || helperText;

    return (
      <Box css={styles(theme)} className={`tag-input-root ${className || ""}`}>
        {label && (
          <Typography
            variant="body2"
            component="label"
            sx={{
              fontWeight: 500,
              color: hasError ? "error.main" : "text.primary",
            }}
          >
            {label}
          </Typography>
        )}
        <Box
          ref={containerRef}
          className={`tag-input-container ${disabled ? "tag-input-container-disabled" : ""} ${
            hasError ? "tag-input-container-error" : ""
          }`}
          onClick={handleContainerClick}
          role="combobox"
          aria-expanded={false}
          aria-haspopup="listbox"
          aria-label={label || "Tag input"}
          aria-disabled={disabled}
          aria-describedby={displayHelperText ? `${label || "tag"}-helper-text` : undefined}
        >
          {tags.map((tag, index) => (
            <Chip
              key={`${tag}-${index}`}
              label={tag}
              size={chipSize}
              onDelete={() => removeTag(index)}
              deleteIcon={<CloseIcon fontSize="small" />}
              disabled={disabled}
              className="tag-chip"
              aria-label={`Remove tag: ${tag}`}
              tabIndex={-1}
            />
          ))}
          <input
            ref={inputRef}
            type="text"
            className={`tag-input ${disabled ? "tag-input-disabled" : ""}`}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            placeholder={tags.length === 0 ? placeholder : ""}
            disabled={disabled || isMaxReached}
            aria-label="Add new tag"
            aria-invalid={hasError}
            aria-describedby={displayHelperText ? `${label || "tag"}-helper-text` : undefined}
          />
          {!disabled && !isMaxReached && inputValue.trim() && (
            <IconButton
              className="add-button"
              size="small"
              onClick={handleAddButtonClick}
              aria-label="Add tag"
              title="Add tag"
            >
              <AddIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
        {displayHelperText && (
          <Typography
            id={`${label || "tag"}-helper-text`}
            variant="caption"
            className={`helper-text ${hasError ? "helper-text-error" : ""}`}
            role="alert"
            aria-live="polite"
          >
            {displayHelperText}
          </Typography>
        )}
        {maxTags && (
          <Typography variant="caption" className="helper-text">
            {tags.length} / {maxTags} tags
          </Typography>
        )}
      </Box>
    );
  }
);

TagInput.displayName = "TagInput";

export default TagInput;
