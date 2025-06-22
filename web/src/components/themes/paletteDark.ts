import {
  PaletteOptions,
  PaletteColorOptions,
  PaletteColor
} from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface PaletteOptions {
    c_black?: string;
    c_bg_comment?: string;
    c_brightest?: string;
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
    c_hl1?: string;
    c_hl1_1?: string;
    c_hl2?: string;
    c_selection?: string;
    c_input?: string;
    c_output?: string;
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
    c_scroll_bg?: string;
    c_scroll_hover?: string;
    c_scroll_thumb?: string;
    c_node_bg?: string;
    c_node_bg_group?: string;
    c_node_header_bg?: string;
    c_node_header_bg_group?: string;
    c_bg_loop?: string;
    c_bg_group?: string;
    c_editor_bg_color?: string;
    c_editor_grid_color?: string;
    c_editor_axis_color?: string;
    primary?: PaletteColorOptions;
    secondary?: PaletteColorOptions;
    tertiary?: PaletteColorOptions;
    background?: { default?: string; paper?: string };
  }

  interface Palette {
    c_black?: string;
    c_bg_comment?: string;
    c_brightest?: string;
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
    c_hl1?: string;
    c_hl1_1?: string;
    c_hl2?: string;
    c_selection?: string;
    c_input?: string;
    c_output?: string;
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
    c_scroll_bg?: string;
    c_scroll_hover?: string;
    c_scroll_thumb?: string;
    c_node_bg?: string;
    c_node_bg_group?: string;
    c_node_header_bg?: string;
    c_node_header_bg_group?: string;
    c_bg_loop?: string;
    c_bg_group?: string;
    c_editor_bg_color?: string;
    c_editor_grid_color?: string;
    c_editor_axis_color?: string;
    primary: PaletteColor;
    secondary: PaletteColor;
    tertiary: PaletteColorOptions;
    background: { default: string; paper: string };
  }
}

export const paletteDark: PaletteOptions = {
  c_black: "#020202",
  c_bg_comment: "#fff",
  c_brightest: "#FCFCFC",
  c_white: "#FCFCFC",
  c_gray0: "#0E0E0E",
  c_gray1: "#242424",
  c_gray2: "#444444",
  c_gray3: "#6D6D6D",
  c_gray4: "#959595",
  c_gray5: "#BDBDBD",
  c_gray6: "#D9D9D9",
  c_background: "#424854",
  c_node_menu: "#232323",
  c_hl1: "#77b4e6",
  c_hl1_1: "#6d94cc",
  c_hl2: "#719dd9",
  c_selection: "#8EACA777",
  c_input: "#374f4f",
  c_output: "#493f4d",
  c_attention: "#E35BFF",
  c_delete: "#FF2222",
  c_debug: "#FF3355",
  c_error: "#FF5555",
  c_info: "#FFFFFF",
  c_job: "#223399",
  c_node: "#029486",
  c_progress: "#556611",
  c_success: "#50FA7B",
  c_warn: "#FFB86C",
  c_warning: "#FFB86C",
  c_link: "#e4ffde",
  c_link_visited: "#d1e2cd",
  c_scroll_bg: "transparent",
  c_scroll_hover: "#585858",
  c_scroll_thumb: "#535353",
  c_node_bg: "#333",
  c_node_bg_group: "#3d3d3d",
  c_node_header_bg: "#202020",
  c_node_header_bg_group: "#444",
  c_bg_loop: "#305c9d17",
  c_bg_group: "#9bcfdb17",
  c_editor_bg_color: "#111",
  c_editor_grid_color: "#313131",
  c_editor_axis_color: "#292929",

  primary: {
    main: "#77b4e6",
    contrastText: "#000"
  },
  secondary: {
    main: "##5aa3b8",
    contrastText: "#FFFFFF"
  },
  tertiary: {
    light: "#9bc5f0",
    main: "#6ba3e6",
    dark: "#4a7bc4",
    contrastText: "#fff"
  },
  background: {
    default: "#202020",
    paper: "#232323"
  },
  text: {
    primary: "#fff",
    secondary: "#ddd",
    disabled: "#aaa"
  },
  action: {
    active: "#fff",
    hover: "#ddd",
    selected: "#aaa",
    disabled: "#666"
  },
  divider: "#555"
};
