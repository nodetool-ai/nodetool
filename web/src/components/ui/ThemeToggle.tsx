import { ToolbarIconButton } from "../ui_primitives";
import { useColorScheme } from "@mui/material/styles";
import LightMode from "@mui/icons-material/LightMode";
import DarkMode from "@mui/icons-material/DarkMode";
import { memo, useCallback, type MouseEvent } from "react";
import { openSettingsTab } from "../workspace/openPageTab";
import { useTranslation } from "react-i18next";

export const ThemeToggle = memo(function ThemeToggle() {
  const { t } = useTranslation();
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

  const targetMode = mode === "dark" ? "light" : "dark";
  const label = t("batch2_17.themeToggle.switchToMode", { mode: targetMode });

  return (
    <ToolbarIconButton
      className="theme-toggle"
      icon={mode === "dark" ? <LightMode /> : <DarkMode />}
      tooltip={t("batch2_17.themeToggle.tooltip", { mode: targetMode })}
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
