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
  /** Text and icons drawn on a solid `primary` (or `accent`) fill. */
  textOnPrimary: string;
  /** Text and icons drawn on a solid `warning` fill. */
  textOnWarning: string;
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
  // Neutral, slightly cool greys in three steps: page, card, raised. Headers
  // and the tab bar sit on the page colour so chrome recedes behind content.
  background: '#0C0C0E',
  surface: '#151518',
  surfaceHeader: '#0C0C0E',
  surfaceElevated: '#1D1D21',
  // The blue end of the brand gradient. On the page colour it reads at
  // about 7.3:1.
  primary: '#5E9EFF',
  primaryMuted: 'rgba(94, 158, 255, 0.14)',
  primaryLight: 'rgba(94, 158, 255, 0.08)',
  text: '#EDEDEF',
  textSecondary: '#A1A1AA',
  textTertiary: '#71717A',
  // The dark-mode primary is a light blue, so white on it reads at about
  // 2.7:1. A near-black ink reads at about 6.9:1.
  textOnPrimary: '#0A1324',
  textOnWarning: '#1A1A1A',
  border: 'rgba(255, 255, 255, 0.12)',
  borderLight: 'rgba(255, 255, 255, 0.07)',
  error: '#F87171',
  success: '#4ADE80',
  warning: '#FBBF24',
  info: '#5E9EFF',
  inputBg: '#1D1D21',
  cardBg: '#151518',
  userBubbleBg: '#2563EB',
  userBubbleText: '#FFFFFF',
  assistantBubbleBg: 'rgba(255, 255, 255, 0.06)',
  // The violet middle of the brand gradient.
  accent: '#A78BFA',
  accentMuted: 'rgba(167, 139, 250, 0.14)',
};

export const paletteLight: ThemeColors = {
  background: '#F8F6F3',
  surface: '#FFFFFF',
  surfaceHeader: '#F8F6F3',
  surfaceElevated: '#FFFFFF',
  // The web light theme's primary (docs/DESIGN.md). White on it reads at
  // about 4.9:1; the earlier #4A8F82 managed 3.8:1.
  primary: '#2A8077',
  primaryMuted: 'rgba(42, 128, 119, 0.10)',
  primaryLight: 'rgba(42, 128, 119, 0.05)',
  text: '#1A1A1A',
  textSecondary: '#6B6560',
  textTertiary: '#A09A94',
  textOnPrimary: '#FFFFFF',
  textOnWarning: '#1A1A1A',
  border: '#E3DCD4',
  borderLight: '#ECE6DF',
  error: '#DC4C4C',
  success: '#3D9A50',
  warning: '#D4880F',
  info: '#3574A5',
  inputBg: '#F3EDE6',
  cardBg: '#FFFFFF',
  userBubbleBg: '#2A8077',
  userBubbleText: '#FFFFFF',
  assistantBubbleBg: 'rgba(0, 0, 0, 0.04)',
  accent: '#7C5DC7',
  accentMuted: 'rgba(124, 93, 199, 0.10)',
};

export function getShadows(isDark: boolean): ThemeShadows {
  return isDark ? shadowsDark : shadowsLight;
}

/**
 * Solid tile colours for things that have a name but no picture, such as an
 * app. The same name always gets the same colour, in both themes. White text
 * on each reads at 4.5:1 or better.
 */
export const IDENTITY_COLORS = [
  '#2563EB',
  '#7C3AED',
  '#DB2777',
  '#C2410C',
  '#0F766E',
  '#4F46E5',
  '#B91C1C',
  '#0369A1',
] as const;

export function identityColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return IDENTITY_COLORS[Math.abs(hash) % IDENTITY_COLORS.length];
}
