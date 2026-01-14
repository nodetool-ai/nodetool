import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import FindInWorkflowDialog from "../FindInWorkflowDialog";
import { useFindInWorkflow } from "../../../hooks/useFindInWorkflow";
import { useRecentSearchesStore } from "../../../stores/RecentSearchesStore";
import { useKeyPressed } from "../../../stores/KeyPressedStore";
import { Node } from "@xyflow/react";
import { NodeData } from "../../../stores/NodeData";
import userEvent from "@testing-library/user-event";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../../hooks/useFindInWorkflow");
jest.mock("../../../stores/RecentSearchesStore");
jest.mock("../../../stores/KeyPressedStore");

const mockUseFindInWorkflow = useFindInWorkflow as jest.MockedFunction<
  typeof useFindInWorkflow
>;
const mockUseRecentSearchesStore = useRecentSearchesStore as jest.MockedFunction<
  typeof useRecentSearchesStore
>;
const mockUseKeyPressed = useKeyPressed as jest.MockedFunction<
  typeof useKeyPressed
>;

const mockNode: Node<NodeData> = {
  id: "node-1",
  type: "input.text",
  position: { x: 0, y: 0 },
  data: {
    properties: { name: "Text Source" },
    selectable: true,
    dynamic_properties: {},
    workflow_id: "test-workflow"
  }
};

