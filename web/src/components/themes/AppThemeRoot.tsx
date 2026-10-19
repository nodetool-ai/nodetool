import { useMemo, type ReactNode } from "react";
import TranslationProvider from "../../contexts/TranslationProvider";
import { useSettingsStore } from "../../stores/SettingsStore";
import { ThemeRoot } from "../ui_primitives";
import ThemeNodetool, { createNodetoolTheme } from "./ThemeNodetool";
import type { TextSize } from "./textSizes";
import { DEFAULT_THEME_CONTRAST, type ThemeContrast } from "./themeContrasts";

const themes = new Map<string, ReturnType<typeof createNodetoolTheme>>([
  [`default:${DEFAULT_THEME_CONTRAST}`, ThemeNodetool]
]);

/** One theme per text size and contrast, built once and reused. */
export const nodetoolThemeFor = (
  textSize: TextSize,
  contrast: ThemeContrast = DEFAULT_THEME_CONTRAST
): ReturnType<typeof createNodetoolTheme> => {
  const key = `${textSize}:${contrast}`;
  let theme = themes.get(key);
  if (!theme) {
    theme = createNodetoolTheme(textSize, contrast);
    themes.set(key, theme);
  }
  return theme;
};

interface AppThemeRootProps {
  children?: ReactNode;
}

/** The app's theme root, at the text size and contrast picked in Settings. */
const AppThemeRoot = ({ children }: AppThemeRootProps) => {
  const textSize = useSettingsStore((state) => state.settings.textSize);
  const contrast = useSettingsStore((state) => state.settings.themeContrast);
  const theme = useMemo(
    () => nodetoolThemeFor(textSize, contrast),
    [textSize, contrast]
  );
  return (
    <TranslationProvider>
      <ThemeRoot theme={theme}>{children}</ThemeRoot>
    </TranslationProvider>
  );
};

export default AppThemeRoot;
