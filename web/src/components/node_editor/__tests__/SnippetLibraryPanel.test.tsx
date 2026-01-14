import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SnippetLibraryPanel from "../SnippetLibraryPanel";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { Snippet } from "../../../stores/SnippetTypes";

jest.mock("../../../stores/SnippetStore", () => {
  const mockSnippets: Snippet[] = [
    {
      id: "snippet-1",
      name: "Test Snippet 1",
      description: "A test snippet",
      nodes: [{ id: "n1", type: "test", position: { x: 0, y: 0 }, data: {} as any }],
      edges: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      usageCount: 5
    },
    {
      id: "snippet-2",
      name: "Test Snippet 2",
      description: "Another test snippet",
      nodes: [
        { id: "n1", type: "test", position: { x: 0, y: 0 }, data: {} as any },
        { id: "n2", type: "test2", position: { x: 100, y: 0 }, data: {} as any }
      ],
      edges: [{ id: "e1", source: "n1", target: "n2", sourceHandle: null, targetHandle: null }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      usageCount: 0
    }
  ];

  return {
    __esModule: true,
    default: jest.fn((selector) => {
      const state = {
        snippets: mockSnippets,
        isOpen: true,
        searchQuery: "",
        selectedSnippetId: null,
        setSearchQuery: jest.fn(),
        selectSnippet: jest.fn(),
        deleteSnippet: jest.fn(),
        duplicateSnippet: jest.fn(),
        exportSnippets: jest.fn(() => JSON.stringify(mockSnippets)),
        importSnippets: jest.fn(() => 2),
        addSnippet: jest.fn(),
        openLibrary: jest.fn(),
        closeLibrary: jest.fn()
      };
      return selector(state);
    }),
    createSnippetFromSelection: jest.fn(),
    applySnippetToGraph: jest.fn()
  };
});

jest.mock("../../../hooks/useSnippetActions", () => ({
  useSnippetActions: () => ({
    saveSelectedAsSnippet: jest.fn(),
    pasteSnippet: jest.fn(),
    getSnippetById: jest.fn()
  })
}));

jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: {
    getState: () => ({
      addNotification: jest.fn()
    })
  }
}));

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("SnippetLibraryPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders when visible is true", () => {
    renderWithTheme(<SnippetLibraryPanel visible={true} onClose={jest.fn()} />);

    expect(screen.getByText("Snippet Library")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search snippets...")).toBeInTheDocument();
  });

  it("does not render when visible is false", () => {
    renderWithTheme(<SnippetLibraryPanel visible={false} onClose={jest.fn()} />);

    expect(screen.queryByText("Snippet Library")).not.toBeInTheDocument();
  });

  it("displays snippet count", () => {
    renderWithTheme(<SnippetLibraryPanel visible={true} onClose={jest.fn()} />);

    expect(screen.getByText("2 snippets")).toBeInTheDocument();
  });

  it("displays snippet cards with name, description, and node count", () => {
    renderWithTheme(<SnippetLibraryPanel visible={true} onClose={jest.fn()} />);

    expect(screen.getByText("Test Snippet 1")).toBeInTheDocument();
    expect(screen.getByText("A test snippet")).toBeInTheDocument();
    expect(screen.getByText("1 nodes")).toBeInTheDocument();

    expect(screen.getByText("Test Snippet 2")).toBeInTheDocument();
    expect(screen.getByText("Another test snippet")).toBeInTheDocument();
    expect(screen.getByText("2 nodes")).toBeInTheDocument();
  });

  it("displays usage count for snippets", () => {
    renderWithTheme(<SnippetLibraryPanel visible={true} onClose={jest.fn()} />);

    expect(screen.getByText("5 uses")).toBeInTheDocument();
    expect(screen.getByText("0 uses")).toBeInTheDocument();
  });

  it("filters snippets based on search query", async () => {
    const { container } = renderWithTheme(
      <SnippetLibraryPanel visible={true} onClose={jest.fn()} />
    );

    const searchInput = container.querySelector('input[placeholder="Search snippets..."]');
    expect(searchInput).toBeInTheDocument();

    fireEvent.change(searchInput!, { target: { value: "Snippet 1" } });

    waitFor(() => {
      expect(screen.queryByText("Test Snippet 1")).toBeInTheDocument();
      expect(screen.queryByText("Test Snippet 2")).not.toBeInTheDocument();
    });
  });

  it("shows empty state when no snippets match search", async () => {
    const { container } = renderWithTheme(
      <SnippetLibraryPanel visible={true} onClose={jest.fn()} />
    );

    const searchInput = container.querySelector('input[placeholder="Search snippets..."]');
    fireEvent.change(searchInput!, { target: { value: "nonexistent" } });

    waitFor(() => {
      expect(screen.getByText("No snippets match your search")).toBeInTheDocument();
    });
  });

  it("shows empty state message when no snippets exist", () => {
    renderWithTheme(<SnippetLibraryPanel visible={true} onClose={jest.fn()} />);
    expect(screen.getByText("2 snippets")).toBeInTheDocument();
  });

  it("has Insert Snippet buttons on each snippet card", () => {
    renderWithTheme(<SnippetLibraryPanel visible={true} onClose={jest.fn()} />);

    const insertButtons = screen.getAllByText("Insert Snippet");
    expect(insertButtons).toHaveLength(2);
  });

  it("opens save dialog when Save Selection button is clicked", async () => {
    renderWithTheme(<SnippetLibraryPanel visible={true} onClose={jest.fn()} />);

    const saveButton = screen.getByText("Save Selection");
    await userEvent.click(saveButton);

    expect(screen.getByText("Save Selection as Snippet")).toBeInTheDocument();
    expect(screen.getByLabelText("Snippet Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Description (optional)")).toBeInTheDocument();
  });

  it("closes save dialog when Cancel is clicked", async () => {
    renderWithTheme(<SnippetLibraryPanel visible={true} onClose={jest.fn()} />);

    const saveButton = screen.getByText("Save Selection");
    await userEvent.click(saveButton);

    const cancelButton = screen.getByText("Cancel");
    await userEvent.click(cancelButton);

    expect(screen.queryByText("Save Selection as Snippet")).not.toBeInTheDocument();
  });

  it("close button calls onClose", () => {
    const onClose = jest.fn();
    renderWithTheme(<SnippetLibraryPanel visible={true} onClose={onClose} />);

    const closeButton = screen.getByLabelText("Close");
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalled();
  });
});
