/**
 * FormField Component
 *
 * A composite form field wrapping label, input control, and helper/error text.
 * Replaces 97+ instances of manual FormControl/FormLabel/FormHelperText patterns.
 */

import React from "react";
import { Box, BoxProps, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";

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
  sx,
  children,
  ...props
}) => {
  const theme = useTheme();

  const isRow = direction === "row";
  const gap = compact ? 0.5 : 1;
  const bottomText = error || helperText;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: isRow ? "row" : "column",
        gap,
        alignItems: isRow ? "center" : "stretch",
        ...sx,
      }}
      {...props}
    >
      {label && (
        <Typography
          component="label"
          sx={{
            fontSize: compact ? theme.fontSizeTiny : theme.fontSizeSmall,
            fontWeight: 500,
            color: error
              ? theme.vars.palette.error.main
              : theme.vars.palette.text.secondary,
            minWidth: isRow ? labelWidth : undefined,
            flexShrink: isRow ? 0 : undefined,
          }}
        >
          {label}
          {required && (
            <Typography
              component="span"
              sx={{
                color: theme.vars.palette.error.main,
                ml: 0.25,
              }}
            >
              *
            </Typography>
          )}
        </Typography>
      )}
      <Box sx={{ flex: isRow ? 1 : undefined }}>
        {children}
        {bottomText && (
          <Typography
            sx={{
              fontSize: theme.fontSizeTinyer || "0.7rem",
              color: error
                ? theme.vars.palette.error.main
                : theme.vars.palette.text.secondary,
              mt: 0.5,
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
