/**
 * Autocomplete Component
 *
 * A semantic wrapper around MUI Autocomplete with simplified API
 * for common search/select patterns.
 */

import React, { memo } from "react";
import {
  Autocomplete as MuiAutocomplete,
  AutocompleteProps as MuiAutocompleteProps,
  TextField,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface AutocompleteOption {
  label: string;
  value: string;
  [key: string]: unknown;
}

export interface AutocompleteProps<
  T = AutocompleteOption,
  Multiple extends boolean | undefined = false,
  FreeSolo extends boolean | undefined = false,
>
  extends Omit<
    MuiAutocompleteProps<T, Multiple, false, FreeSolo>,
    "renderInput" | "size"
  > {
  /** Placeholder text for the input */
  placeholder?: string;
  /** Label for the input */
  label?: string;
  /** Size variant */
  size?: "small" | "medium";
  /** Compact mode */
  compact?: boolean;
  /** Error state */
  error?: boolean;
  /** Helper text or error message */
  helperText?: string;
  /** Custom render input override */
  renderInput?: MuiAutocompleteProps<T, Multiple, false, FreeSolo>["renderInput"];
}

/**
 * Autocomplete - A themed autocomplete/combobox input
 *
 * @example
 * // Basic usage with options
 * <Autocomplete
 *   options={[{ label: "Option 1", value: "1" }, { label: "Option 2", value: "2" }]}
 *   placeholder="Search..."
 *   onChange={(e, value) => setValue(value)}
 * />
 *
 * @example
 * // Free-solo (allows custom input)
 * <Autocomplete
 *   freeSolo
 *   options={suggestions}
 *   label="Tags"
 *   placeholder="Add tag..."
 * />
 *
 * @example
 * // Multiple selection
 * <Autocomplete
 *   multiple
 *   options={allTags}
 *   value={selectedTags}
 *   onChange={(e, tags) => setSelectedTags(tags)}
 *   compact
 * />
 */
function AutocompleteInternal<
  T = AutocompleteOption,
  Multiple extends boolean | undefined = false,
  FreeSolo extends boolean | undefined = false,
>({
  placeholder,
  label,
  size = "medium",
  compact = false,
  error,
  helperText,
  renderInput,
  sx,
  ...props
}: AutocompleteProps<T, Multiple, FreeSolo>) {
  const theme = useTheme();

  const effectiveSize = compact ? "small" : size;

  const defaultRenderInput: MuiAutocompleteProps<T, Multiple, false, FreeSolo>["renderInput"] =
    (params) => (
      <TextField
        {...params}
        label={label}
        placeholder={placeholder}
        size={effectiveSize}
        error={error}
        helperText={helperText}
        sx={{
          ...(compact && {
            "& .MuiInputBase-input": {
              fontSize: theme.fontSizeSmall || "0.875rem",
            },
          }),
        }}
      />
    );

  return (
    <MuiAutocomplete
      size={effectiveSize}
      renderInput={renderInput || defaultRenderInput}
      sx={sx}
      {...props}
    />
  );
}

export const Autocomplete = memo(AutocompleteInternal) as typeof AutocompleteInternal;
