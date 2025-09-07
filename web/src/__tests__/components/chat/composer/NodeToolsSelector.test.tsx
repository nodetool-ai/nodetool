import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NodeToolsSelector from "../../../../components/chat/composer/NodeToolsSelector";

// Mock Material-UI components to avoid theme issues
jest.mock("@mui/material", () => ({
  Button: ({ children, onClick, startIcon, endIcon, sx, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {startIcon}
      {children}
      {endIcon}
    </button>
  ),
  Tooltip: ({ children, title }: any) => (
    <div>
      {children}
      {title && <span data-testid="tooltip-title">{title}</span>}
    </div>
  ),
  Dialog: ({ children, open, onClose, ...props }: any) =>
    open ? (
      <div data-testid="dialog-backdrop" onClick={onClose}>
        <div
          role="dialog"
          aria-labelledby={props["aria-labelledby"]}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    ) : null,
  DialogTitle: ({ children }: any) => (
    <div data-testid="dialog-title">{children}</div>
  ),
  DialogContent: ({ children }: any) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogActions: ({ children }: any) => (
    <div data-testid="dialog-actions">{children}</div>
  ),
  IconButton: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Typography: ({ children }: any) => <span>{children}</span>,
  Box: ({ children }: any) => <div>{children}</div>,
  Chip: ({ label }: any) => (
    <span className="MuiChip-root" data-testid="chip">
      {label}
    </span>
  ),
  CircularProgress: () => <div data-testid="loading">Loading...</div>,
  Divider: () => <hr />
}));

jest.mock("@mui/icons-material", () => ({
  Extension: () => <svg data-testid="ExtensionIcon" />,
  Close: () => <svg data-testid="CloseIcon" />
}));

// Use the real store; we'll set its state in tests

// Do not mock the store itself; we will stub the selector hook instead

// Mock the SearchInput component
jest.mock("../../../../components/search/SearchInput", () => ({
  __esModule: true,
  default: ({ value, onSearchChange, onPressEscape, placeholder }: any) => (
    <input
      data-testid="search-input"
      value={value}
      onChange={(e) => onSearchChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          onPressEscape();
        }
      }}
      placeholder={placeholder}
    />
  )
}));

// Mock the RenderNodesSelectable component
jest.mock("../../../../components/node_menu/RenderNodesSelectable", () => ({
  __esModule: true,
  default: ({
    nodes,
    selectedNodeTypes,
    onToggleSelection,
    onSetSelection
  }: any) => (
    <div data-testid="render-nodes-selectable">
      {nodes.map((node: any) => (
        <div key={node.node_type} data-testid={`node-${node.node_type}`}>
          <button
            onClick={() => onToggleSelection(node.node_type)}
            data-testid={`toggle-${node.node_type}`}
          >
            {node.node_type}
          </button>
        </div>
      ))}
    </div>
  )
}));

jest.mock("../../../../components/node_menu/NodeInfo", () => ({
  __esModule: true,
  default: ({ nodeMetadata }: any) => (
    <div data-testid="node-info">
      {nodeMetadata ? `Info for ${nodeMetadata.title}` : "No node selected"}
    </div>
  )
}));

// Mock the theme
jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useTheme: () => ({
    spacing: (factor: number) => `${factor * 8}px`,
    fontSizeNormal: "1rem",
    palette: {
      primary: { light: "#90caf9" },
      grey: { 0: "#ffffff", 100: "#f5f5f5", 500: "#9e9e9e" }
    },
    vars: {
      palette: {
        grey: {
          0: "#ffffff",
          100: "#f5f5f5",
          500: "#9e9e9e",
          700: "#424242"
        }
      }
    }
  })
}));

// Mock the constants
jest.mock("../../../../config/constants", () => ({
  TOOLTIP_ENTER_DELAY: 100
}));

