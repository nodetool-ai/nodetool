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

  return {
    radii: {
      control: "6px",
      panel: "8px",
      node: theme.rounded?.node ?? "8px"
    },

    space: {
      xs: theme.spacing(1),
      sm: theme.spacing(2),
      md: theme.spacing(3)
    },

    control: {
      heightSm: isInspector ? "32px" : "28px",
      padX: isInspector ? "10px" : "8px",
      padY: isInspector ? "6px" : "4px"
    },

    border: {
      width: "1px",
      color: theme.vars.palette.grey[700],
      colorHover: theme.vars.palette.grey[500],
      colorFocus: theme.vars.palette.primary.main
    },

    surface: {
      controlBg: "rgba(0, 0, 0, 0.2)",
      controlBgHover: "rgba(0, 0, 0, 0.3)",
      controlBgFocus: "rgba(0, 0, 0, 0.4)",
      menuBg: theme.vars.palette.grey[800]
    },

    text: {
      controlSize: isInspector ? theme.fontSizeSmall : theme.fontSizeSmaller,
      labelSize: isInspector ? theme.fontSizeNormal : theme.fontSizeSmall,
      color: theme.vars.palette.grey[100],
      colorSecondary: theme.vars.palette.grey[300]
    },

    focus: {
      ring: `0 0 0 2px ${theme.vars.palette.primary.main}33`
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
