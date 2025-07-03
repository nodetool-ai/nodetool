/**
 * Theme Variables
 *
 * Font sizes, families, and other theme constants used throughout the component styles.
 */

export const themeVariables = {
  // Font Sizes
  fontSizeGiant: "2em",
  fontSizeBigger: "1.25em",
  fontSizeBig: "1.125em",
  fontSizeNormal: "16px",
  fontSizeSmall: "0.875em",
  fontSizeSmaller: "0.75em",
  fontSizeTiny: "0.65em",
  fontSizeTinyer: "0.55em",

  // Font Families
  fontFamily1: "'Inter', Arial, sans-serif",
  fontFamily2: "'JetBrains Mono', 'Inter', Arial, sans-serif",

  // Spacing (theme.spacing equivalent)
  spacing: (multiplier: number) => `${multiplier * 4}px`
} as const;

export type ThemeVariables = typeof themeVariables;
