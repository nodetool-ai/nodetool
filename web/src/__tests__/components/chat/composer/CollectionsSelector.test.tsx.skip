import React from "react";
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CollectionsSelector from "../../../../components/chat/composer/CollectionsSelector";

// Mock Material-UI components to avoid theme issues
jest.mock("@mui/material", () => ({
  Button: ({
    children,
    onClick,
    startIcon,
    endIcon,
    sx,
    className,
    ...props
  }: any) => (
    <button onClick={onClick} className={className} {...props}>
      {startIcon && <span data-testid="start-icon">{startIcon}</span>}
      {children || "Select Collections"}
      {endIcon && <span data-testid="end-icon">{endIcon}</span>}
    </button>
  ),
  Chip: ({ label }: any) => (
    <span data-testid="chip" className="MuiChip-root">
      {label}
    </span>
  ),
  Popover: ({ open, children, onClose, anchorEl, ...props }: any) =>
    open ? (
      <div className="MuiPopover-paper" data-testid="popover-backdrop" onClick={onClose}>
        <div data-testid="popover" role="dialog" onClick={(e: any) => e.stopPropagation()} {...props}>
          {children}
        </div>
      </div>
    ) : null,
  Typography: ({ children, variant, ...props }: any) => (
    <div
      data-testid={`typography-${variant || "body"}`}
      className={`MuiTypography-${variant || "body"}`}
      {...props}
    >
      {children}
    </div>
  ),
  Box: ({ children, ...props }: any) => (
    <div data-testid="box" {...props}>
      {children}
    </div>
  ),
  Checkbox: ({ checked, onChange, onClick, ...props }: any) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={onClick}
      data-testid="checkbox"
      {...props}
    />
  ),
  Tooltip: ({ children, title }: any) => (
    <div title={title}>
      {children}
      <div data-testid="tooltip-content">{title}</div>
    </div>
  )
}));

jest.mock("@mui/icons-material", () => ({
  Folder: () => <span data-testid="folder-icon">📁</span>
}));

// Mock useTheme
jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useTheme: () => ({
    spacing: (factor: number) => `${factor * 8}px`,
    vars: {
      palette: {
        primary: { main: "#1976d2" },
        common: { white: "#fff" },
        grey: { 0: "#ffffff", 500: "#9e9e9e" },
        text: { primary: "#000", secondary: "#666" },
        action: { hover: "#f5f5f5", selected: "#e0e0e0" },
        background: { paper: "#fff", default: "#fafafa" },
        divider: "#e0e0e0"
      },
      rounded: { dialog: "8px" }
    }
  })
}));

// Mock the CollectionStore
jest.mock("../../../../stores/CollectionStore", () => {
  const mockStore = {
    collections: {
      collections: null
    },
    isLoading: false,
    fetchCollections: jest.fn(),
    setCollections: jest.fn(),
    setIsLoading: jest.fn(),
    setError: jest.fn(),
    setDeleteTarget: jest.fn(),
    setShowForm: jest.fn(),
    setDragOverCollection: jest.fn(),
    setIndexProgress: jest.fn(),
    setIndexErrors: jest.fn(),
    setSelectedCollections: jest.fn(),
    deleteCollection: jest.fn(),
    confirmDelete: jest.fn(),
    cancelDelete: jest.fn(),
    handleDragOver: jest.fn(),
    handleDragLeave: jest.fn(),
    handleDrop: jest.fn()
  };

  return {
    __esModule: true,
    default: jest.fn((selector) => {
      if (typeof selector === 'function') {
        return selector(mockStore);
      }
      return mockStore;
    }),
    useCollectionStore: jest.fn((selector) => {
      if (typeof selector === 'function') {
        return selector(mockStore);
      }
      return mockStore;
    })
  };
});

// Mock the constants
jest.mock("../../../../config/constants", () => ({
  TOOLTIP_ENTER_DELAY: 100
}));

import { useCollectionStore } from "../../../../stores/CollectionStore";

// Test fixtures
const mockCollections = {
  collections: [
    { name: "collection1", count: 5 },
    { name: "collection2", count: 10 },
    { name: "collection3", count: 0 }
  ]
};

const mockEmptyCollections = {
  collections: []
};

const renderComponent = (props: any) => {
  return render(<CollectionsSelector {...props} />);
};

