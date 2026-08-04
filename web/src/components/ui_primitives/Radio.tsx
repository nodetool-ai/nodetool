/**
 * Radio Component
 *
 * A semantic wrapper around MUI Radio with label support, matching Checkbox.
 * Used for one-of-many selections; wrap several in `RadioSet`.
 */

import React, { forwardRef, memo } from "react";
import {
  Radio as MuiRadio,
  RadioProps as MuiRadioProps,
  RadioGroup as MuiRadioGroup,
  FormControlLabel,
  FormControlLabelProps
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface RadioProps extends Omit<MuiRadioProps, "size"> {
  /** Label text displayed next to the radio */
  label?: React.ReactNode;
  /** Size variant */
  size?: "small" | "medium";
  /** Compact mode reduces padding */
  compact?: boolean;
  /** Props forwarded to the FormControlLabel wrapper (only when label is provided) */
  labelProps?: Partial<Omit<FormControlLabelProps, "control" | "label">>;
}

/**
 * Radio - A themed radio button with optional label
 *
 * @example
 * <Radio label="Fast" value="fast" checked={mode === "fast"} onChange={pick} />
 */
const RadioInternal = forwardRef<HTMLButtonElement, RadioProps>(
  (
    { label, size = "medium", compact = false, labelProps, sx, ...props },
    ref
  ) => {
    const theme = useTheme();

    const radio = (
      <MuiRadio
        ref={ref}
        size={size}
        sx={{
          ...(compact && {
            padding: theme.spacing(0.5)
          }),
          ...sx
        }}
        {...props}
      />
    );

    if (label) {
      return (
        <FormControlLabel
          control={radio}
          label={label}
          {...labelProps}
          sx={{
            ...(compact && {
              marginLeft: -0.5,
              "& .MuiFormControlLabel-label": {
                fontSize: theme.fontSizeSmall
              }
            }),
            ...labelProps?.sx
          }}
        />
      );
    }

    return radio;
  }
);

export const Radio = memo(RadioInternal);
Radio.displayName = "Radio";

/** The group wrapper that gives a set of `Radio`s one name and one value. */
export const RadioSet = memo(MuiRadioGroup);
RadioSet.displayName = "RadioSet";
