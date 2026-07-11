import { StateIconButton } from "../ui_primitives";
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
    <StateIconButton
      icon={mode === "dark" ? <LightMode /> : <DarkMode />}
      tooltip={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}
      onClick={toggleTheme}
      size="small"
      color="default"
      sx={{
        marginLeft: 1,
        scale: 0.85,
        color: "var(--palette-text-primary)",
        border: `1px solid var(--palette-grey-600)`
      }}
    />
  );
});

ThemeToggle.displayName = "ThemeToggle";

export default ThemeToggle;