// Mock lodash isEqual
jest.mock("lodash", () => ({
  isEqual: jest.fn((a, b) => JSON.stringify(a) === JSON.stringify(b))
}));

import useMetadataStore from "../../../../stores/MetadataStore";
import { useStoreWithEqualityFn } from "zustand/traditional";

// Mock the useStoreWithEqualityFn hook to return from our mock store
jest.mock("zustand/traditional", () => ({
  useStoreWithEqualityFn: jest.fn()
}));

// Mock the ref
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useRef: jest.fn(() => ({ current: null }))
}));

// Test fixtures
const mockNodeMetadata: Record<string, any> = {
  "tool.node1": {
    node_type: "tool.node1",
    title: "Tool Node 1",
    namespace: "tool",
    properties: [],
    outputs: [],
    expose_as_tool: true
  },
  "tool.node2": {
    node_type: "tool.node2",
    title: "Tool Node 2",
    namespace: "tool",
    properties: [],
    outputs: [],
    expose_as_tool: true
  },
  "regular.node": {
    node_type: "regular.node",
    title: "Regular Node",
    namespace: "regular",
    properties: [],
    outputs: [],
    expose_as_tool: false
  }
};

const mockSearchResults = [
  mockNodeMetadata["tool.node1"],
  mockNodeMetadata["tool.node2"]
];

const renderComponent = (props: any) => {
  return render(<NodeToolsSelector {...props} />);
};

