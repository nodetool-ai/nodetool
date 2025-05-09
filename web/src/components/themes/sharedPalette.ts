import { PaletteOptions, PaletteColorOptions } from "@mui/material/styles";

declare module "@mui/system/createTheme" {
  interface Palette {
    [key: string]: string;
  }
}

declare module "@mui/material/styles" {
  // Extend PaletteOptions as well to include custom colors
  interface PaletteOptions {
    /* General */
    c_black?: string;
    c_white?: string;
    c_gray0?: string;
    c_gray1?: string;
    c_gray2?: string;
    c_gray3?: string;
    c_gray4?: string;
    c_gray5?: string;
    c_gray6?: string;
    c_background?: string;
    c_node_menu?: string;
    /* Highlights */
    c_hl1?: string;
    c_hl1_1?: string;
    c_hl2?: string;
    c_selection?: string;
    c_input?: string;
    c_output?: string;
    /* Status */
    c_attention?: string;
    c_delete?: string;
    c_debug?: string;
    c_error?: string;
    c_info?: string;
    c_job?: string;
    c_node?: string;
    c_progress?: string;
    c_success?: string;
    c_warn?: string;
    c_warning?: string;
    c_link?: string;
    c_link_visited?: string;
    /* Scrollbar*/
    c_scroll_bg?: string;
    c_scroll_hover?: string;
    c_scroll_thumb?: string;
    // Properties from ThemeNodes that might be missing or different in ThemeNodetool
    c_node_bg?: string;
    c_node_bg_group?: string;
    c_node_header_bg?: string;
    c_node_header_bg_group?: string;
    c_bg_loop?: string;
    c_bg_group?: string;
    c_bg_comment?: string;
    c_editor_bg_color?: string;
    c_editor_grid_color?: string;
    c_editor_axis_color?: string;
    tertiary?: PaletteColorOptions;
  }

  interface Palette {
    /* General */
    c_black?: string;
    c_white?: string;
    c_gray0?: string;
    c_gray1?: string;
    c_gray2?: string;
    c_gray3?: string;
    c_gray4?: string;
    c_gray5?: string;
    c_gray6?: string;
    c_background?: string;
    c_node_menu?: string;
    /* Highlights */
    c_hl1?: string;
    c_hl1_1?: string;
    c_hl2?: string;
    c_selection?: string;
    c_input?: string;
    c_output?: string;
    /* Status */
    c_attention?: string;
    c_delete?: string;
    c_debug?: string;
    c_error?: string;
    c_info?: string;
    c_job?: string;
    c_node?: string;
    c_progress?: string;
    c_success?: string;
    c_warn?: string;
    c_warning?: string;
    c_link?: string;
    c_link_visited?: string;
    /* Scrollbar*/
    c_scroll_bg?: string;
    c_scroll_hover?: string;
    c_scroll_thumb?: string;
    // Properties from ThemeNodes that might be missing or different in ThemeNodetool
    c_node_bg?: string;
    c_node_bg_group?: string;
    c_node_header_bg?: string;
    c_node_header_bg_group?: string;
    c_bg_loop?: string;
    c_bg_group?: string;
    c_bg_comment?: string;
    c_editor_bg_color?: string;
    c_editor_grid_color?: string;
    c_editor_axis_color?: string;
    tertiary: PaletteColorOptions;
  }
}

export const sharedPalette: PaletteOptions = {
  /* General */
  c_black: "#020202", // From ThemeNodetool (ThemeNodes was #000000)
  c_white: "#FCFCFC", // From ThemeNodetool (ThemeNodes was #ffffff)
  c_gray0: "#0E0E0E",
  c_gray1: "#242424",
  c_gray2: "#444444",
  c_gray3: "#6D6D6D",
  c_gray4: "#959595",
  c_gray5: "#BDBDBD",
  c_gray6: "#D9D9D9",
  c_background: "#424854",
  c_node_menu: "#232323",
  /* Highlights */
  c_hl1: "#76e5b8",
  c_hl1_1: "#325954", // From ThemeNodetool (ThemeNodes was #bdf0e9)
  c_hl2: "#128B6E", // From ThemeNodetool (ThemeNodes was #1ec7c7)
  c_selection: "#8EACA777",
  c_input: "#374f4f",
  c_output: "#493f4d",

  /* Statuses */
  c_attention: "#E35BFF",
  c_delete: "#FF2222", // From ThemeNodetool (ThemeNodes was #ff2222)
  c_debug: "#FF3355", // New from ThemeNodetool
  c_error: "#FF5555",
  c_info: "#FFFFFF", // New from ThemeNodetool
  c_job: "#223399", // New from ThemeNodetool
  c_node: "#029486", // New from ThemeNodetool
  c_progress: "#556611", // New from ThemeNodetool
  c_success: "#50FA7B",
  c_warn: "#FFB86C", // New from ThemeNodetool
  c_warning: "#FFB86C", // From ThemeNodetool (ThemeNodes was #ffb86c)
  c_link: "#e4ffde", // From ThemeNodetool (ThemeNodes was ##e4ffde - fixed typo)
  c_link_visited: "#d1e2cd",

  /* Scrollbar*/
  c_scroll_bg: "#484848", // New from ThemeNodetool
  c_scroll_hover: "#383838", // New from ThemeNodetool
  c_scroll_thumb: "#2A2A2A", // New from ThemeNodetool

  /* From ThemeNodes - potentially to be merged or confirmed if still needed */
  c_node_bg: "#2b2e31",
  c_node_bg_group: "#3d3d3d",
  c_node_header_bg: "#202020",
  c_node_header_bg_group: "#444",
  c_bg_loop: "#305c9d17",
  c_bg_group: "#9bcfdb17",
  c_bg_comment: "#fff",
  c_editor_bg_color: "rgb(128, 128, 128)",
  c_editor_grid_color: "#333",
  c_editor_axis_color: "#5e5e5e",

  primary: {
    main: "#76e5b8", // From ThemeNodetool (ThemeNodes was #424242)
    contrastText: "#FFFFFF"
  },
  secondary: {
    main: "#757575",
    contrastText: "#FFFFFF"
  },
  tertiary: {
    light: "#a7d0c3",
    main: "#68a89a",
    dark: "#387c6d",
    contrastText: "#fff"
  },
  background: {
    default: "#202020",
    paper: "#232323"
  }
};
