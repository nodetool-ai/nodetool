import { useEffect } from "react";
import { useColorScheme } from "@mui/material/styles";
import { useSettingsStore } from "../../stores/SettingsStore";

/**
 * ThemeSync component synchronizes the user's theme preset setting 
 * with MUI's color scheme system.
 */
export const ThemeSync = () => {
  const themePreset = useSettingsStore((state) => state.settings.themePreset);
  const { setMode } = useColorScheme();

  useEffect(() => {
    if (themePreset && setMode) {
      setMode(themePreset);
    }
  }, [themePreset, setMode]);

  return null;
};

export default ThemeSync;