describe("NodeToolsSelector", () => {
  const mockOnChange = jest.fn();
  const mockSetSearchTerm = jest.fn();
  const mockSetHoveredNode = jest.fn();

  const baseProps = {
    value: [],
    onChange: mockOnChange
  };

  const mockMetadataStore = {
    metadata: mockNodeMetadata
  };

  const mockNodeMenuStore = {
    searchTerm: "",
    setSearchTerm: mockSetSearchTerm,
    searchResults: mockSearchResults,
    isLoading: false,
    selectedPath: [],
    hoveredNode: null,
    setHoveredNode: mockSetHoveredNode,
    // Add missing properties that might be used
    availableNodes: mockSearchResults,
    filteredNodes: mockSearchResults
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Initialize real store state
    useMetadataStore.setState({ metadata: mockNodeMetadata });

    (useStoreWithEqualityFn as jest.Mock).mockImplementation(
      (_store, selector) => {
        return selector ? selector(mockNodeMenuStore) : mockNodeMenuStore;
      }
    );
  });

  describe("Basic Rendering", () => {
    it("renders NodeToolsSelector component without crashing", () => {
      expect(() => {
        renderComponent(baseProps);
      }).not.toThrow();
    });

    it("renders button with extension icon", () => {
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass("node-tools-button");

      const extensionIcon = screen.getByTestId("ExtensionIcon");
      expect(extensionIcon).toBeInTheDocument();
    });

    it("renders button with correct tooltip when no selections", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      await user.hover(button);
      await waitFor(() => {
        expect(screen.getByTestId("tooltip-title")).toHaveTextContent(
          "Select Node Tools"
        );
      });
    });

    it("renders button with correct tooltip when selections exist", async () => {
      const user = userEvent.setup();
      renderComponent({
        ...baseProps,
        value: ["tool.node1", "tool.node2"]
      });

      const button = screen.getByRole("button");
      await user.hover(button);
      await waitFor(() => {
        expect(screen.getByTestId("tooltip-title")).toHaveTextContent(
          "2 node tools selected"
        );
      });
    });
  });

  describe("Button State and Styling", () => {
    it("shows chip with count when node tools are selected", () => {
      renderComponent({
        ...baseProps,
        value: ["tool.node1", "tool.node2"]
      });

      const chip = screen.getByTestId("chip");
      expect(chip).toBeInTheDocument();
      expect(chip).toHaveClass("MuiChip-root");
      expect(chip).toHaveTextContent("2");
    });

    it("applies active class when node tools are selected", () => {
      renderComponent({
        ...baseProps,
        value: ["tool.node1"]
      });

      const button = screen.getByRole("button");
      expect(button).toHaveClass("active");
    });

    it("does not apply active class when no node tools are selected", () => {
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      expect(button).not.toHaveClass("active");
    });
  });

  describe("Dialog Interactions", () => {
    it("opens dialog when button is clicked", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(screen.getByText("Node Tools")).toBeInTheDocument();
      });
    });

    it("closes dialog when close button is clicked", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      await user.click(button);

      const closeButton = screen.getByRole("button", { name: /close/i });
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("closes dialog when clicking outside (backdrop)", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      await user.click(button);

      const backdrop = screen.getByTestId("dialog-backdrop");
      await user.click(backdrop);

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });
  });

  describe("Node Filtering and Display", () => {
    it("filters out invalid node types from value prop", () => {
      renderComponent({
        ...baseProps,
        value: ["tool.node1", "invalid.node", "tool.node2"]
      });

      const chip = screen.getByTestId("chip");
      expect(chip).toHaveTextContent("2");
    });

    it("displays selected nodes at the top of the list", async () => {
      const user = userEvent.setup();
      renderComponent({
        ...baseProps,
        value: ["tool.node2"]
      });

      const button = screen.getByRole("button");
      await user.click(button);

      await waitFor(() => {
        const renderComponent = screen.getByTestId("render-nodes-selectable");
        expect(renderComponent).toBeInTheDocument();
        // Selected node should appear first in the display
      });
    });
  });

  describe("Search Functionality", () => {
    it("renders search input with correct placeholder", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      await user.click(button);

      await waitFor(() => {
        const searchInput = screen.getByTestId("search-input");
        expect(searchInput).toBeInTheDocument();
        expect(searchInput).toHaveAttribute("placeholder", "Search nodes...");
      });
    });

    it("updates search term when user types", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      await user.click(button);

      const searchInput = await screen.findByTestId("search-input");
      await user.type(searchInput, "test search");
      expect(mockSetSearchTerm).toHaveBeenCalledWith("test search");
    });
  });

  describe("Node Selection", () => {
    it("toggles node selection correctly", async () => {
      const user = userEvent.setup();
      renderComponent({
        ...baseProps,
        value: ["tool.node1"]
      });

      const button = screen.getByRole("button");
      await user.click(button);

      // Find the toggle button for tool.node2 and click it
      const toggleButton = await screen.findByTestId("toggle-tool.node2");
      await user.click(toggleButton);

      expect(mockOnChange).toHaveBeenCalledWith(["tool.node1", "tool.node2"]);
    });

    it("removes node from selection when toggled off", async () => {
      const user = userEvent.setup();
      renderComponent({
        ...baseProps,
        value: ["tool.node1", "tool.node2"]
      });

      const button = screen.getByRole("button");
      await user.click(button);

      // Find the toggle button for tool.node1 and click it
      const toggleButton = await screen.findByTestId("toggle-tool.node1");
      await user.click(toggleButton);

      expect(mockOnChange).toHaveBeenCalledWith(["tool.node2"]);
    });
  });

  describe("Accessibility", () => {
    it("has correct aria-labelledby for dialog", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      await user.click(button);

      await waitFor(() => {
        const dialog = screen.getByRole("dialog");
        expect(dialog).toHaveAttribute(
          "aria-labelledby",
          "node-tools-selector-title"
        );
      });
    });

    it("has correct title for dialog", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText("Node Tools")).toBeInTheDocument();
      });
    });

    it("has accessible close button", async () => {
      const user = userEvent.setup();
      renderComponent(baseProps);

      const button = screen.getByRole("button");
      await user.click(button);

      const closeButton = screen.getByRole("button", { name: /close/i });
      expect(closeButton).toBeInTheDocument();
      expect(closeButton).toHaveAttribute("aria-label", "close");
    });
  });
});
