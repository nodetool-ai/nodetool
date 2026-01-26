import React from "react";
import { StateIconButton } from "../ui_primitives";
import { useColorScheme } from "@mui/material/styles";
import { Palette } from "@mui/icons-material";
import { useSettingsStore } from "../../stores/SettingsStore";

export const ThemeToggle: React.FC = () => {
  const { mode } = useColorScheme();
  const setMenuOpen = useSettingsStore((state) => state.setMenuOpen);

  // Don't render until we have the mode
  if (!mode) {
    return null;
  }

  // Capitalize first letter of mode for display
  const modeDisplay = mode.charAt(0).toUpperCase() + mode.slice(1);

  return (
    <StateIconButton
      icon={<Palette />}
      tooltip={`Current theme: ${modeDisplay}`}
      onClick={() => {
        // Open settings to theme section (tab 1 = Editor & View)
        setMenuOpen(true, 1);
      }}
      size="small"
      color="default"
      sx={{
        color: "var(--palette-text-primary)"
      }}
    />
  );
};

export default ThemeToggle;
