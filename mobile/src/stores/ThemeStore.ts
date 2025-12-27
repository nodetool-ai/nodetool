import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { paletteDark, paletteLight, ThemeColors } from '../utils/theme';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  colors: ThemeColors;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
  updateSystemTheme: () => void;
}

const getColorsForMode = (mode: ThemeMode): ThemeColors => {
  if (mode === 'system') {
    const systemColorScheme = Appearance.getColorScheme();
    return systemColorScheme === 'light' ? paletteLight : paletteDark;
  }
  return mode === 'light' ? paletteLight : paletteDark;
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'system',
      colors: getColorsForMode('system'),
      toggleTheme: () => {
        const currentMode = get().mode;
        let newMode: ThemeMode;
        
        if (currentMode === 'system') {
          newMode = Appearance.getColorScheme() === 'dark' ? 'light' : 'dark';
        } else {
          newMode = currentMode === 'dark' ? 'light' : 'dark';
        }
        
        set({
          mode: newMode,
          colors: getColorsForMode(newMode),
        });
      },
      setTheme: (mode: ThemeMode) => {
        set({
          mode,
          colors: getColorsForMode(mode),
        });
      },
      updateSystemTheme: () => {
        if (get().mode === 'system') {
          set({ colors: getColorsForMode('system') });
        }
      },
    }),
    {
      name: 'theme-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// Listen for system theme changes
Appearance.addChangeListener(() => {
  useThemeStore.getState().updateSystemTheme();
});
