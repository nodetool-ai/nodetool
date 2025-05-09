import {
  PaletteOptions,
  PaletteColorOptions,
  PaletteColor
} from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface PaletteOptions {
    c_black?: string;
    c_brightest?: string;
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
    c_brightest?: string;
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

export const paletteLight: PaletteOptions = {
  /* General */
  c_black: "#FCFCFC",
  c_brightest: "#020202",
  c_gray0: "#D9D9D9",
  c_gray1: "#BDBDBD",
  c_gray2: "#959595",
  c_gray3: "#6D6D6D",
  c_gray4: "#444444",
  c_gray5: "#242424",
  c_gray6: "#0E0E0E",
  c_background: "#F5F5F7",
  c_node_menu: "#FFFFFF",

  /* Highlights */
  c_hl1: "#007AFF",
  c_hl1_1: "#5EADFF",
  c_hl2: "#34C759",
  c_selection: "#B4D7FFB3",
  c_input: "#EFEFF0",
  c_output: "#E0E0E0",

  /* Statuses */
  c_attention: "#FF9500", // Orange for attention
  c_delete: "#FF3B30", // Red for delete
  c_debug: "#5856D6", // Indigo/Purple for debug
  c_error: "#FF3B30", // Red for error
  c_info: "#5AC8FA", // Light blue for info
  c_job: "#007AFF", // Blue for job
  c_node: "#34C759", // Green for node status
  c_progress: "#FFCC00", // Yellow for progress
  c_success: "#34C759", // Green for success
  c_warn: "#FF9500", // Orange for warn
  c_warning: "#FF9500", // Orange for warning
  c_link: "#007AFF",
  c_link_visited: "#5856D6",

  /* Scrollbar*/
  c_scroll_bg: "#F0F0F0",
  c_scroll_hover: "#DCDCDC",
  c_scroll_thumb: "#C0C0C0",

  /* Node specific - adjust for light theme */
  c_node_bg: "#FFFFFF",
  c_node_bg_group: "#F7F7F7",
  c_node_header_bg: "#EFEFEF",
  c_node_header_bg_group: "#EAEAEA",
  c_bg_loop: "#007AFF1A", // Light blue with alpha
  c_bg_group: "#34C7591A", // Light green with alpha
  c_bg_comment: "#FFFFE0", // Light yellow for comments
  c_editor_bg_color: "#FFFFFF",
  c_editor_grid_color: "#E0E0E0",
  c_editor_axis_color: "#D3D3D3",

  primary: {
    main: "#76e5b8",
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
    default: "#880000",
    paper: "#FDFDFD"
  },
  text: {
    primary: "#000",
    secondary: "#222",
    disabled: "#444"
  },
  action: {
    active: "#000",
    hover: "#222",
    selected: "#444"
  }
};
