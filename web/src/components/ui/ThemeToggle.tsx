import { ToolbarIconButton } from "../ui_primitives";
import { useColorScheme } from "@mui/material/styles";
import LightMode from "@mui/icons-material/LightMode";
import DarkMode from "@mui/icons-material/DarkMode";
import { memo, useCallback, type MouseEvent } from "react";
import { openSettingsTab } from "../workspace/openPageTab";

export const ThemeToggle = memo(function ThemeToggle() {
  const { mode, setMode } = useColorScheme();

  const toggleTheme = useCallback(() => {
    const newMode = mode === "dark" ? "light" : "dark";
    setMode(newMode);
  }, [mode, setMode]);

  // Right-click leads to Settings > General > Appearance, where contrast
  // and text size live next to the theme.
  const openAppearanceSettings = useCallback((event: MouseEvent) => {
    event.preventDefault();
    openSettingsTab("general");
  }, []);

  if (!mode) {
    return null;
  }

  const label = `Switch to ${mode === "dark" ? "light" : "dark"} mode`;

  return (
    <ToolbarIconButton
      className="theme-toggle"
      icon={mode === "dark" ? <LightMode /> : <DarkMode />}
      tooltip={`${label}. Right-click for contrast and other appearance settings.`}
      ariaLabel={label}
      tooltipPlacement="right-start"
      onClick={toggleTheme}
      onContextMenu={openAppearanceSettings}
      size="small"
    />
  );
});

ThemeToggle.displayName = "ThemeToggle";

export default ThemeToggle;
