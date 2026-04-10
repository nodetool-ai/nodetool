/**
 * AutocompleteTagInput Component
 *
 * A tag input with autocomplete suggestions, wrapping MUI Autocomplete.
 * Users can select from suggestions or type custom tags (freeSolo).
 *
 * @example
 * <AutocompleteTagInput
 *   label="Tags"
 *   value={tags}
 *   onChange={setTags}
 *   suggestions={["image", "audio", "video"]}
 * />
 *
 * @example
 * <AutocompleteTagInput
 *   label="Categories"
 *   value={categories}
 *   onChange={setCategories}
 *   suggestions={allCategories}
 *   placeholder="Add category..."
 *   description="Select or type custom categories"
 * />
 */

import React, { memo, useCallback } from "react";
import {
  Autocomplete,
  TextField,
  createFilterOptions
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface AutocompleteTagInputProps {
  /** Label for the input */
  label: string;
  /** Current selected tags */
  value: string[];
  /** Called when tags change */
  onChange: (tags: string[]) => void;
  /** Suggested tag options */
  suggestions?: string[];
  /** Placeholder text */
  placeholder?: string;
  /** Description text below the input */
  description?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Size variant */
  size?: "small" | "medium";
}

const filter = createFilterOptions<string>();

const AutocompleteTagInputInternal: React.FC<AutocompleteTagInputProps> = ({
  label,
  value,
  onChange,
  suggestions = [],
  placeholder = "Type or select...",
  description,
  disabled = false,
  size = "small"
}) => {
  const theme = useTheme();

  const handleChange = useCallback(
    (_event: React.SyntheticEvent, newValue: (string | { inputValue?: string })[]) => {
      const tags = newValue.map((v) =>
        typeof v === "string" ? v : (v.inputValue ?? "")
      );
      onChange(tags);
    },
    [onChange]
  );

  const filterOptions = useCallback(
    (options: string[], params: { inputValue: string; getOptionLabel: (option: string) => string }) => {
      const filtered = filter(options, params);
      const { inputValue } = params;
      const isExisting = options.some(
        (option) => inputValue.toLowerCase() === option.toLowerCase()
      );
      if (inputValue !== "" && !isExisting) {
        filtered.push(inputValue);
      }
      return filtered;
    },
    []
  );

  const getOptionLabel = useCallback((option: string | { inputValue?: string }) => {
    return typeof option === "string" ? option : (option.inputValue ?? "");
  }, []);

  const renderOption = useCallback(
    (props: React.HTMLAttributes<HTMLLIElement> & { key: React.Key }, option: string) => {
      const { key, ...rest } = props;
      const isNew = option !== "" && !suggestions.includes(option);
      return (
        <li key={key} {...rest}>
          {isNew ? `Add "${option}"` : option}
        </li>
      );
    },
    [suggestions]
  );

  return (
    <div style={{ marginBottom: theme.spacing(1) }}>
      <Autocomplete
        size={size}
        multiple
        freeSolo
        selectOnFocus
        clearOnBlur
        handleHomeEndKeys
        disabled={disabled}
        options={suggestions}
        value={value}
        onChange={handleChange}
        filterOptions={filterOptions}
        getOptionLabel={getOptionLabel}
        renderOption={renderOption}
        renderInput={(params) => (
          <TextField {...params} label={label} placeholder={placeholder} />
        )}
      />
      {description && (
        <span
          style={{
            display: "block",
            marginTop: theme.spacing(0.5),
            color: theme.palette.text.secondary,
            fontSize: theme.fontSizeSmaller
          }}
        >
          {description}
        </span>
      )}
    </div>
  );
};

export const AutocompleteTagInput = memo(AutocompleteTagInputInternal);
AutocompleteTagInput.displayName = "AutocompleteTagInput";
