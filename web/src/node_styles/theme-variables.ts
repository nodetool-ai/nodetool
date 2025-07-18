/**
 * Theme Variables
 *
 * Font sizes, families, and other theme constants used throughout the component styles.
 */

export const themeVariables = {
  // Font Sizes
  fontSizeGiant: "2rem",
  fontSizeBigger: "1.25rem",
  fontSizeBig: "1.125rem",
  fontSizeNormal: "16px",
  fontSizeSmall: "0.875rem",
  fontSizeSmaller: "0.75rem",
  fontSizeTiny: "0.65rem",
  fontSizeTinyer: "0.55rem",

  // Font Families
  fontFamily1: "'Inter', Arial, sans-serif",
  fontFamily2: "'JetBrains Mono', monospace",

  // Spacing (theme.spacing equivalent)
  spacing: (multiplier: number) => `${multiplier * 4}px`
} as const;

export type ThemeVariables = typeof themeVariables;
