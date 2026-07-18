/**
 * SelectField Component
 *
 * A semantic wrapper around MUI Select with label and description support,
 * replacing the repetitive FormControl + InputLabel + Select + Typography pattern.
 * The label renders above the control via the shared Label primitive.
 */

import React, { memo, useCallback, useId } from "react";
import {
  FormControl,
  Select,
  MenuItem,
  Typography,
  type SelectChangeEvent
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Label } from "./Label";
import { CONTROL } from "./tokens";

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
  options: readonly SelectOption[];
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
  /** Additional class name for the root element */
  className?: string;
  /** Hide the label entirely (nothing rendered; the control keeps an aria-label) */
  hideLabel?: boolean;
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
const SelectFieldInternal = React.forwardRef<HTMLDivElement, SelectFieldProps>(
  function SelectFieldInternal(
    {
      label,
      value,
      onChange,
      options,
      description,
      disabled = false,
      id,
      size = "medium",
      variant = "standard",
      className,
      hideLabel = false
    },
    ref
  ) {
    const theme = useTheme();
    const autoId = useId();
    const selectId = id ?? autoId;
    const labelId = `${selectId}-label`;
    const showLabel = Boolean(label) && !hideLabel;

    const handleChange = useCallback(
      (event: SelectChangeEvent<string | number>) => {
        onChange(String(event.target.value));
      },
      [onChange]
    );

    const fieldFontSize = theme.fontSizeNormal || "15px";
    const controlHeight =
      size === "small" ? CONTROL.height.sm : CONTROL.height.lg;

    return (
      // No baked outer margin — spacing is the parent's job (e.g. FlexColumn
      // gap), like every other primitive. The control's value renders at the
      // same 15px body token as TextInput so the two line up in a shared form;
      // the Label above owns its 4px gap to the control.
      <div ref={ref} className={className}>
        <FormControl size={size} disabled={disabled} fullWidth>
          {showLabel && (
            <Label id={labelId} disabled={disabled}>
              {label}
            </Label>
          )}
          <Select
            id={selectId}
            // The combobox display node takes its accessible name from the
            // Label via aria-labelledby; with the label hidden it falls back
            // to aria-label (inputProps reaches the display node, a top-level
            // aria-label would land on the InputBase root).
            labelId={showLabel ? labelId : undefined}
            inputProps={
              !showLabel && label ? { "aria-label": label } : undefined
            }
            value={value}
            onChange={handleChange}
            variant={variant}
            sx={{
              minHeight: `${controlHeight}px`,
              "& .MuiSelect-select": { fontSize: fieldFontSize },
              // Outlined only: MUI's 16.5px / 8.5px vertical padding targets
              // ~56px / 40px fields — shrink it so the control lands on the
              // token height. The standard variant keeps its own padding.
              "& .MuiOutlinedInput-input.MuiSelect-select": {
                paddingTop: size === "small" ? "3px" : "7px",
                paddingBottom: size === "small" ? "3px" : "7px"
              }
            }}
          >
            {options.map((option) => (
              <MenuItem
                key={option.value}
                value={option.value}
                sx={{ fontSize: fieldFontSize }}
              >
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
              mt: 0.5,
              fontSize: theme.fontSizeSmaller
            }}
          >
            {description}
          </Typography>
        )}
      </div>
    );
  }
);

export const SelectField = memo(SelectFieldInternal);
SelectField.displayName = "SelectField";
