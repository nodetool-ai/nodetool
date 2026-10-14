import { useMemo, type ReactNode } from "react";
import { useSettingsStore } from "../../stores/SettingsStore";
import { ThemeRoot } from "../ui_primitives";
import ThemeNodetool, { createNodetoolTheme } from "./ThemeNodetool";
import type { TextSize } from "./textSizes";

const themes = new Map<TextSize, ReturnType<typeof createNodetoolTheme>>([
  ["default", ThemeNodetool]
]);

/** One theme per text size, built once and reused. */
export const nodetoolThemeFor = (
  textSize: TextSize
): ReturnType<typeof createNodetoolTheme> => {
  let theme = themes.get(textSize);
  if (!theme) {
    theme = createNodetoolTheme(textSize);
    themes.set(textSize, theme);
  }
  return theme;
};

interface AppThemeRootProps {
  children?: ReactNode;
}

/** The app's theme root, at the text size the user picked in Settings. */
const AppThemeRoot = ({ children }: AppThemeRootProps) => {
  const textSize = useSettingsStore((state) => state.settings.textSize);
  const theme = useMemo(() => nodetoolThemeFor(textSize), [textSize]);
  return <ThemeRoot theme={theme}>{children}</ThemeRoot>;
};

export default AppThemeRoot;
