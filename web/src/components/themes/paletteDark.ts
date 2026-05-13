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
  grey: ((): Record<number, string> => ({
    0: "#fff", // white
    50: "#F2F3F5",
    100: "#D4D6DB",
    200: "#B4B7BD",
    300: "#9CA0A8",
    400: "#808590",
    500: "#5C606A",
    600: "#3A3D44",
    700: "#27292E",
    800: "#1B1D21",
    900: "#0A0B0D",
    1000: "#000" // black
  }))(),
  c_black: "#020202",
  c_bg_comment: "#08090A",
  c_brightest: "#FCFCFC",
  c_white: "#FCFCFC",
  c_background: "#3A3D44",
  c_node_menu: "#17181B",
  c_selection: "#8EACA777",
  c_input: "#2e4a4e",
  c_output: "#3e3448",
  c_attention: "#E35BFF",
  c_delete: "#FF2222",
  c_debug: "#FF3355",
  c_job: "#2838a8",
  c_node: "#029486",
  c_folder: "#d6ae67",
  c_progress: "#556611",
  c_link: "#93C5FD",
  c_link_visited: "#A5B4FC",
  c_scroll_bg: "transparent",
  c_scroll_hover: "#3A3D44",
  c_scroll_thumb: "#27292E",
  c_node_bg: "#1B1D21",
  c_node_bg_group: "#22252A",
  c_node_header_bg: "#141518",
  c_node_header_bg_group: "#2A2D33",
  c_bg_loop: "#2563EB22",
  c_bg_group: "#A0A0A030",
  c_editor_bg_color: "#08090A",
  c_editor_grid_color: "#1F2126",
  c_editor_axis_color: "#17181B",
  c_selection_rect: "#cdcdcd33",
  c_provider_api: "#93C5FD",
  c_provider_local: "#86EFAC",
  c_provider_hf: "#C4B5FD",
  c_app_header: "#0A0B0D",
  c_tabs_header: "#101113",

  primary: {
    main: "#6690d4",
    light: "#7aa0e2",
    dark: "#3d68a8",
    contrastText: "#fff"
  },
  secondary: {
    main: "#E879F9",
    light: "#F5D0FE",
    dark: "#C026D3",
    contrastText: "#0B1220"
  },
  background: {
    default: "#08090A",
    paper: "#101113"
  },
  text: {
    primary: "#F7F8F8",
    secondary: "#8A8F98",
    disabled: "rgba(247, 248, 248, 0.38)"
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
    default: "#101113",
    paper: "#101113",
    overlay: "#17181B"
  },
  divider: "rgba(255, 255, 255, 0.08)",
  glass: {
    blur: "blur(16px) saturate(180%)",
    backgroundDialog: "rgba(0, 0, 0, 0.2)",
    backgroundDialogContent: "rgba(0, 0, 0, 0.6)"
  }
};
