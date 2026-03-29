/**
 * Checkbox Component
 *
 * A semantic wrapper around MUI Checkbox with label support
 * and consistent styling. Used for boolean selections.
 */

import React, { memo } from "react";
import {
  Checkbox as MuiCheckbox,
  CheckboxProps as MuiCheckboxProps,
  FormControlLabel,
  FormControlLabelProps
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface CheckboxProps
  extends Omit<MuiCheckboxProps, "size"> {
  /** Label text displayed next to the checkbox */
  label?: React.ReactNode;
  /** Size variant */
  size?: "small" | "medium";
  /** Compact mode reduces padding */
  compact?: boolean;
  /** Props forwarded to the FormControlLabel wrapper (only when label is provided) */
  labelProps?: Partial<Omit<FormControlLabelProps, "control" | "label">>;
}

/**
 * Checkbox - A themed checkbox with optional label
 *
 * @example
 * // Basic checkbox
 * <Checkbox checked={checked} onChange={handleChange} />
 *
 * @example
 * // With label
 * <Checkbox label="Accept terms" checked={accepted} onChange={handleToggle} />
 *
 * @example
 * // Compact size
 * <Checkbox label="Select" compact size="small" />
 */
const CheckboxInternal: React.FC<CheckboxProps> = ({
  label,
  size = "medium",
  compact = false,
  labelProps,
  sx,
  ...props
}) => {
  const theme = useTheme();

  const checkbox = (
    <MuiCheckbox
      size={size}
      sx={{
        ...(compact && {
          padding: theme.spacing(0.5),
        }),
        ...sx,
      }}
      {...props}
    />
  );

  if (label) {
    return (
      <FormControlLabel
        control={checkbox}
        label={label}
        {...labelProps}
        sx={{
          ...(compact && {
            marginLeft: -0.5,
            "& .MuiFormControlLabel-label": {
              fontSize: theme.fontSizeSmall || "0.875rem",
            },
          }),
          ...labelProps?.sx,
        }}
      />
    );
  }

  return checkbox;
};

export const Checkbox = memo(CheckboxInternal);
Checkbox.displayName = "Checkbox";
