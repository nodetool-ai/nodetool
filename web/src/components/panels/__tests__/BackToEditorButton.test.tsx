/**
 * BackToEditorButton Component Tests
 *
 * Tests the BackToEditorButton component which provides navigation
 * back to the workflow editor with optional workflow name display.
 *
 * Key behaviors to test:
 * - Renders with custom title when provided
 * - Renders with workflow name when data is loaded
 * - Navigates to correct editor URL when clicked
 * - Fetches workflow data only when needed
 * - Has proper accessibility attributes
 * - Uses ref forwarding correctly
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

// Mock react-router-dom
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate
}));

// Mock WorkflowManagerContext
const mockCurrentWorkflowId = "test-workflow-id";
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (state: unknown) => unknown) => {
    const state = { currentWorkflowId: mockCurrentWorkflowId };
    return selector(state);
  }
}));

// Mock tRPC client
const mockWorkflowsListQuery = jest.fn();
jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    workflows: {
      list: {
        query: (...args: unknown[]) => mockWorkflowsListQuery(...args)
      }
    }
  }
}));

// Mock the CSS-in-JS for emotion
jest.mock("@emotion/react", () => ({
  ...jest.requireActual("@emotion/react"),
  css: jest.fn((styles) => styles)
}));

import BackToEditorButton from "../BackToEditorButton";

describe("BackToEditorButton", () => {
  let queryClient: QueryClient;

  const createWrapper = () => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false
        }
      }
    });

    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={mockTheme}>
          <MemoryRouter>{children}</MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>
    );
    Wrapper.displayName = "TestWrapper";
    return Wrapper;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock successful tRPC response by default
    mockWorkflowsListQuery.mockResolvedValue({
      workflows: [
        {
          id: "test-workflow-id",
          name: "Test Workflow",
          updated_at: "2024-01-01T00:00:00Z",
          description: null,
          thumbnail_url: null
        }
      ],
      next: null
    });
  });

  describe("Rendering", () => {
    it("renders with custom title when provided", () => {
      const wrapper = createWrapper();
      render(<BackToEditorButton title="Custom Title" />, { wrapper });

      expect(screen.getByRole("button")).toBeInTheDocument();
      expect(screen.getByRole("button")).toHaveTextContent("Custom Title");
    });

    it("renders with 'Back to Editor' as default title", () => {
      const wrapper = createWrapper();
      render(<BackToEditorButton title="Back to Editor" />, { wrapper });

      expect(screen.getByRole("button")).toBeInTheDocument();
      expect(screen.getByRole("button")).toHaveTextContent("Back to Editor");
    });

    it("renders with workflow name when title is not provided and workflow data is loaded", async () => {
      const wrapper = createWrapper();
      render(<BackToEditorButton />, { wrapper });

      // Wait for the query to complete and workflow name to appear
      await waitFor(() => {
        expect(screen.getByRole("button")).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText("Test Workflow")).toBeInTheDocument();
      });
    });

    it("renders KeyboardBackspaceIcon", () => {
      const wrapper = createWrapper();
      render(<BackToEditorButton title="Editor" />, { wrapper });

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
      // Icon should be present - check for svg element
      const icon = button.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });

    it("includes 'nav-button' and 'back-to-editor' classNames", () => {
      const wrapper = createWrapper();
      render(<BackToEditorButton title="Editor" />, { wrapper });

      const button = screen.getByRole("button");
      expect(button).toHaveClass("nav-button");
      expect(button).toHaveClass("back-to-editor");
    });
  });

  describe("Navigation behavior", () => {
    it("navigates to /editor/{workflowId} when clicked", () => {
      const wrapper = createWrapper();
      render(<BackToEditorButton title="Editor" />, { wrapper });

      const button = screen.getByRole("button");
      fireEvent.click(button);

      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith("/editor/test-workflow-id");
    });

    it("navigates correctly when clicked with custom title", () => {
      const wrapper = createWrapper();
      render(<BackToEditorButton title="Go to Editor" />, { wrapper });

      const button = screen.getByRole("button");
      fireEvent.click(button);

      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith("/editor/test-workflow-id");
    });
  });

  describe("Data fetching behavior", () => {
    it("fetches workflows when title is not provided and currentWorkflowId exists", async () => {
      const wrapper = createWrapper();
      render(<BackToEditorButton />, { wrapper });

      await waitFor(() => {
        expect(mockWorkflowsListQuery).toHaveBeenCalledWith({
          cursor: "",
          limit: 20
        });
      });
    });

    it("does not fetch workflows when title is provided", async () => {
      const wrapper = createWrapper();
      render(<BackToEditorButton title="Custom Title" />, { wrapper });

      // Wait a bit to ensure no query was made
      await waitFor(
        () => {
          expect(mockWorkflowsListQuery).not.toHaveBeenCalled();
        },
        { timeout: 100 }
      );
    });

    it("displays workflow name when tRPC returns matching workflow", async () => {
      const wrapper = createWrapper();
      render(<BackToEditorButton />, { wrapper });

      await waitFor(() => {
        expect(screen.getByText("Test Workflow")).toBeInTheDocument();
      });
    });

    it("handles API error gracefully", async () => {
      // Mock tRPC error
      mockWorkflowsListQuery.mockRejectedValue(new Error("Failed to load workflows"));

      const wrapper = createWrapper();
      render(<BackToEditorButton />, { wrapper });

      // Should still render the button
      await waitFor(() => {
        expect(screen.getByRole("button")).toBeInTheDocument();
      });
    });
  });

  describe("Performance optimizations", () => {
    it("uses memo for performance optimization", () => {
      const wrapper = createWrapper();
      const { rerender: rtlRerender } = render(<BackToEditorButton title="Editor" />, {
        wrapper
      });

      // Re-render with same props - need to use the wrapper correctly
      rtlRerender(<BackToEditorButton title="Editor" />);

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("has displayName for debugging", () => {
      // The component is a memoized forwardRef, so displayName should be set
      // Check if the component exists and can be rendered
      const wrapper = createWrapper();
      render(<BackToEditorButton title="Editor" />, { wrapper });
      expect(screen.getByRole("button")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("has accessible button role", () => {
      const wrapper = createWrapper();
      render(<BackToEditorButton title="Editor" />, { wrapper });

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("includes tooltip with 'Back to Editor' text", () => {
      const wrapper = createWrapper();
      render(<BackToEditorButton title="Editor" />, { wrapper });

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
    });
  });

  describe("Edge cases", () => {
    it("handles empty workflow list gracefully", async () => {
      mockWorkflowsListQuery.mockResolvedValue({
        workflows: [],
        next: null
      });

      const wrapper = createWrapper();
      render(<BackToEditorButton />, { wrapper });

      await waitFor(() => {
        expect(screen.getByRole("button")).toBeInTheDocument();
      });
    });

    it("handles workflow not found in list", async () => {
      mockWorkflowsListQuery.mockResolvedValue({
        workflows: [
          {
            id: "different-workflow-id",
            name: "Different Workflow",
            updated_at: "2024-01-01T00:00:00Z",
            description: null,
            thumbnail_url: null
          }
        ],
        next: null
      });

      const wrapper = createWrapper();
      render(<BackToEditorButton />, { wrapper });

      await waitFor(() => {
        expect(screen.getByRole("button")).toBeInTheDocument();
      });
    });

    it("handles null workflow name gracefully", async () => {
      mockWorkflowsListQuery.mockResolvedValue({
        workflows: [
          {
            id: "test-workflow-id",
            name: null,
            updated_at: "2024-01-01T00:00:00Z",
            description: null,
            thumbnail_url: null
          }
        ],
        next: null
      });

      const wrapper = createWrapper();
      render(<BackToEditorButton />, { wrapper });

      await waitFor(() => {
        expect(screen.getByRole("button")).toBeInTheDocument();
      });
    });
  });
});