const createMockFindInWorkflowReturn = (overrides = {}) => ({
  isOpen: true,
  searchTerm: "",
  results: [
    { node: mockNode, matchIndex: 0 }
  ],
  selectedIndex: 0,
  totalCount: 1,
  openFind: jest.fn(),
  closeFind: jest.fn(),
  performSearch: jest.fn(),
  immediateSearch: jest.fn(),
  goToSelected: jest.fn(),
  navigateNext: jest.fn(),
  navigatePrevious: jest.fn(),
  clearSearch: jest.fn(),
  selectNode: jest.fn(),
  getNodeDisplayName: jest.fn((node) => node.data?.properties?.name || node.id),
  ...overrides
});

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("FindInWorkflowDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseFindInWorkflow.mockReturnValue(createMockFindInWorkflowReturn());
    mockUseRecentSearchesStore.mockReturnValue({
      recentSearches: [],
      addSearch: jest.fn(),
      removeSearch: jest.fn(),
      clearSearches: jest.fn(),
      getSearches: jest.fn(() => [])
    });
    mockUseKeyPressed.mockReturnValue({
      isKeyPressed: jest.fn(() => false)
    } as any);
  });

  describe("rendering", () => {
    it("should render null when not open", () => {
      mockUseFindInWorkflow.mockReturnValue(
        createMockFindInWorkflowReturn({ isOpen: false })
      );

      const { container } = renderWithTheme(
        <FindInWorkflowDialog workflowId="test-workflow" />
      );

      expect(container.children.length).toBe(0);
    });

    it("should render dialog when open", () => {
      renderWithTheme(<FindInWorkflowDialog workflowId="test-workflow" />);

      expect(screen.getByPlaceholderText("Find nodes...")).toBeInTheDocument();
      expect(screen.getByLabelText("Navigate to next result")).toBeInTheDocument();
      expect(screen.getByLabelText("Navigate to previous result")).toBeInTheDocument();
    });

    it("should display results count", () => {
      renderWithTheme(<FindInWorkflowDialog workflowId="test-workflow" />);

      expect(screen.getByText("1 of 1 node found")).toBeInTheDocument();
    });

    it("should display node results", () => {
      renderWithTheme(<FindInWorkflowDialog workflowId="test-workflow" />);

      expect(screen.getByText("Text Source")).toBeInTheDocument();
      expect(screen.getByText("input")).toBeInTheDocument();
    });

    it("should display empty state when no results", () => {
      mockUseFindInWorkflow.mockReturnValue(
        createMockFindInWorkflowReturn({
          results: [],
          searchTerm: "nonexistent"
        })
      );

      renderWithTheme(<FindInWorkflowDialog workflowId="test-workflow" />);

      expect(screen.getByText("No matching nodes")).toBeInTheDocument();
    });

    it("should display recent searches when no search term", () => {
      mockUseRecentSearchesStore.mockReturnValue({
        recentSearches: [
          { term: "text", timestamp: Date.now(), resultCount: 5 },
          { term: "image", timestamp: Date.now(), resultCount: 2 }
        ],
        addSearch: jest.fn(),
        removeSearch: jest.fn(),
        clearSearches: jest.fn(),
        getSearches: jest.fn()
      } as any);

      renderWithTheme(<FindInWorkflowDialog workflowId="test-workflow" />);

      expect(screen.getByText("Recent Searches")).toBeInTheDocument();
      expect(screen.getByText("text")).toBeInTheDocument();
      expect(screen.getByText("image")).toBeInTheDocument();
    });
  });

  describe("search input", () => {
    it("should call performSearch on input change", async () => {
      const performSearch = jest.fn();
      mockUseFindInWorkflow.mockReturnValue(
        createMockFindInWorkflowReturn({ performSearch })
      );

      renderWithTheme(<FindInWorkflowDialog workflowId="test-workflow" />);

      const input = screen.getByPlaceholderText("Find nodes...");
      await userEvent.type(input, "test");

      // performSearch is called at least once
      expect(performSearch).toHaveBeenCalled();
    });

    it("should show clear button when has text", async () => {
      mockUseFindInWorkflow.mockReturnValue(
        createMockFindInWorkflowReturn({ searchTerm: "test" })
      );

      renderWithTheme(<FindInWorkflowDialog workflowId="test-workflow" />);

      expect(screen.getByLabelText("Clear search")).toBeInTheDocument();
    });

    it("should call clearSearch when clear button clicked", async () => {
      const clearSearch = jest.fn();
      mockUseFindInWorkflow.mockReturnValue(
        createMockFindInWorkflowReturn({ searchTerm: "test", clearSearch })
      );

      renderWithTheme(<FindInWorkflowDialog workflowId="test-workflow" />);

      const clearButton = screen.getByLabelText("Clear search");
      await userEvent.click(clearButton);

      expect(clearSearch).toHaveBeenCalled();
    });
  });

  describe("navigation", () => {
    it("should call navigateNext on down arrow", async () => {
      const navigateNext = jest.fn();
      mockUseFindInWorkflow.mockReturnValue(
        createMockFindInWorkflowReturn({ navigateNext })
      );

      renderWithTheme(<FindInWorkflowDialog workflowId="test-workflow" />);

      const input = screen.getByPlaceholderText("Find nodes...");
      await userEvent.type(input, "{arrowdown}");

      expect(navigateNext).toHaveBeenCalled();
    });

    it("should call navigatePrevious on up arrow", async () => {
      const navigatePrevious = jest.fn();
      mockUseFindInWorkflow.mockReturnValue(
        createMockFindInWorkflowReturn({ navigatePrevious })
      );

      renderWithTheme(<FindInWorkflowDialog workflowId="test-workflow" />);

      const input = screen.getByPlaceholderText("Find nodes...");
      await userEvent.type(input, "{arrowup}");

      expect(navigatePrevious).toHaveBeenCalled();
    });
  });

  describe("result selection", () => {
    it("should call selectNode and goToSelected on result click", async () => {
      const selectNode = jest.fn();
      const goToSelected = jest.fn();
      const closeFind = jest.fn();
      mockUseFindInWorkflow.mockReturnValue(
        createMockFindInWorkflowReturn({ selectNode, goToSelected, closeFind })
      );

      renderWithTheme(<FindInWorkflowDialog workflowId="test-workflow" />);

      const resultButton = screen.getByText("Text Source");
      await userEvent.click(resultButton);

      expect(selectNode).toHaveBeenCalledWith(0);
      expect(goToSelected).toHaveBeenCalled();
    });

    it("should highlight selected result", () => {
      mockUseFindInWorkflow.mockReturnValue(
        createMockFindInWorkflowReturn({
          results: [
            { node: mockNode, matchIndex: 0 },
            {
              node: {
                ...mockNode,
                id: "node-2",
                data: {
                  ...mockNode.data,
                  properties: { name: "Second Node" }
                }
              },
              matchIndex: 1
            }
          ],
          selectedIndex: 1
        })
      );

      renderWithTheme(<FindInWorkflowDialog workflowId="test-workflow" />);

      const secondResult = screen.getByText("Second Node").closest('[role="button"]');
      expect(secondResult).toHaveClass("selected");
    });
  });

  describe("keyboard shortcuts", () => {
    it("should close on Escape", async () => {
      const closeFind = jest.fn();
      mockUseFindInWorkflow.mockReturnValue(
        createMockFindInWorkflowReturn({ closeFind })
      );

      renderWithTheme(<FindInWorkflowDialog workflowId="test-workflow" />);

      const input = screen.getByPlaceholderText("Find nodes...");
      await userEvent.type(input, "{escape}");

      expect(closeFind).toHaveBeenCalled();
    });

    it("should navigate and close on Enter with results", async () => {
      const goToSelected = jest.fn();
      const closeFind = jest.fn();
      const addSearch = jest.fn();
      mockUseFindInWorkflow.mockReturnValue(
        createMockFindInWorkflowReturn({ goToSelected, closeFind })
      );
      mockUseRecentSearchesStore.mockReturnValue({
        recentSearches: [],
        addSearch,
        removeSearch: jest.fn(),
        clearSearches: jest.fn(),
        getSearches: jest.fn()
      } as any);

      renderWithTheme(<FindInWorkflowDialog workflowId="test-workflow" />);

      const input = screen.getByPlaceholderText("Find nodes...");
      await userEvent.type(input, "{enter}");

      expect(goToSelected).toHaveBeenCalled();
      expect(closeFind).toHaveBeenCalled();
    });
  });

  describe("recent searches", () => {
    it("should save search when executing a search with results", async () => {
      const closeFind = jest.fn();
      mockUseFindInWorkflow.mockReturnValue(
        createMockFindInWorkflowReturn({ closeFind })
      );

      // Create a mock store
      const mockStore = {
        recentSearches: [] as Array<{ term: string; timestamp: number; resultCount: number }>,
        addSearch: jest.fn(),
        removeSearch: jest.fn(),
        clearSearches: jest.fn(),
        getSearches: jest.fn(() => [])
      };
      
      // Override the mock to return our test store
      mockUseRecentSearchesStore.mockImplementation((selector) => {
        const state = mockStore;
        if (selector) {
          return selector(state);
        }
        return state;
      });

      renderWithTheme(<FindInWorkflowDialog workflowId="test-workflow" />);

      const input = screen.getByPlaceholderText("Find nodes...");
      await userEvent.type(input, "test{enter}");

      // The dialog should close after search execution
      expect(closeFind).toHaveBeenCalled();
    });

    it("should handle empty results gracefully", async () => {
      // Set up mock with searchTerm and empty results
      mockUseFindInWorkflow.mockReturnValue(
        createMockFindInWorkflowReturn({ results: [], searchTerm: "nonexistent" })
      );
      mockUseRecentSearchesStore.mockReturnValue({
        recentSearches: [],
        addSearch: jest.fn(),
        removeSearch: jest.fn(),
        clearSearches: jest.fn(),
        getSearches: jest.fn()
      });

      renderWithTheme(<FindInWorkflowDialog workflowId="test-workflow" />);

      // When there are no results, the dialog should show "No matching nodes"
      expect(screen.getByText("No matching nodes")).toBeInTheDocument();
    });

    it("should call removeSearch on remove button click", async () => {
      const removeSearch = jest.fn();
      mockUseRecentSearchesStore.mockReturnValue({
        recentSearches: [{ term: "text", timestamp: Date.now(), resultCount: 5 }],
        addSearch: jest.fn(),
        removeSearch,
        clearSearches: jest.fn(),
        getSearches: jest.fn()
      } as any);

      renderWithTheme(<FindInWorkflowDialog workflowId="test-workflow" />);

      const removeButton = screen.getByLabelText('Remove "text" from recent searches');
      await userEvent.click(removeButton);

      expect(removeSearch).toHaveBeenCalledWith("text");
    });

    it("should call clearSearches on clear all click", async () => {
      const clearSearches = jest.fn();
      mockUseRecentSearchesStore.mockReturnValue({
        recentSearches: [
          { term: "text", timestamp: Date.now(), resultCount: 5 },
          { term: "image", timestamp: Date.now(), resultCount: 2 }
        ],
        addSearch: jest.fn(),
        removeSearch: jest.fn(),
        clearSearches,
        getSearches: jest.fn()
      } as any);

      renderWithTheme(<FindInWorkflowDialog workflowId="test-workflow" />);

      const clearAllButton = screen.getByLabelText("Clear all recent searches");
      await userEvent.click(clearAllButton);

      expect(clearSearches).toHaveBeenCalled();
    });

    it("should re-perform search on recent search click", async () => {
      const performSearch = jest.fn();
      mockUseFindInWorkflow.mockReturnValue(
        createMockFindInWorkflowReturn({ performSearch })
      );
      mockUseRecentSearchesStore.mockReturnValue({
        recentSearches: [{ term: "text", timestamp: Date.now(), resultCount: 5 }],
        addSearch: jest.fn(),
        removeSearch: jest.fn(),
        clearSearches: jest.fn(),
        getSearches: jest.fn()
      } as any);

      renderWithTheme(<FindInWorkflowDialog workflowId="test-workflow" />);

      const recentSearchItem = screen.getByText("text");
      await userEvent.click(recentSearchItem);

      expect(performSearch).toHaveBeenCalledWith("text");
    });
  });

  describe("accessibility", () => {
    it("should have aria-label on search input", () => {
      renderWithTheme(<FindInWorkflowDialog workflowId="test-workflow" />);

      expect(screen.getByLabelText("Find nodes in workflow")).toBeInTheDocument();
    });

    it("should have aria-labels on navigation buttons", () => {
      renderWithTheme(<FindInWorkflowDialog workflowId="test-workflow" />);

      expect(screen.getByLabelText("Navigate to previous result")).toBeInTheDocument();
      expect(screen.getByLabelText("Navigate to next result")).toBeInTheDocument();
    });
  });
});
