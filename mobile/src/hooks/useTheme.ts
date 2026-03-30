import { useThemeStore } from '../stores/ThemeStore';
import { Appearance } from 'react-native';

export const useTheme = () => {
  // Use individual selectors to prevent unnecessary re-renders
  // when only some store values change
  const mode = useThemeStore((state) => state.mode);
  const colors = useThemeStore((state) => state.colors);
  const setTheme = useThemeStore((state) => state.setTheme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  const isDark = mode === 'system'
    ? Appearance.getColorScheme() === 'dark'
    : mode === 'dark';

  return {
    mode,
    effectiveMode: isDark ? 'dark' : 'light',
    colors,
    setTheme,
    toggleTheme,
    isDark,
  };
};
