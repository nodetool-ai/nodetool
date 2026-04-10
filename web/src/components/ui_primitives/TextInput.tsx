/**
 * TextInput Component
 *
 * A semantic wrapper around MUI TextField with consistent styling
 * and simplified API for common text input patterns.
 */

import React, { memo, forwardRef } from "react";
import {
  TextField as MuiTextField,
  TextFieldProps as MuiTextFieldProps,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface TextInputProps
  extends Omit<MuiTextFieldProps, "variant" | "size"> {
  /** Visual variant */
  variant?: "outlined" | "filled" | "standard";
  /** Size variant */
  size?: "small" | "medium";
  /** Compact mode with reduced padding */
  compact?: boolean;
  /** Full width (default: true) */
  fullWidth?: boolean;
  /** Error message string (sets error state and helperText) */
  errorMessage?: string;
}

/**
 * TextInput - A themed text input field
 *
 * @example
 * // Basic text input
 * <TextInput label="Name" value={name} onChange={handleChange} />
 *
 * @example
 * // With error message
 * <TextInput label="Email" value={email} errorMessage={emailError} />
 *
 * @example
 * // Compact multiline
 * <TextInput label="Notes" multiline rows={3} compact />
 *
 * @example
 * // Password input
 * <TextInput label="Password" type="password" size="small" />
 */
export const TextInput = memo(
  forwardRef<HTMLDivElement, TextInputProps>(
    (
      {
        variant = "outlined",
        size = "small",
        compact = false,
        fullWidth = true,
        errorMessage,
        error,
        helperText,
        sx,
        ...props
      },
      ref
    ) => {
      const theme = useTheme();

      const hasError = error || !!errorMessage;
      const displayHelperText = errorMessage || helperText;

      return (
        <MuiTextField
          ref={ref}
          variant={variant}
          size={compact ? "small" : size}
          fullWidth={fullWidth}
          error={hasError}
          helperText={displayHelperText}
          sx={{
            ...(compact && {
              "& .MuiInputBase-input": {
                py: 0.75,
                fontSize: theme.fontSizeSmall || "0.875rem",
              },
              "& .MuiInputLabel-root": {
                fontSize: theme.fontSizeSmall || "0.875rem",
              },
            }),
            ...sx,
          }}
          {...props}
        />
      );
    }
  )
);

TextInput.displayName = "TextInput";
