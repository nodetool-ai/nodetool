/**
 * SelectField Component
 *
 * A semantic wrapper around MUI Select with label and description support,
 * replacing the repetitive FormControl + InputLabel + Select + Typography pattern.
 */

import React, { memo, useCallback, useId } from "react";
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  type SelectChangeEvent
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface SelectOption {
  /** Option value */
  value: string | number;
  /** Display label */
  label: string;
}

export interface SelectFieldProps {
  /** Label text */
  label: string;
  /** Current value */
  value: string | number;
  /** Change handler */
  onChange: (value: string) => void;
  /** Available options */
  options: SelectOption[];
  /** Optional description text shown below */
  description?: string;
  /** Whether the select is disabled */
  disabled?: boolean;
  /** HTML id */
  id?: string;
  /** Size variant */
  size?: "small" | "medium";
  /** MUI variant */
  variant?: "standard" | "outlined" | "filled";
}

/**
 * SelectField - A themed select field with label and optional description
 *
 * @example
 * // Basic select
 * <SelectField
 *   label="Color"
 *   value={color}
 *   onChange={setColor}
 *   options={[
 *     { value: "red", label: "Red" },
 *     { value: "blue", label: "Blue" },
 *   ]}
 * />
 *
 * @example
 * // With description
 * <SelectField
 *   label="Theme"
 *   value={theme}
 *   onChange={setTheme}
 *   options={[
 *     { value: "light", label: "Light" },
 *     { value: "dark", label: "Dark" },
 *   ]}
 *   description="Choose the application theme."
 * />
 *
 * @example
 * // Small standard variant
 * <SelectField
 *   label="Size"
 *   value={size}
 *   onChange={setSize}
 *   options={[{ value: "s", label: "Small" }, { value: "m", label: "Medium" }]}
 *   size="small"
 *   variant="standard"
 * />
 */
const SelectFieldInternal: React.FC<SelectFieldProps> = ({
  label,
  value,
  onChange,
  options,
  description,
  disabled = false,
  id,
  size = "small",
  variant = "standard"
}) => {
  const theme = useTheme();
  const autoId = useId();
  const selectId = id ?? autoId;

  const handleChange = useCallback(
    (event: SelectChangeEvent<string | number>) => {
      onChange(String(event.target.value));
    },
    [onChange]
  );

  return (
    <>
      <FormControl size={size} disabled={disabled}>
        <InputLabel htmlFor={selectId}>{label}</InputLabel>
        <Select
          id={selectId}
          value={value}
          onChange={handleChange}
          variant={variant}
          label={variant !== "standard" ? label : undefined}
        >
          {options.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {description && (
        <Typography
          variant="body2"
          sx={{
            color: theme.palette.text.secondary,
            mt: 0.5
          }}
        >
          {description}
        </Typography>
      )}
    </>
  );
};

export const SelectField = memo(SelectFieldInternal);
SelectField.displayName = "SelectField";
