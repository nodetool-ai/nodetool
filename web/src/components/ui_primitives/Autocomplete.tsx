/**
 * Autocomplete Component
 *
 * A semantic wrapper around MUI Autocomplete with simplified API
 * for common search/select patterns.
 */

import { memo, useId } from "react";
import {
  Autocomplete as MuiAutocomplete,
  AutocompleteProps as MuiAutocompleteProps,
  Box,
  TextField,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Label } from "./Label";
import { BORDER_RADIUS, CONTROL, TYPOGRAPHY } from "./tokens";
import { SPACING } from "./spacing";
import { useFieldDensity } from "./fieldDensity";

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
  /** Hide the visible label. The input keeps it as its accessible name. */
  hideLabel?: boolean;
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
 *   placeholder="Search"
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
  hideLabel = false,
  size = "medium",
  compact = false,
  error,
  helperText,
  renderInput,
  sx,
  className,
  style,
  id,
  ...props
}: AutocompleteProps<T, Multiple, FreeSolo>) {
  const theme = useTheme();
  const reactId = useId();
  // MUI Autocomplete owns its input's id (via params.inputProps), so the
  // label must target the Autocomplete id, not a TextField override.
  const fieldId = id ?? reactId;

  // A compact surface (FieldDensityContext) gives the field the same look
  // TextInput and SelectField take there: control-size text, the small
  // control height and the inspector field surface.
  const dense = useFieldDensity() === "compact";
  const effectiveSize = compact || dense ? "small" : size;
  const showLabel = Boolean(label) && !hideLabel;

  const defaultRenderInput: MuiAutocompleteProps<T, Multiple, false, FreeSolo>["renderInput"] =
    (params) => (
      <TextField
        {...params}
        inputProps={
          !showLabel && label
            ? { ...params.inputProps, "aria-label": label }
            : params.inputProps
        }
        placeholder={placeholder}
        size={effectiveSize}
        error={error}
        helperText={helperText}
        sx={{
          // Same form-control sizing as TextInput/SelectField: the value renders
          // at the body token (15px), or at the control token (13px label) on a
          // compact surface. The `compact` prop only tightens height (via
          // size="small"), never shrinks the text.
          "& .MuiInputBase-input": dense
            ? TYPOGRAPHY.sans.label
            : { fontSize: theme.fontSizeNormal || "15px" },
          ...(dense && {
            // Doubled class beats Autocomplete's own root padding, so the value
            // starts at the same inset as a SelectField value.
            "&& .MuiInputBase-root": {
              minHeight: `${CONTROL.height.sm}px`,
              py: 0,
              pl: 0,
              backgroundColor: theme.vars.palette.background.default,
            },
            "&& .MuiAutocomplete-input": { pl: SPACING.md },
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: theme.vars.palette.c_overlay,
              borderRadius: BORDER_RADIUS.sm,
            },
          }),
          // The native placeholder should read as a muted hint, not entered text.
          "& .MuiInputBase-input::placeholder": {
            opacity: 0.6,
          },
        }}
      />
    );

  return (
    // Block wrapper, never a fragment: the label above and the combobox must
    // stay one flex child at call sites. ALL root layout props — className,
    // style, sx — land on the wrapper so flex sizing applies to the actual
    // flex child; descendant `& .Mui*` selectors keep working from here.
    <Box
      className={className}
      style={style}
      sx={[{ display: "block" }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {showLabel && (
        <Label htmlFor={fieldId} error={error}>
          {label}
        </Label>
      )}
      <MuiAutocomplete
        id={fieldId}
        size={effectiveSize}
        renderInput={renderInput || defaultRenderInput}
        {...props}
      />
    </Box>
  );
}

export const Autocomplete =
  // SAFETY: `memo` returns a non-generic `MemoExoticComponent`, dropping the
  // three type parameters callers pass. The runtime value is unchanged; only
  // the generic call signature is restored.
  memo(AutocompleteInternal) as typeof AutocompleteInternal;
