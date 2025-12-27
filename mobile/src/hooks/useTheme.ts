import { useThemeStore, ThemeMode } from '../stores/ThemeStore';
import { ThemeColors } from '../utils/theme';
import { Appearance } from 'react-native';

export const useTheme = () => {
  const { mode, colors, setTheme, toggleTheme } = useThemeStore();
  
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
