import { useMemo } from 'react';
import { useThemeStore } from '../stores/ThemeStore';
import { Appearance } from 'react-native';
import { getShadows } from '../utils/theme';

export const useTheme = () => {
  const mode = useThemeStore((state) => state.mode);
  const colors = useThemeStore((state) => state.colors);
  const setTheme = useThemeStore((state) => state.setTheme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  const isDark = mode === 'system'
    ? Appearance.getColorScheme() === 'dark'
    : mode === 'dark';

  const shadows = useMemo(() => getShadows(isDark), [isDark]);

  return {
    mode,
    effectiveMode: isDark ? 'dark' : 'light',
    colors,
    shadows,
    setTheme,
    toggleTheme,
    isDark,
  };
};
