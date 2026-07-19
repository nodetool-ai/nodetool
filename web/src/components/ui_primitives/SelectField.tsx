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
import { useFormFieldContext } from "./formFieldContext";

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
  /** MUI variant. `filled` is not part of the token-height contract. */
  variant?: "standard" | "outlined";
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
      variant = "outlined",
      className,
      hideLabel = false
    },
    ref
  ) {
    const theme = useTheme();
    const formField = useFormFieldContext();
    const autoId = useId();
    // Inside a FormField the context id wins (even over a caller `id`) so the
    // `${controlId}-label` convention below stays aligned with FormField.
    const selectId = formField ? formField.controlId : id ?? autoId;
    const labelId = `${selectId}-label`;
    // Inside a labeled FormField, FormField renders the visible label and
    // gives it id `${controlId}-label` (its documented convention). The
    // combobox is a div, so htmlFor can't name it — instead we point labelId
    // at FormField's label element and let aria-labelledby carry the name.
    // A label-less FormField suppresses nothing: the own label renders (with
    // the same `${selectId}-label` id, so labelId still resolves).
    const suppressed = Boolean(formField?.labeled);
    const showLabel = !suppressed && Boolean(label) && !hideLabel;

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
            // In a FormField the id must NOT land here: MUI puts it on the
            // hidden native input, FormField's <label htmlFor> would associate
            // with it, and MUI appends that input to aria-labelledby — the
            // label text would be counted twice ("Color Color"). The name
            // flows through labelId alone.
            id={formField ? undefined : selectId}
            // The combobox display node takes its accessible name from the
            // Label via aria-labelledby; with the label hidden it falls back
            // to aria-label (inputProps reaches the display node, a top-level
            // aria-label would land on the InputBase root).
            labelId={showLabel || formField ? labelId : undefined}
            inputProps={
              !showLabel && label ? { "aria-label": label } : undefined
            }
            value={value}
            onChange={handleChange}
            variant={variant}
            sx={{
              minHeight: `${controlHeight}px`,
              // Outlined only: a default field background so fields read as
              // fields. The standard variant keeps its transparent underline
              // look.
              "&.MuiOutlinedInput-root": {
                backgroundColor: theme.vars.palette.Paper.overlay
              },
              // minHeight is only a floor: MUI's select display carries its own
              // line-height minimum and vertical padding, which pushed measured
              // heights past the token (30.6-38.6px). Zero the vertical padding,
              // flex-center the value, and normalize line-height — MUI's
              // 1.4375em computes against the 16px root font and inherits as a
              // fixed ~23px into the 15px display; a unitless value tracks the
              // actual font so the content always fits under the floor.
              "& .MuiSelect-select": {
                fontSize: fieldFontSize,
                lineHeight: 1.4375,
                display: "flex",
                alignItems: "center",
                minHeight: "0px",
                paddingTop: "0px",
                paddingBottom: "0px"
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
