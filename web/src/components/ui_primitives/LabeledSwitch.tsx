/**
 * LabeledSwitch Component
 *
 * A semantic wrapper around MUI Switch with label and optional description.
 * Used for boolean toggle settings with contextual information.
 */

import React, { memo, useCallback } from "react";
import { Switch, Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";

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

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography
          component="label"
          htmlFor={id}
          sx={{
            fontSize: size === "small" ? "0.875rem" : "1rem",
            color: disabled
              ? theme.palette.text.disabled
              : theme.palette.text.primary,
            cursor: disabled ? "default" : "pointer",
            userSelect: "none",
          }}
        >
          {label}
        </Typography>
        <Switch
          id={id}
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          size={size}
          inputProps={{ "aria-label": label }}
        />
      </Box>
      {description && (
        <Typography
          variant="body2"
          sx={{
            color: theme.palette.text.secondary,
            fontSize: "0.75rem",
            marginTop: theme.spacing(-0.5),
          }}
        >
          {description}
        </Typography>
      )}
    </Box>
  );
};

export const LabeledSwitch = memo(LabeledSwitchInternal);
LabeledSwitch.displayName = "LabeledSwitch";
