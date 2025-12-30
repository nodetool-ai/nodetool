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
  Dialog: ({ open, children, onClose, ...props }: any) =>
    open ? (
      <div className="MuiDialog-paper" onClick={onClose}>
        <div data-testid="dialog" role="dialog" {...props}>
          {children}
        </div>
      </div>
    ) : null,
  DialogTitle: ({ children, id, ...props }: any) => (
    <div data-testid="dialog-title" id={id} {...props}>
      {children}
    </div>
  ),
  DialogContent: ({ children, ...props }: any) => (
    <div data-testid="dialog-content" {...props}>
      {children}
    </div>
  ),
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
  Divider: (props: any) => <hr data-testid="divider" {...props} />,
  FormControlLabel: ({ control, label, ...props }: any) => (
    <label data-testid="form-control-label" {...props}>
      {control}
      <span>{typeof label === "object" ? label.props.children : label}</span>
    </label>
  ),
  Checkbox: ({ checked, onChange, ...props }: any) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      data-testid="checkbox"
      {...props}
    />
  ),
  IconButton: ({ children, onClick, ...props }: any) => (
    <button
      data-testid="icon-button"
      onClick={onClick}
      aria-label="close"
      {...props}
    >
      {children}
    </button>
  ),
  Tooltip: ({ children, title }: any) => (
    <div title={title}>
      {children}
      <div data-testid="tooltip-content">{title}</div>
    </div>
  )
}));

jest.mock("@mui/icons-material", () => ({
  Folder: () => <span data-testid="folder-icon">📁</span>,
  Close: () => <span data-testid="close-icon">✕</span>,
  CheckBox: () => <span data-testid="checkbox-icon">☑</span>,
  CheckBoxOutlineBlank: () => <span data-testid="checkbox-outline-icon">☐</span>
}));

