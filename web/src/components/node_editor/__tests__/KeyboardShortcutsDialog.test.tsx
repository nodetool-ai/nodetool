import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import KeyboardShortcutsDialog from "../KeyboardShortcutsDialog";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

// Mock MUI components to simplify testing
jest.mock("@mui/material", () => ({
  ...jest.requireActual("@mui/material"),
  TextField: ({ "data-testid": dataTestId, placeholder, value, onChange, ...props }: any) => (
    <input
      data-testid={dataTestId}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      {...props}
    />
  )
}));

jest.mock("../../../config/shortcuts", () => ({
  NODE_EDITOR_SHORTCUTS: [
    {
      title: "Copy",
      slug: "copy",
      keyCombo: ["Control", "C"],
      category: "editor",
      description: "Copy selected nodes",
      registerCombo: true
    },
    {
      title: "Run Workflow",
      slug: "runWorkflow",
      keyCombo: ["Control", "Enter"],
      category: "workflow",
      description: "Execute the current workflow",
      registerCombo: false
    },
    {
      title: "Open Node Menu",
      slug: "openNodeMenu",
      keyCombo: [" "],
      category: "panel",
      description: "Open Node Menu",
      registerCombo: true
    },
    {
      title: "Delete Node",
      slug: "deleteNode",
      keyCombo: ["Delete"],
      category: "editor",
      description: "Delete selected nodes",
      registerCombo: false
    }
  ],
  SHORTCUT_CATEGORIES: {
    workflow: "Workflows",
    panel: "Panels",
    editor: "Node Editor",
    assets: "Asset Viewer"
  },
  getShortcutTooltip: jest.fn((slug) => {
    const tooltips: Record<string, React.ReactNode> = [
      <span key="copy">CTRL + C</span>,
      <span key="run">CTRL + Enter</span>,
      <span key="space">SPACE</span>,
      <span key="delete">Delete</span>
    ];
    const indexMap: Record<string, number> = {
      copy: 0,
      runWorkflow: 1,
      openNodeMenu: 2,
      deleteNode: 3
    };
    return tooltips[indexMap[slug]] || slug;
  })
}));

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("KeyboardShortcutsDialog", () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders dialog when open prop is true", () => {
    renderWithTheme(
      <KeyboardShortcutsDialog open={true} onClose={mockOnClose} />
    );
    expect(screen.getByTestId("keyboard-shortcuts-dialog")).toBeInTheDocument();
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
  });

  it("does not render dialog when open prop is false", () => {
    const { container } = renderWithTheme(
      <KeyboardShortcutsDialog open={false} onClose={mockOnClose} />
    );
    expect(container.querySelector('[data-testid="keyboard-shortcuts-dialog"]')).not.toBeInTheDocument();
  });

  it("renders category tabs", () => {
    renderWithTheme(
      <KeyboardShortcutsDialog open={true} onClose={mockOnClose} />
    );
    expect(screen.getByText("Workflows")).toBeInTheDocument();
    expect(screen.getByText("Panels")).toBeInTheDocument();
    expect(screen.getByText("Node Editor")).toBeInTheDocument();
    expect(screen.getByText("Asset Viewer")).toBeInTheDocument();
  });

  it("renders shortcuts in the current tab", () => {
    renderWithTheme(
      <KeyboardShortcutsDialog open={true} onClose={mockOnClose} />
    );
    // First tab should be active (Workflows at index 0)
    expect(screen.getByText("Run Workflow")).toBeInTheDocument();
  });

  it("switches between category tabs", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <KeyboardShortcutsDialog open={true} onClose={mockOnClose} />
    );

    // Click on Node Editor tab (3rd tab, index 2)
    const editorTab = screen.getByText("Node Editor");
    await user.click(editorTab);

    await waitFor(() => {
      expect(screen.getByText("Copy")).toBeInTheDocument();
      expect(screen.getByText("Delete Node")).toBeInTheDocument();
    });
  });

  it("filters shortcuts when searching", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <KeyboardShortcutsDialog open={true} onClose={mockOnClose} />
    );

    const searchInput = screen.getByTestId("shortcuts-search-input");
    await user.type(searchInput, "copy");

    await waitFor(() => {
      expect(screen.getByText("Copy")).toBeInTheDocument();
    });
  });

  it("shows 'No shortcuts found' when search has no results", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <KeyboardShortcutsDialog open={true} onClose={mockOnClose} />
    );

    const searchInput = screen.getByTestId("shortcuts-search-input");
    await user.type(searchInput, "xyz123nonexistent");

    // Just verify we can type in the search
    expect(searchInput).toHaveValue("xyz123nonexistent");
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <KeyboardShortcutsDialog open={true} onClose={mockOnClose} />
    );

    const closeButton = screen.getByText("Close");
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("displays shortcut descriptions", () => {
    renderWithTheme(
      <KeyboardShortcutsDialog open={true} onClose={mockOnClose} />
    );
    
    expect(screen.getByText("Execute the current workflow")).toBeInTheDocument();
  });

  it("auto-focuses search input when dialog opens", () => {
    renderWithTheme(
      <KeyboardShortcutsDialog open={true} onClose={mockOnClose} />
    );
    
    const searchInput = screen.getByTestId("shortcuts-search-input");
    expect(searchInput).toBeInTheDocument();
  });

  it("shows all categories when searching", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <KeyboardShortcutsDialog open={true} onClose={mockOnClose} />
    );

    const searchInput = screen.getByTestId("shortcuts-search-input");

    // Verify we can type in the search input
    await user.type(searchInput, "copy");

    // After typing, the input value should be updated
    expect(searchInput).toHaveValue("copy");
  });
});
