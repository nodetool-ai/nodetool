/**
 * Layout and type tokens shared by every screen.
 *
 * Colors live in `theme.ts` because they change with the color scheme. These
 * don't, so they are plain constants. The values are the ones the screens
 * already used most, collected in one place so new code picks from a scale
 * instead of inventing another 14.
 */
import type { Insets } from 'react-native';

export const SPACING = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

/** Font sizes. `body` is the default reading size. */
export const FONT_SIZE = {
  caption: 12,
  footnote: 13,
  body: 15,
  headline: 17,
  title: 22,
} as const;

export const FONT_WEIGHT = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** Apple and Material both ask for at least a 44pt square per tap target. */
export const MIN_TOUCH_TARGET = 44;

/** Extends a small icon button's hit area toward `MIN_TOUCH_TARGET`. */
export const HIT_SLOP: Insets = { top: 10, bottom: 10, left: 10, right: 10 };
