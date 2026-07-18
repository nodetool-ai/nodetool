/**
 * Autocomplete Component
 *
 * A semantic wrapper around MUI Autocomplete with simplified API
 * for common search/select patterns.
 */

import React, { memo, useId } from "react";
import {
  Autocomplete as MuiAutocomplete,
  AutocompleteProps as MuiAutocompleteProps,
  Box,
  TextField,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Label } from "./Label";

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
  id,
  ...props
}: AutocompleteProps<T, Multiple, FreeSolo>) {
  const theme = useTheme();
  const reactId = useId();
  // MUI Autocomplete owns its input's id (via params.inputProps), so the
  // label must target the Autocomplete id, not a TextField override.
  const fieldId = id ?? reactId;

  const effectiveSize = compact ? "small" : size;

  const defaultRenderInput: MuiAutocompleteProps<T, Multiple, false, FreeSolo>["renderInput"] =
    (params) => (
      <TextField
        {...params}
        placeholder={placeholder}
        size={effectiveSize}
        error={error}
        helperText={helperText}
        sx={{
          // Same form-control sizing as TextInput/SelectField: the value renders
          // at the body token (15px) regardless of `compact` — compact only
          // tightens height (via size="small"), never shrinks the text.
          "& .MuiInputBase-input": {
            fontSize: theme.fontSizeNormal || "15px",
          },
          // The native placeholder should read as a muted hint, not entered text.
          "& .MuiInputBase-input::placeholder": {
            opacity: 0.6,
          },
        }}
      />
    );

  return (
    // Block wrapper, never a fragment: the label above and the combobox must
    // stay one flex child at call sites.
    <Box sx={{ display: "block" }}>
      {label && (
        <Label htmlFor={fieldId} error={error}>
          {label}
        </Label>
      )}
      <MuiAutocomplete
        id={fieldId}
        size={effectiveSize}
        renderInput={renderInput || defaultRenderInput}
        sx={sx}
        {...props}
      />
    </Box>
  );
}

export const Autocomplete = memo(AutocompleteInternal) as typeof AutocompleteInternal;
