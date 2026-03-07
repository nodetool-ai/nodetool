import { useThemeStore } from '../stores/ThemeStore';
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
