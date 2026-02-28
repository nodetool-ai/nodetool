import { PaletteOptions } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface PaletteOptions {
    c_bg_comment?: string;
    c_brightest?: string;
    c_black?: string;
    c_white?: string;
    c_background?: string;
    c_node_menu?: string;
    c_selection?: string;
    c_input?: string;
    c_output?: string;
    c_attention?: string;
    c_delete?: string;
    c_debug?: string;
    c_job?: string;
    c_node?: string;
    c_folder?: string;
    c_progress?: string;
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
    c_selection_rect?: string;
    c_provider_api?: string;
    c_provider_local?: string;
    c_provider_hf?: string;
    c_app_header?: string;
    c_tabs_header?: string;

    // Provider badge colors
    providerApi?: string;
    providerLocal?: string;
    providerHf?: string;

    background?: { default?: string; paper?: string };
    Paper?: {
      default?: string;
      paper?: string;
      overlay?: string;
    };
    glass?: {
      blur?: string;
      backgroundDialog?: string;
      backgroundDialogContent?: string;
    };
    rounded?: {
      dialog?: string;
      node?: string;
      buttonSmall?: string;
      buttonLarge?: string;
    };
  }

  interface Palette {
    c_black?: string;
    c_bg_comment?: string;
    c_brightest?: string;
    c_white?: string;
    c_background?: string;
    c_node_menu?: string;
    c_selection?: string;
    c_input?: string;
    c_output?: string;
    c_attention?: string;
    c_delete?: string;
    c_debug?: string;
    c_job?: string;
    c_node?: string;
    c_folder?: string;
    c_progress?: string;
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
    c_selection_rect?: string;
    c_provider_api?: string;
    c_provider_local?: string;
    c_provider_hf?: string;
    c_app_header?: string;
    c_tabs_header?: string;

    // Provider badge colors
    providerApi?: string;
    providerLocal?: string;
    providerHf?: string;

    background: { default: string; paper: string };
    Paper: {
      default: string;
      paper: string;
      overlay: string;
    };
    glass: {
      blur: string;
      backgroundDialog: string;
      backgroundDialogContent: string;
    };
    rounded: {
      dialog: string;
      node: string;
      buttonSmall: string;
      buttonLarge: string;
    };
  }
}

export const paletteDark: PaletteOptions = {
  error: {
    main: "#FF5555",
    light: "#FF8A80",
    dark: "#C62828",
    contrastText: "#fff"
  },
  warning: {
    main: "#FFB86C",
    light: "#FFD591",
    dark: "#FF9800",
    contrastText: "#000"
  },
  info: {
    main: "#22D3EE",
    light: "#67E8F9",
    dark: "#0891B2",
    contrastText: "#03181D"
  },
  success: {
    main: "#50FA7B",
    light: "#80E27E",
    dark: "#229A16",
    contrastText: "#000"
  },
  grey: ((): any => ({
    0: "#fff", // white
    50: "#F5F5F5", // Standard MUI light grey
    100: "#D9D9D9", // from c_gray6
    200: "#BDBDBD", // from c_gray5
    300: "#A9A9A9", // spare
    400: "#959595", // from c_gray4
    500: "#6D6D6D", // from c_gray3
    600: "#444444", // from c_gray2
    700: "#333333", // spare
    800: "#242424", // from c_gray1
    900: "#0E0E0E", // from c_gray0
    1000: "#000" // black
  }))(),
  c_black: "#020202",
  c_bg_comment: "#0F1115",
  c_brightest: "#FCFCFC",
  c_white: "#FCFCFC",
  c_background: "#424854",
  c_node_menu: "#232323",
  c_selection: "#8EACA777",
  c_input: "#374f4f",
  c_output: "#493f4d",
  c_attention: "#E35BFF",
  c_delete: "#FF2222",
  c_debug: "#FF3355",
  c_job: "#223399",
  c_node: "#029486",
  c_folder: "#d6ae67",
  c_progress: "#556611",
  c_link: "#93C5FD",
  c_link_visited: "#A5B4FC",
  c_scroll_bg: "transparent",
  c_scroll_hover: "#585858",
  c_scroll_thumb: "#535353",
  c_node_bg: "#1E1E1E",
  c_node_bg_group: "#252525",
  c_node_header_bg: "#161616",
  c_node_header_bg_group: "#2A2A2A",
  c_bg_loop: "#2563EB22",
  c_bg_group: "#A1A4AD30",
  c_editor_bg_color: "#1f2121",
  c_editor_grid_color: "#373737",
  c_editor_axis_color: "#2A2A2A",
  c_selection_rect: "#cdcdcd33",
  c_provider_api: "#93C5FD",
  c_provider_local: "#86EFAC",
  c_provider_hf: "#C4B5FD",
  c_app_header: "#111111",
  c_tabs_header: "#1E1E1E",

  primary: {
    main: "#5f8ac8",
    light: "#6293d9",
    dark: "#365e98",
    contrastText: "#fff"
  },
  secondary: {
    main: "#E879F9",
    light: "#F5D0FE",
    dark: "#C026D3",
    contrastText: "#0B1220"
  },
  background: {
    default: "#2e2d2d",
    paper: "rgba(20, 20, 20, 0.95)"
  },
  text: {
    primary: "#FFFFFF",
    secondary: "#B9B9B4",
    disabled: "rgba(255, 255, 255, 0.4)"
  },
  action: {
    // Icons, enabled interactive elements, "on" state indicators
    active: "#fff",

    // Background when hovering over clickable items
    hover: "rgba(255, 255, 255, 0.02)",
    hoverOpacity: 0.02,

    // Background for selected list items, active nav items
    selected: "rgba(255, 255, 255, 0.05)",
    selectedOpacity: 0.05,

    // Text color for disabled buttons, form fields, icons
    disabled: "rgba(255, 255, 255, 0.3)",
    disabledOpacity: 0.38,

    // Background color for disabled buttons, form controls
    disabledBackground: "rgba(255, 255, 255, 0.1)",

    // Focus ring color, keyboard navigation indicators
    focus: "rgba(255, 255, 255, 0.12)",
    focusOpacity: 0.12,

    // Higher emphasis than selected (used for activated states)
    activatedOpacity: 0.24
  },
  Paper: {
    default: "#1a1a1a",
    paper: "#1a1a1a",
    overlay: "#222222"
  },
  divider: "rgba(255, 255, 255, 0.08)",
  glass: {
    blur: "blur(16px) saturate(180%)",
    backgroundDialog: "rgba(0, 0, 0, 0.2)",
    backgroundDialogContent: "rgba(0, 0, 0, 0.6)"
  }
};
