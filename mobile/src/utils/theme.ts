export type ThemeColors = {
  background: string;
  surface: string;
  surfaceHeader: string;
  primary: string;
  text: string;
  textSecondary: string;
  border: string;
  error: string;
  success: string;
  warning: string;
  info: string;
  inputBg: string;
  cardBg: string;
};

export const paletteDark: ThemeColors = {
  background: '#141414',
  surface: '#1a1a1a',
  surfaceHeader: '#1E1E1E',
  primary: '#60A5FA',
  text: '#FFFFFF',
  textSecondary: '#B9B9B4',
  border: 'rgba(255, 255, 255, 0.08)',
  error: '#FF5555',
  success: '#50FA7B',
  warning: '#FFB86C',
  info: '#60A5FA',
  inputBg: '#1C1C1E',
  cardBg: '#1C1C1E',
};

export const paletteLight: ThemeColors = {
  background: '#FAF7F2',
  surface: '#FAF7F2',
  surfaceHeader: '#FAF7F2',
  primary: '#5E9A8F',
  text: '#2A2A2A',
  textSecondary: '#5B5751',
  border: '#E7DFD6',
  error: '#D8615B',
  success: '#6BAA75',
  warning: '#D99A3B',
  info: '#3F7D8C',
  inputBg: '#F6EFE7',
  cardBg: '#FFFFFF',
};

export const Theme = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
  }
};
