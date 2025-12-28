/** @jsxImportSource @emotion/react */
/**
 * Editor Tokens
 *
 * This module provides a token layer for editor/node UI styling.
 * It isolates editor look decisions behind a stable API while still
 * sourcing values from ThemeNodetool.
 */

import type { Theme } from "@mui/material/styles";

/**
 * Scope for editor UI tokens.
 * - "node": Used for node property inputs in the flow editor (default)
 * - "inspector": Used for property editing in the inspector panel (slightly different sizing)
 */
export type EditorUiScope = "node" | "inspector";

/**
 * Editor tokens for consistent styling across editor UI components.
 */
export interface EditorTokens {
  // Radii
  radii: {
    control: string; // Small radius for inputs/selects/switch
    panel: string; // Panel/popup radius
    node: string; // Node body radius
  };

  // Spacing / density
  space: {
    xs: string;
    sm: string;
    md: string;
  };

  control: {
    heightSm: string; // Consistent compact control height
    padX: string; // Horizontal padding for controls
    padY: string; // Vertical padding for controls
  };

  // Borders
  border: {
    width: string;
    color: string;
    colorHover: string;
    colorFocus: string;
  };

  // Surfaces
  surface: {
    controlBg: string;
    controlBgHover: string;
    controlBgFocus: string;
    menuBg: string;
  };

  // Typography (editor controls)
  text: {
    controlSize: string;
    labelSize: string;
    color: string;
    colorSecondary: string;
  };

  // Focus / interaction
  focus: {
    ring: string; // Focus ring definition (color + shadow)
  };

  transition: {
    fast: string;
    normal: string;
  };

  // Elevation
  shadow: {
    menu: string;
    popover: string;
  };
}

/**
 * Get editor tokens derived from the theme.
 *
 * @param theme - MUI theme
 * @param opts - Options for token generation
 * @returns Editor tokens for consistent styling
 */
export const getEditorTokens = (
  theme: Theme,
  opts?: { scope?: EditorUiScope }
): EditorTokens => {
  const scope = opts?.scope ?? "node";

  // Inspector uses slightly larger sizes
  const isInspector = scope === "inspector";

  // Defensive access to theme properties - provide fallbacks for tests
  const palette = theme?.vars?.palette ?? theme?.palette;
  const grey = palette?.grey ?? {
    100: "#f5f5f5",
    300: "#e0e0e0",
    500: "#9e9e9e",
    700: "#616161",
    800: "#424242"
  };
  const primary = palette?.primary ?? { main: "#77b4e6" };

  return {
    radii: {
      control: "6px",
      panel: "8px",
      node: theme?.rounded?.node ?? "8px"
    },

    space: {
      xs: theme?.spacing ? theme.spacing(1) : "4px",
      sm: theme?.spacing ? theme.spacing(2) : "8px",
      md: theme?.spacing ? theme.spacing(3) : "12px"
    },

    control: {
      heightSm: isInspector ? "32px" : "28px",
      padX: isInspector ? "10px" : "8px",
      padY: isInspector ? "6px" : "4px"
    },

    border: {
      width: "1px",
      color: grey[700],
      colorHover: grey[500],
      colorFocus: primary.main
    },

    surface: {
      controlBg: "rgba(0, 0, 0, 0.2)",
      controlBgHover: "rgba(0, 0, 0, 0.3)",
      controlBgFocus: "rgba(0, 0, 0, 0.4)",
      menuBg: grey[800]
    },

    text: {
      controlSize: isInspector
        ? (theme?.fontSizeSmall ?? "0.875em")
        : (theme?.fontSizeSmaller ?? "0.75em"),
      labelSize: isInspector
        ? (theme?.fontSizeNormal ?? "16px")
        : (theme?.fontSizeSmall ?? "0.875em"),
      color: grey[100],
      colorSecondary: grey[300]
    },

    focus: {
      ring: `0 0 0 2px ${primary.main}33`
    },

    transition: {
      fast: "0.1s ease",
      normal: "0.2s ease"
    },

    shadow: {
      menu: "0 10px 30px rgba(0, 0, 0, 0.5)",
      popover: "0 4px 6px rgba(0, 0, 0, 0.1)"
    }
  };
};
