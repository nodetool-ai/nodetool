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
import { CONTROL } from "./tokens";

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
        size = "medium",
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

      const isSmall = compact || size === "small";
      const controlHeight = isSmall ? CONTROL.height.sm : CONTROL.height.lg;

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
            // One readable form-control size shared with SelectField: the value
            // renders at the body token (15px). `compact` only tightens height
            // (via MUI size="small"), never shrinks the text — shrinking the
            // font is what made inputs read as "too small".
            "& .MuiInputBase-input": {
              fontSize: theme.fontSizeNormal || "15px",
            },
            // Deterministic control height from the CONTROL token. MUI's
            // outlined padding (16.5px / 8.5px vertical) is calibrated for
            // ~56px / 40px fields; shrink it so the 1.4375em content box plus
            // padding fits inside the token height, and let the centered
            // inline-flex root make up the sub-pixel remainder.
            "& .MuiInputBase-root:not(.MuiInputBase-multiline)": {
              minHeight: `${controlHeight}px`,
            },
            "& .MuiOutlinedInput-root:not(.MuiInputBase-multiline) .MuiOutlinedInput-input":
              {
                paddingTop: isSmall ? "3px" : "7px",
                paddingBottom: isSmall ? "3px" : "7px",
              },
            "& .MuiInputBase-multiline": {
              minHeight: 0,
            },
            // The resting label doubles as the placeholder, so it must sit ON the
            // input text it morphs into. Match its font to the 15px input value
            // (a 16px label over 15px text reads as floating high) and soften the
            // colour so it's a hint, not entered text. Full strength once shrunk.
            "& .MuiInputLabel-root:not(.MuiInputLabel-shrink)": {
              fontSize: theme.fontSizeNormal || "15px",
              opacity: 0.6,
            },
            // MUI's outlined resting transform is calibrated for its stock
            // ~56px/40px fields; at the CONTROL heights (36/28) the label must
            // sit at the input's vertical padding to land on the text it morphs
            // into.
            "& .MuiInputLabel-outlined:not(.MuiInputLabel-shrink)": {
              transform: "translate(14px, 7px) scale(1)",
            },
            "& .MuiInputLabel-outlined.MuiInputLabel-sizeSmall:not(.MuiInputLabel-shrink)":
              {
                transform: "translate(14px, 3px) scale(1)",
              },
            ...sx,
          }}
          {...props}
        />
      );
    }
  )
);

TextInput.displayName = "TextInput";
