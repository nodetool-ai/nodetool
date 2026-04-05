export type ThemeColors = {
  background: string;
  surface: string;
  surfaceHeader: string;
  primary: string;
  primaryMuted: string;
  text: string;
  textSecondary: string;
  textOnPrimary: string;
  border: string;
  error: string;
  success: string;
  warning: string;
  info: string;
  inputBg: string;
  cardBg: string;
  userBubbleBg: string;
  userBubbleText: string;
  assistantBubbleBg: string;
};

export const paletteDark: ThemeColors = {
  background: '#141414',
  surface: '#1a1a1a',
  surfaceHeader: '#1E1E1E',
  primary: '#60A5FA',
  primaryMuted: 'rgba(96, 165, 250, 0.15)',
  text: '#FFFFFF',
  textSecondary: '#B9B9B4',
  textOnPrimary: '#FFFFFF',
  border: 'rgba(255, 255, 255, 0.08)',
  error: '#FF5555',
  success: '#50FA7B',
  warning: '#FFB86C',
  info: '#60A5FA',
  inputBg: '#1C1C1E',
  cardBg: '#1C1C1E',
  userBubbleBg: '#2A5298',
  userBubbleText: '#FFFFFF',
  assistantBubbleBg: 'rgba(255, 255, 255, 0.08)',
};

export const paletteLight: ThemeColors = {
  background: '#FAF7F2',
  surface: '#FAF7F2',
  surfaceHeader: '#FAF7F2',
  primary: '#5E9A8F',
  primaryMuted: 'rgba(94, 154, 143, 0.12)',
  text: '#2A2A2A',
  textSecondary: '#5B5751',
  textOnPrimary: '#FFFFFF',
  border: '#E7DFD6',
  error: '#D8615B',
  success: '#6BAA75',
  warning: '#D99A3B',
  info: '#3F7D8C',
  inputBg: '#F6EFE7',
  cardBg: '#FFFFFF',
  userBubbleBg: '#5E9A8F',
  userBubbleText: '#FFFFFF',
  assistantBubbleBg: 'rgba(0, 0, 0, 0.05)',
};
