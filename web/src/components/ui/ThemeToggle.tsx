import { ToolbarIconButton } from "../ui_primitives";
import { useColorScheme } from "@mui/material/styles";
import LightMode from "@mui/icons-material/LightMode";
import DarkMode from "@mui/icons-material/DarkMode";
import { memo, useCallback } from "react";

export const ThemeToggle = memo(function ThemeToggle() {
  const { mode, setMode } = useColorScheme();

  const toggleTheme = useCallback(() => {
    const newMode = mode === "dark" ? "light" : "dark";
    setMode(newMode);
  }, [mode, setMode]);

  if (!mode) {
    return null;
  }

  return (
    <ToolbarIconButton
      className="theme-toggle"
      icon={mode === "dark" ? <LightMode /> : <DarkMode />}
      tooltip={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}
      tooltipPlacement="right-start"
      onClick={toggleTheme}
      size="small"
    />
  );
});

ThemeToggle.displayName = "ThemeToggle";

export default ThemeToggle;
