import { Platform, ViewStyle } from 'react-native';

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceHeader: string;
  surfaceElevated: string;
  primary: string;
  primaryMuted: string;
  primaryLight: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  textOnPrimary: string;
  border: string;
  borderLight: string;
  error: string;
  success: string;
  warning: string;
  info: string;
  inputBg: string;
  cardBg: string;
  userBubbleBg: string;
  userBubbleText: string;
  assistantBubbleBg: string;
  accent: string;
  accentMuted: string;
};

export type ThemeShadows = {
  small: ViewStyle;
  medium: ViewStyle;
  large: ViewStyle;
};

const shadowsLight: ThemeShadows = {
  small: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
    android: { elevation: 2 },
  }) as ViewStyle,
  medium: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
    android: { elevation: 4 },
  }) as ViewStyle,
  large: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16 },
    android: { elevation: 8 },
  }) as ViewStyle,
};

const shadowsDark: ThemeShadows = {
  small: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 3 },
    android: { elevation: 2 },
  }) as ViewStyle,
  medium: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 8 },
    android: { elevation: 4 },
  }) as ViewStyle,
  large: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 16 },
    android: { elevation: 8 },
  }) as ViewStyle,
};

export const paletteDark: ThemeColors = {
  background: '#0F0F0F',
  surface: '#1A1A1A',
  surfaceHeader: '#161616',
  surfaceElevated: '#222222',
  primary: '#6DB3F8',
  primaryMuted: 'rgba(109, 179, 248, 0.12)',
  primaryLight: 'rgba(109, 179, 248, 0.08)',
  text: '#F5F5F5',
  textSecondary: '#9E9E9E',
  textTertiary: '#666666',
  textOnPrimary: '#FFFFFF',
  border: 'rgba(255, 255, 255, 0.08)',
  borderLight: 'rgba(255, 255, 255, 0.04)',
  error: '#FF6B6B',
  success: '#51CF66',
  warning: '#FFC078',
  info: '#6DB3F8',
  inputBg: '#1E1E1E',
  cardBg: '#1A1A1A',
  userBubbleBg: '#2563EB',
  userBubbleText: '#FFFFFF',
  assistantBubbleBg: 'rgba(255, 255, 255, 0.06)',
  accent: '#A78BFA',
  accentMuted: 'rgba(167, 139, 250, 0.12)',
};

export const paletteLight: ThemeColors = {
  background: '#F8F6F3',
  surface: '#FFFFFF',
  surfaceHeader: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  primary: '#4A8F82',
  primaryMuted: 'rgba(74, 143, 130, 0.10)',
  primaryLight: 'rgba(74, 143, 130, 0.05)',
  text: '#1A1A1A',
  textSecondary: '#6B6560',
  textTertiary: '#A09A94',
  textOnPrimary: '#FFFFFF',
  border: '#E8E2DB',
  borderLight: '#F0EBE5',
  error: '#DC4C4C',
  success: '#3D9A50',
  warning: '#D4880F',
  info: '#3574A5',
  inputBg: '#F3EDE6',
  cardBg: '#FFFFFF',
  userBubbleBg: '#4A8F82',
  userBubbleText: '#FFFFFF',
  assistantBubbleBg: 'rgba(0, 0, 0, 0.04)',
  accent: '#7C5DC7',
  accentMuted: 'rgba(124, 93, 199, 0.10)',
};

export function getShadows(isDark: boolean): ThemeShadows {
  return isDark ? shadowsDark : shadowsLight;
}
