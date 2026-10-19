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
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  Chip,
  IconButton,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import AddIcon from "@mui/icons-material/AddOutlined";
import { CONTROL, MOTION } from "./tokens";
import { Tooltip } from "./Tooltip";

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
      minHeight: `${CONTROL.height.xl}px`,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: theme.shape.borderRadius,
      backgroundColor: theme.vars.palette.background.paper,
      transition: `${MOTION.border}, ${MOTION.shadow}`,
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
      transition: MOTION.all,
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
      fontSize: "var(--fontSizeNormal)",
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
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.secondary,
      marginTop: theme.spacing(0.5),
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

export const TagInput: React.FC<TagInputProps> = memo(
  function TagInput({
    tags,
    onTagsChange,
    placeholder,
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
    const { t } = useTranslation();
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

        if (trimmedTag === "") {
          setValidationError(t("i18n-next86.tagInput.errors.empty"));
          return false;
        }

        if (!allowDuplicates && tags.includes(trimmedTag)) {
          setValidationError(t("i18n-next86.tagInput.errors.duplicate"));
          return false;
        }

        if (maxTags !== undefined && tags.length >= maxTags) {
          setValidationError(t("i18n-next86.tagInput.errors.maxTags", { count: maxTags }));
          return false;
        }

        if (validateTag) {
          const result = validateTag(trimmedTag);
          if (!result.valid) {
            setValidationError(result.errorMessage || t("i18n-next86.tagInput.errors.invalid"));
            return false;
          }
        }

        return true;
      },
      [tags, allowDuplicates, maxTags, validateTag, t]
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
    const inputPlaceholder = placeholder ?? t("i18n-next86.tagInput.placeholder");

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
          aria-label={label || t("i18n-next86.tagInput.label")}
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
              aria-label={t("i18n-next86.tagInput.removeTag", { tag })}
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
            placeholder={tags.length === 0 ? inputPlaceholder : ""}
            disabled={disabled || isMaxReached}
            aria-label={t("i18n-next86.tagInput.addNewTag")}
            aria-invalid={hasError}
            aria-describedby={displayHelperText ? `${label || "tag"}-helper-text` : undefined}
          />
          {!disabled && !isMaxReached && inputValue.trim() && (
            <Tooltip title={t("i18n-next86.tagInput.addTag")}>
              <IconButton
                className="add-button"
                size="small"
                onClick={handleAddButtonClick}
                aria-label={t("i18n-next86.tagInput.addTag")}
              >
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
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
            {t("i18n-next86.tagInput.tagCount", { current: tags.length, max: maxTags })}
          </Typography>
        )}
      </Box>
    );
  }
);

TagInput.displayName = "TagInput";

export default TagInput;
