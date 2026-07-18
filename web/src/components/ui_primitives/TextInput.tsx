/**
 * TextInput Component
 *
 * A semantic wrapper around MUI TextField with consistent styling
 * and simplified API for common text input patterns. The label renders
 * above the control via the shared Label primitive — no floating labels.
 */

import React, { memo, forwardRef, useId } from "react";
import {
  Box,
  TextField as MuiTextField,
  TextFieldProps as MuiTextFieldProps,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { CONTROL } from "./tokens";
import { Label } from "./Label";

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
  /** Hide the label visually while keeping it as the accessible name */
  hideLabel?: boolean;
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
        label,
        required,
        disabled,
        id,
        hideLabel = false,
        className,
        inputProps,
        sx,
        ...props
      },
      ref
    ) => {
      const theme = useTheme();
      const reactId = useId();
      const fieldId = id ?? reactId;

      const isSmall = compact || size === "small";
      const controlHeight = isSmall ? CONTROL.height.sm : CONTROL.height.lg;

      const hasError = error || !!errorMessage;
      const displayHelperText = errorMessage || helperText;

      const showLabel = !!label && !hideLabel;
      // A hidden (or absent) visible label still needs an accessible name.
      const ariaLabel =
        !showLabel && typeof label === "string" ? label : undefined;

      return (
        // Block wrapper, never a fragment: callers place <TextInput> inside
        // FlexRow/FlexColumn and a fragment would explode into two flex
        // children. Caller sx/className land here so layout sizing (width,
        // flex) and `& .Mui*` descendant overrides keep working.
        <Box
          ref={ref}
          className={className}
          sx={{
            display: "block",
            width: fullWidth ? "100%" : undefined,
            ...sx,
          }}
        >
          {showLabel && (
            <Label
              htmlFor={fieldId}
              required={required}
              disabled={disabled}
              error={hasError}
            >
              {label}
            </Label>
          )}
          <MuiTextField
            id={fieldId}
            variant={variant}
            size={compact ? "small" : size}
            fullWidth={fullWidth}
            required={required}
            disabled={disabled}
            error={hasError}
            helperText={displayHelperText}
            inputProps={
              ariaLabel !== undefined
                ? { "aria-label": ariaLabel, ...inputProps }
                : inputProps
            }
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
            }}
            {...props}
          />
        </Box>
      );
    }
  )
);

TextInput.displayName = "TextInput";
