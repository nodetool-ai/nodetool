/**
 * FormField Component
 *
 * A composite form field wrapping label, input control, and helper/error text.
 * Owns the label: it provides FormFieldContext so label-bearing children
 * (TextInput, SelectField) suppress their own label and adopt the control id —
 * no double labels by construction.
 */

import React, { useId, useMemo } from "react";
import { Box, BoxProps, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Label } from "./Label";
import {
  FormFieldContext,
  type FormFieldContextValue
} from "./formFieldContext";

export interface FormFieldProps extends Omit<BoxProps, 'onChange'> {
  /** Field label */
  label?: string;
  /** Helper text shown below the input */
  helperText?: string;
  /** Error message (replaces helperText when present) */
  error?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Layout direction */
  direction?: "column" | "row";
  /** Compact spacing for dense layouts */
  compact?: boolean;
  /** Label width when direction is "row" */
  labelWidth?: string | number;
  /**
   * Explicit control id; defaults to a generated one. Context-aware children
   * (TextInput, SelectField) adopt it, making the label's htmlFor a real
   * association. Custom children that don't adopt it leave the htmlFor
   * dangling — the label is then visual-only (matching the pre-FormField
   * hand-rolled pattern); such controls can name themselves via
   * aria-labelledby={`${htmlFor}-label`}.
   */
  htmlFor?: string;
}

/**
 * FormField - A composite label + input + helper text wrapper
 *
 * @example
 * // Basic form field
 * <FormField label="Name" required>
 *   <TextField value={name} onChange={setName} />
 * </FormField>
 *
 * @example
 * // With error
 * <FormField label="Email" error="Invalid email address">
 *   <TextField value={email} onChange={setEmail} />
 * </FormField>
 *
 * @example
 * // Horizontal layout
 * <FormField label="Theme" direction="row" labelWidth={120}>
 *   <Select value={theme} onChange={setTheme} />
 * </FormField>
 *
 * @example
 * // Compact with helper text
 * <FormField label="API Key" helperText="Found in your account settings" compact>
 *   <TextField value={key} onChange={setKey} />
 * </FormField>
 */
export const FormField: React.FC<FormFieldProps> = ({
  label,
  helperText,
  error,
  required = false,
  direction = "column",
  compact = false,
  labelWidth,
  htmlFor,
  sx,
  children,
  ...props
}) => {
  const theme = useTheme();
  const reactId = useId();
  const controlId = htmlFor ?? reactId;
  const contextValue = useMemo<FormFieldContextValue>(
    () => ({ controlId, labeled: Boolean(label) }),
    [controlId, label]
  );

  const isRow = direction === "row";
  const bottomText = error || helperText;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: isRow ? "row" : "column",
        gap: isRow ? (compact ? 0.5 : 1) : 0,
        alignItems: isRow ? "center" : "stretch",
        ...sx,
      }}
      {...props}
    >
      {label && (
        <Label
          htmlFor={controlId}
          // The label id is a documented convention: non-labelable controls
          // (SelectField's combobox div) name themselves via
          // aria-labelledby={`${controlId}-label`} since htmlFor only
          // associates with native form elements.
          id={`${controlId}-label`}
          size={compact ? "small" : "normal"}
          required={required}
          error={Boolean(error)}
          sx={{
            minWidth: isRow ? labelWidth : undefined,
            flexShrink: isRow ? 0 : undefined,
            marginBottom: isRow ? 0 : undefined,
          }}
        >
          {label}
        </Label>
      )}
      <Box
        sx={{
          flex: isRow ? 1 : undefined,
          // Children shouldn't normally pass helperText (FormField's own
          // helper line below is the one that renders), but if they do,
          // normalize MUI's default 3px 14px 0 helper margin onto the grid.
          "& .MuiFormHelperText-root": {
            margin: 0,
            marginTop: theme.spacing(1),
          },
        }}
      >
        <FormFieldContext.Provider value={contextValue}>
          {children}
        </FormFieldContext.Provider>
        {bottomText && (
          <Typography
            sx={{
              fontSize: theme.fontSizeSmaller,
              color: error
                ? theme.vars.palette.error.main
                : theme.vars.palette.text.secondary,
              marginTop: theme.spacing(1),
              lineHeight: 1.4,
            }}
          >
            {bottomText}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

FormField.displayName = "FormField";