// Mock the CollectionStore
jest.mock("../../../../stores/CollectionStore", () => ({
  useCollectionStore: jest.fn()
}));

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

  describe("Dialog Interactions", () => {
    it("opens dialog when button is clicked", async () => {
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

    it("closes dialog when close button is clicked", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      // Open dialog
      const button = screen.getByRole("button", {
        name: "Select Collections"
      });
      await user.click(button);

      // Click close button
      const closeButton = screen.getByRole("button", { name: "close" });
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("closes dialog when clicking outside (backdrop)", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      // Open dialog
      const button = screen.getByRole("button", {
        name: "Select Collections"
      });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      // Click on the dialog itself (simulating backdrop click in our mock)
      const dialog = screen.getByRole("dialog");
      await user.click(dialog);

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

      // Open dialog
      const button = screen.getByRole("button");
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText("2 of 3 selected")).toBeInTheDocument();
      });
    });

    it("toggles collection selection correctly", async () => {
      const user = userEvent.setup();
      renderComponent({
        ...baseProps,
        value: ["collection1"]
      });

      // Open dialog
      const button = screen.getByRole("button");
      await user.click(button);

      // Find the checkbox for collection2 and click it
      const collection2Checkbox = screen.getByRole("checkbox", {
        name: /collection2/
      });
      await user.click(collection2Checkbox);

      expect(mockOnChange).toHaveBeenCalledWith(["collection1", "collection2"]);
    });

    it("removes collection from selection when unchecked", async () => {
      const user = userEvent.setup();
      renderComponent({
        ...baseProps,
        value: ["collection1", "collection2"]
      });

      // Open dialog
      const button = screen.getByRole("button");
      await user.click(button);

      // Find the checkbox for collection1 and uncheck it
      const collection1Checkbox = screen.getByRole("checkbox", {
        name: /collection1/
      });
      await user.click(collection1Checkbox);

      expect(mockOnChange).toHaveBeenCalledWith(["collection2"]);
    });

    it("selects all collections when Select All is clicked", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      // Open dialog
      const button = screen.getByRole("button", {
        name: "Select Collections"
      });
      await user.click(button);

      // Click Select All
      const selectAllButton = screen.getByRole("button", {
        name: /Select All/i
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

      // Open dialog
      const button = screen.getByRole("button");
      await user.click(button);

      // Click Clear All
      const clearAllButton = screen.getByRole("button", { name: /Clear All/i });
      await user.click(clearAllButton);

      expect(mockOnChange).toHaveBeenCalledWith([]);
    });
  });

  describe("Accessibility", () => {
    it("has correct aria-labelledby for dialog", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      // Open dialog
      const button = screen.getByRole("button", {
        name: "Select Collections"
      });
      await user.click(button);

      await waitFor(() => {
        const dialog = screen.getByRole("dialog");
        expect(dialog).toHaveAttribute(
          "aria-labelledby",
          "collections-selector-title"
        );
      });
    });

    it("has correct title for dialog", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      // Open dialog
      const button = screen.getByRole("button", {
        name: "Select Collections"
      });
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText("Collections")).toBeInTheDocument();
      });
    });

    it("has accessible close button", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      // Open dialog
      const button = screen.getByRole("button", {
        name: "Select Collections"
      });
      await user.click(button);

      const closeButton = screen.getByRole("button", { name: "close" });
      expect(closeButton).toBeInTheDocument();
      expect(closeButton).toHaveAttribute("aria-label", "close");
    });

    it("renders checkboxes with proper labels", async () => {
      const user = userEvent.setup();
      (useCollectionStore as unknown as jest.Mock).mockReturnValue({
        ...mockStore,
        collections: mockCollections,
        isLoading: false
      });
      renderComponent(baseProps);

      // Open dialog
      const button = screen.getByRole("button", {
        name: "Select Collections"
      });
      await user.click(button);

      await waitFor(() => {
        // Check that checkboxes have proper accessible names
        expect(
          screen.getByRole("checkbox", { name: /collection1/ })
        ).toBeInTheDocument();
        expect(
          screen.getByRole("checkbox", { name: /collection2/ })
        ).toBeInTheDocument();
        expect(
          screen.getByRole("checkbox", { name: /collection3/ })
        ).toBeInTheDocument();
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

      // Open dialog
      const button = screen.getByRole("button");
      await user.click(button);

      await waitFor(() => {
        const collection1Checkbox = screen.getByRole("checkbox", {
          name: /collection1/
        });
        const collection2Checkbox = screen.getByRole("checkbox", {
          name: /collection2/
        });
        const collection3Checkbox = screen.getByRole("checkbox", {
          name: /collection3/
        });

        expect(collection1Checkbox).toBeChecked();
        expect(collection2Checkbox).not.toBeChecked();
        expect(collection3Checkbox).toBeChecked();
      });
    });

    it("handles single collection selection", async () => {
      const user = userEvent.setup();
      renderComponent({
        ...baseProps,
        value: ["collection2"]
      });

      // Open dialog
      const button = screen.getByRole("button");
      await user.click(button);

      await waitFor(() => {
        const collection2Checkbox = screen.getByRole("checkbox", {
          name: /collection2/
        });
        expect(collection2Checkbox).toBeChecked();
      });
    });
  });

  describe("Dialog Styling and Layout", () => {
    it("applies correct dialog styling classes", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      // Open dialog
      const button = screen.getByRole("button", {
        name: "Select Collections"
      });
      await user.click(button);

      await waitFor(() => {
        const dialog = screen.getByRole("dialog");
        expect(dialog).toHaveClass("collections-selector-dialog");
        expect(dialog.parentElement).toHaveClass("MuiDialog-paper");
      });
    });

    it("renders dialog title with correct styling", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      // Open dialog
      const button = screen.getByRole("button", {
        name: "Select Collections"
      });
      await user.click(button);

      await waitFor(() => {
        const title = screen.getByText("Collections");
        expect(title).toHaveClass("MuiTypography-h4");
      });
    });

    it("renders action buttons with correct layout", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      // Open dialog
      const button = screen.getByRole("button", {
        name: "Select Collections"
      });
      await user.click(button);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Select All/i })
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: /Clear All/i })
        ).toBeInTheDocument();
      });
    });
  });
});
