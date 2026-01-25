import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import QuickShortcutsOverlay from "../QuickShortcutsOverlay";

// Mock theme
const mockTheme = {
  vars: {
    palette: {
      background: { paper: "#1e1e1e" },
      grey: {
        700: "#616161",
        800: "#424242",
        900: "#212121",
        600: "#757575",
        500: "#9e9e9e"
      },
      text: {
        primary: "#fff",
        secondary: "#aaa"
      },
      primary: { main: "#2196f3" }
    },
    rounded: { dialog: "8px" }
  }
} as any;

// Mock shortcuts config
jest.mock("../../../config/shortcuts", () => ({
  NODE_EDITOR_SHORTCUTS: [
    {
      title: "Copy",
      slug: "copy",
      keyCombo: ["Control", "C"],
      category: "editor",
      description: "Copy selected nodes"
    }
  ],
  SHORTCUT_CATEGORIES: {
    editor: "Node Editor",
    workflow: "Workflows",
    panel: "Panels",
    assets: "Asset Viewer"
  },
  expandShortcutsForOS: (shortcuts: any[]) => shortcuts
}));

// Mock platform utils
jest.mock("../../../utils/platform", () => ({
  isMac: () => false
}));

describe("QuickShortcutsOverlay", () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <QuickShortcutsOverlay open={false} onClose={mockOnClose} />
      </ThemeProvider>
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders overlay when open", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <QuickShortcutsOverlay open={true} onClose={mockOnClose} />
      </ThemeProvider>
    );
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
  });

  it("displays search input", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <QuickShortcutsOverlay open={true} onClose={mockOnClose} />
      </ThemeProvider>
    );
    expect(
      screen.getByPlaceholderText("Search shortcuts...")
    ).toBeInTheDocument();
  });
});
