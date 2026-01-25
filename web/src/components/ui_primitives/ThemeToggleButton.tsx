/** @jsxImportSource @emotion/react */
import React, { useCallback } from "react";
import { css } from "@emotion/react";
import { useTheme, useColorScheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { IconButton, Tooltip, Switch, Box, Typography } from "@mui/material";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const styles = (theme: Theme) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    ".theme-button": {
      color: theme.vars.palette.text.primary,
      transition: "transform 0.3s ease",
      "&:hover": {
        transform: "rotate(20deg)"
      }
    }
  });

export interface ThemeToggleButtonProps {
  /** Display variant */
  variant?: "icon" | "switch" | "labeled";
  /** Button size */
  buttonSize?: "small" | "medium" | "large";
  /** Label text for light mode */
  lightLabel?: string;
  /** Label text for dark mode */
  darkLabel?: string;
  /** Custom class name */
  className?: string;
}

export const ThemeToggleButton: React.FC<ThemeToggleButtonProps> = ({
  variant = "icon",
  buttonSize = "small",
  lightLabel = "Light",
  darkLabel = "Dark",
  className
}) => {
  const theme = useTheme();
  const { mode, setMode } = useColorScheme();

  const handleToggle = useCallback(() => {
    setMode(mode === "dark" ? "light" : "dark");
  }, [mode, setMode]);

  // Don't render until mode is available
  if (!mode) {
    return null;
  }

  const isDark = mode === "dark";
  const tooltipText = `Switch to ${isDark ? "light" : "dark"} mode`;

  if (variant === "switch") {
    return (
      <Box css={styles(theme)} className={`nodrag theme-toggle ${className || ""}`}>
        <Switch
          checked={isDark}
          onChange={handleToggle}
          icon={<LightModeIcon fontSize="small" />}
          checkedIcon={<DarkModeIcon fontSize="small" />}
          size={buttonSize === "large" ? "medium" : "small"}
        />
      </Box>
    );
  }

  if (variant === "labeled") {
    return (
      <Box css={styles(theme)} className={`nodrag theme-toggle ${className || ""}`} sx={{ gap: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {isDark ? darkLabel : lightLabel}
        </Typography>
        <IconButton
          className="theme-button"
          onClick={handleToggle}
          size={buttonSize}
          aria-label={tooltipText}
        >
          {isDark ? <LightModeIcon fontSize={buttonSize} /> : <DarkModeIcon fontSize={buttonSize} />}
        </IconButton>
      </Box>
    );
  }

  return (
    <Box css={styles(theme)} className={`nodrag theme-toggle ${className || ""}`}>
      <Tooltip title={tooltipText} enterDelay={TOOLTIP_ENTER_DELAY}>
        <IconButton
          className="theme-button"
          onClick={handleToggle}
          size={buttonSize}
          aria-label={tooltipText}
        >
          {isDark ? <LightModeIcon fontSize={buttonSize} /> : <DarkModeIcon fontSize={buttonSize} />}
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export default ThemeToggleButton;