describe("CollectionsSelector", () => {
  const mockOnChange = jest.fn();
  const mockFetchCollections = jest.fn();

  const baseProps = {
    value: [],
    onChange: mockOnChange
  };

  const mockStore = {
    collections: null,
    isLoading: false,
    fetchCollections: mockFetchCollections,
    setCollections: jest.fn(),
    setIsLoading: jest.fn(),
    setError: jest.fn(),
    setDeleteTarget: jest.fn(),
    setShowForm: jest.fn(),
    setDragOverCollection: jest.fn(),
    setIndexProgress: jest.fn(),
    setIndexErrors: jest.fn(),
    setSelectedCollections: jest.fn(),
    deleteCollection: jest.fn(),
    confirmDelete: jest.fn(),
    cancelDelete: jest.fn(),
    handleDragOver: jest.fn(),
    handleDragLeave: jest.fn(),
    handleDrop: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useCollectionStore as unknown as jest.Mock).mockReturnValue(mockStore);
  });

  describe("Basic Rendering", () => {
    it("renders CollectionsSelector component without crashing", () => {
      expect(() => {
        renderComponent(baseProps);
      }).not.toThrow();
    });

    it("renders button with folder icon", () => {
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();

      const tooltip = screen.getByTitle("Select Collections");
      expect(tooltip).toBeInTheDocument();
      expect(button).toHaveClass("collections-button");

      // Check for folder icon
      const folderIcon = screen.getByTestId("FolderIcon");
      expect(folderIcon).toBeInTheDocument();
    });

    it("renders button with correct tooltip when no selections", () => {
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();

      // Check that the tooltip wrapper has the correct title
      const tooltip = screen.getByTitle("Select Collections");
      expect(tooltip).toBeInTheDocument();
    });

    it("renders button with correct tooltip when selections exist", async () => {
      const user = userEvent.setup();
      renderComponent({
        ...baseProps,
        value: ["collection1", "collection2"]
      });

      const button = screen.getByRole("button");

      // Hover to show tooltip
      await user.hover(button);

      await waitFor(() => {
        expect(screen.getByText("2 collections selected")).toBeInTheDocument();
      });
    });
  });

  describe("Button State and Styling", () => {
    it("shows chip with count when collections are selected", () => {
      renderComponent({
        ...baseProps,
        value: ["collection1", "collection2", "collection3"]
      });

      const chip = screen.getByText("3");
      expect(chip).toBeInTheDocument();
      expect(chip).toHaveClass("MuiChip-root");
    });

    it("applies active class when collections are selected", () => {
      renderComponent({
        ...baseProps,
        value: ["collection1"]
      });

      const button = screen.getByRole("button");
      expect(button).toHaveClass("active");
    });

    it("does not apply active class when no collections are selected", () => {
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      expect(button).not.toHaveClass("active");
    });
  });

  describe("Popover Interactions", () => {
    it("opens popover when button is clicked", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      const button = screen.getByRole("button", {
        name: "Select Collections"
      });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(screen.getByText("Collections")).toBeInTheDocument();
      });
    });

    it("closes popover when clicking outside (backdrop)", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      // Open popover
      const button = screen.getByRole("button", {
        name: "Select Collections"
      });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      // Click on the backdrop
      const backdrop = screen.getByTestId("popover-backdrop");
      await user.click(backdrop);

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });
  });

  describe("Collection Data Loading", () => {
    it("fetches collections on mount when collections is null", () => {
      renderComponent(baseProps);

      expect(mockFetchCollections).toHaveBeenCalledTimes(1);
    });

    it("does not fetch collections when collections already exist", () => {
      (useCollectionStore as unknown as jest.Mock).mockReturnValue({
        ...mockStore,
        collections: mockCollections
      });

      renderComponent(baseProps);

      expect(mockFetchCollections).not.toHaveBeenCalled();
    });

    it("shows loading state when isLoading is true", async () => {
      const user = userEvent.setup();
      (useCollectionStore as unknown as jest.Mock).mockReturnValue({
        ...mockStore,
        collections: mockCollections,
        isLoading: true
      });

      renderComponent(baseProps);

      // Open dialog
      const button = screen.getByRole("button", { name: "Select Collections" });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText("Loading collections...")).toBeInTheDocument();
      });
    });

    it("shows empty message when no collections available", async () => {
      const user = userEvent.setup();
      (useCollectionStore as unknown as jest.Mock).mockReturnValue({
        ...mockStore,
        collections: mockEmptyCollections,
        isLoading: false
      });

      renderComponent(baseProps);

      // Open dialog
      const button = screen.getByRole("button", { name: "Select Collections" });
      await user.click(button);

      await waitFor(() => {
        expect(
          screen.getByText("No collections available")
        ).toBeInTheDocument();
      });
    });
  });

  describe("Collection Selection", () => {
    beforeEach(() => {
      (useCollectionStore as unknown as jest.Mock).mockReturnValue({
        ...mockStore,
        collections: mockCollections,
        isLoading: false
      });
    });

    it("displays collections with correct information", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      // Open dialog
      const button = screen.getByRole("button", {
        name: "Select Collections"
      });
      await user.click(button);

      // Check collection items
      await waitFor(() => {
        expect(screen.getByText("collection1")).toBeInTheDocument();
        expect(screen.getByText("5 items")).toBeInTheDocument();
        expect(screen.getByText("collection2")).toBeInTheDocument();
        expect(screen.getByText("10 items")).toBeInTheDocument();
        expect(screen.getByText("collection3")).toBeInTheDocument();
        expect(screen.getByText("0 items")).toBeInTheDocument();
      });
    });

    it("shows correct selection summary", async () => {
      const user = userEvent.setup();
      renderComponent({
        ...baseProps,
        value: ["collection1", "collection2"]
      });

      // Open popover
      const button = screen.getByRole("button");
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText("2/3")).toBeInTheDocument();
      });
    });

    it("toggles collection selection correctly", async () => {
      const user = userEvent.setup();
      renderComponent({
        ...baseProps,
        value: ["collection1"]
      });

      // Open popover
      const button = screen.getByRole("button");
      await user.click(button);

      // Find the collection2 item and click it
      const collection2Text = await screen.findByText("collection2");
      await user.click(collection2Text);

      expect(mockOnChange).toHaveBeenCalledWith(["collection1", "collection2"]);
    });

    it("removes collection from selection when unchecked", async () => {
      const user = userEvent.setup();
      renderComponent({
        ...baseProps,
        value: ["collection1", "collection2"]
      });

      // Open popover
      const button = screen.getByRole("button");
      await user.click(button);

      // Find collection1 text and click it
      const collection1Text = await screen.findByText("collection1");
      await user.click(collection1Text);

      expect(mockOnChange).toHaveBeenCalledWith(["collection2"]);
    });

    it("selects all collections when All button is clicked", async () => {
      const user = userEvent.setup();
      (useCollectionStore as unknown as jest.Mock).mockReturnValue({
        ...mockStore,
        collections: mockCollections
      });
      renderComponent(baseProps);

      // Open popover
      const button = screen.getByRole("button", {
        name: "Select Collections"
      });
      await user.click(button);

      // Click All button
      const selectAllButton = screen.getByRole("button", {
        name: /All/i
      });
      await user.click(selectAllButton);

      expect(mockOnChange).toHaveBeenCalledWith([
        "collection1",
        "collection2",
        "collection3"
      ]);
    });

    it("clears all selections when Clear All is clicked", async () => {
      const user = userEvent.setup();
      renderComponent({
        ...baseProps,
        value: ["collection1", "collection2"]
      });

      // Open popover
      const button = screen.getByRole("button");
      await user.click(button);

      // Click Clear button
      const clearAllButton = screen.getByRole("button", { name: /Clear/i });
      await user.click(clearAllButton);

      expect(mockOnChange).toHaveBeenCalledWith([]);
    });
  });

  describe("Accessibility", () => {
    it("has correct title for popover", async () => {
      const user = userEvent.setup();
      (useCollectionStore as unknown as jest.Mock).mockReturnValue({
        ...mockStore,
        collections: mockCollections
      });
      renderComponent(baseProps);

      // Open popover
      const button = screen.getByRole("button", {
        name: "Select Collections"
      });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText("Collections")).toBeInTheDocument();
      });
    });

    it("renders checkboxes", async () => {
      const user = userEvent.setup();
      (useCollectionStore as unknown as jest.Mock).mockReturnValue({
        ...mockStore,
        collections: mockCollections
      });
      renderComponent(baseProps);

      // Open popover
      const button = screen.getByRole("button", {
        name: "Select Collections"
      });
      await user.click(button);

      await waitFor(() => {
        // Check that checkboxes exist
        const checkboxes = screen.getAllByRole("checkbox");
        expect(checkboxes.length).toBe(3);
      });
    });
  });

  describe("Pre-selected Values", () => {
    beforeEach(() => {
      (useCollectionStore as unknown as jest.Mock).mockReturnValue({
        ...mockStore,
        collections: mockCollections,
        isLoading: false
      });
    });

    it("shows pre-selected collections as checked", async () => {
      const user = userEvent.setup();
      renderComponent({
        ...baseProps,
        value: ["collection1", "collection3"]
      });

      // Open popover
      const button = screen.getByRole("button");
      await user.click(button);

      await waitFor(() => {
        const checkboxes = screen.getAllByRole("checkbox");
        expect(checkboxes[0]).toBeChecked();
        expect(checkboxes[1]).not.toBeChecked();
        expect(checkboxes[2]).toBeChecked();
      });
    });

    it("handles single collection selection", async () => {
      const user = userEvent.setup();
      renderComponent({
        ...baseProps,
        value: ["collection2"]
      });

      // Open popover
      const button = screen.getByRole("button");
      await user.click(button);

      await waitFor(() => {
        const checkboxes = screen.getAllByRole("checkbox");
        expect(checkboxes[1]).toBeChecked();
      });
    });
  });

  describe("Popover Styling and Layout", () => {
    it("renders popover with correct structure", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      // Open popover
      const button = screen.getByRole("button", {
        name: "Select Collections"
      });
      await user.click(button);

      await waitFor(() => {
        const popover = screen.getByTestId("popover");
        expect(popover).toBeInTheDocument();
      });
    });

    it("renders title with correct styling", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      // Open popover
      const button = screen.getByRole("button", {
        name: "Select Collections"
      });
      await user.click(button);

      await waitFor(() => {
        const title = screen.getByText("Collections");
        expect(title).toHaveClass("MuiTypography-subtitle2");
      });
    });

    it("renders action buttons with correct layout", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      // Open popover
      const button = screen.getByRole("button", {
        name: "Select Collections"
      });
      await user.click(button);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /All/i })
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: /Clear/i })
        ).toBeInTheDocument();
      });
    });
  });
});
