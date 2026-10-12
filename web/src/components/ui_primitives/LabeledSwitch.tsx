/**
 * LabeledSwitch Component
 *
 * A semantic wrapper around MUI Switch with label and optional description.
 * Used for boolean toggle settings with contextual information.
 */

import React, { memo, useCallback } from "react";
import { Switch, Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { SPACING } from "./spacing";

export interface LabeledSwitchProps {
  /** Label text */
  label: string;
  /** Whether the switch is checked */
  checked: boolean;
  /** Change handler */
  onChange: (checked: boolean) => void;
  /** Optional description text shown below */
  description?: string;
  /** Whether the switch is disabled */
  disabled?: boolean;
  /** HTML id for the switch input */
  id?: string;
  /** Size variant */
  size?: "small" | "medium";
}

/**
 * LabeledSwitch - A themed switch with label and optional description
 *
 * @example
 * // Basic labeled switch
 * <LabeledSwitch label="Dark mode" checked={isDark} onChange={setIsDark} />
 *
 * @example
 * // With description
 * <LabeledSwitch
 *   label="Auto-save"
 *   checked={autoSave}
 *   onChange={setAutoSave}
 *   description="Automatically save changes every 30 seconds"
 * />
 *
 * @example
 * // Small disabled switch
 * <LabeledSwitch label="Feature" checked={false} onChange={() => {}} size="small" disabled />
 */
const LabeledSwitchInternal: React.FC<LabeledSwitchProps> = ({
  label,
  checked,
  onChange,
  description,
  disabled = false,
  id,
  size = "medium",
}) => {
  const theme = useTheme();

  const handleChange = useCallback(
    (_event: React.ChangeEvent<HTMLInputElement>, value: boolean) => {
      onChange(value);
    },
    [onChange]
  );

  // Label and description share one column beside the switch, so the
  // description stays with its own label instead of floating under a row
  // the switch makes taller.
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: theme.spacing(SPACING.md),
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          component="label"
          htmlFor={id}
          sx={{
            display: "block",
            fontSize: size === "small" ? theme.fontSizeSmall : theme.fontSizeNormal,
            // `theme.vars`, not `theme.palette`: this app runs the CSS-vars
            // theme, where the plain palette resolves to the light values and
            // an enabled label came out reading as a disabled one.
            color: disabled
              ? theme.vars.palette.text.disabled
              : theme.vars.palette.text.primary,
            cursor: disabled ? "default" : "pointer",
            userSelect: "none",
          }}
        >
          {label}
        </Typography>
        {description && (
          <Typography
            variant="body2"
            sx={{
              color: theme.vars.palette.text.secondary,
              fontSize: theme.fontSizeSmall,
              marginTop: theme.spacing(SPACING.micro),
            }}
          >
            {description}
          </Typography>
        )}
      </Box>
      <Switch
        id={id}
        checked={checked}
        onChange={handleChange}
        disabled={disabled}
        size={size}
        inputProps={{ "aria-label": label }}
        sx={{ flexShrink: 0 }}
      />
    </Box>
  );
};

export const LabeledSwitch = memo(LabeledSwitchInternal);
LabeledSwitch.displayName = "LabeledSwitch";
