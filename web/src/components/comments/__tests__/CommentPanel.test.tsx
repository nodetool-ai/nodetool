import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import CommentPanel from "../CommentPanel";
import { useWorkflowCommentStore } from "../../../stores/WorkflowCommentStore";
import { renderHook, act } from "@testing-library/react";

// Mock the WorkflowManagerContext
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: () => "test-workflow-123"
}));

// Wrapper component with theme provider
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ThemeProvider theme={mockTheme}>
      {children}
    </ThemeProvider>
  );
};

describe("CommentPanel", () => {
  beforeEach(() => {
    // Reset the store before each test
    useWorkflowCommentStore.setState({
      comments: {},
      selectedCommentId: null
    });
  });

  it("renders the panel with header", () => {
    render(<CommentPanel />, { wrapper: TestWrapper });

    expect(screen.getByText("Comments")).toBeInTheDocument();
    expect(screen.getByText(/0 open, 0 resolved/)).toBeInTheDocument();
  });

  it("shows empty state when no comments exist", () => {
    render(<CommentPanel />, { wrapper: TestWrapper });

    expect(screen.getByText("No comments yet.")).toBeInTheDocument();
    expect(screen.getByText("Add a comment to start the discussion.")).toBeInTheDocument();
  });

  it("displays comments when they exist", () => {
    const { result } = renderHook(() => useWorkflowCommentStore());

    act(() => {
      result.current.addComment({
        workflowId: "test-workflow-123",
        content: "Test comment",
        author: "Test User",
        isResolved: false
      });
    });

    render(<CommentPanel />, { wrapper: TestWrapper });

    expect(screen.getByText("Test comment")).toBeInTheDocument();
    expect(screen.getByText("Test User")).toBeInTheDocument();
  });

  it("filters comments by status", async () => {
    const { result } = renderHook(() => useWorkflowCommentStore());

    act(() => {
      result.current.addComment({
        workflowId: "test-workflow-123",
        content: "Open comment",
        author: "User 1",
        isResolved: false
      });
      result.current.addComment({
        workflowId: "test-workflow-123",
        content: "Resolved comment",
        author: "User 2",
        isResolved: true
      });
    });

    render(<CommentPanel />, { wrapper: TestWrapper });

    // Initially shows all
    expect(screen.getByText("Open comment")).toBeInTheDocument();
    expect(screen.getByText("Resolved comment")).toBeInTheDocument();

    // Filter to open only
    await userEvent.click(screen.getByRole("button", { name: /Open \b1\b/ }));

    await waitFor(() => {
      expect(screen.getByText("Open comment")).toBeInTheDocument();
      expect(screen.queryByText("Resolved comment")).not.toBeInTheDocument();
    });
  });

  it("updates comment count in header", () => {
    const { result } = renderHook(() => useWorkflowCommentStore());

    const { rerender } = render(<CommentPanel />, { wrapper: TestWrapper });

    expect(screen.getByText(/0 open, 0 resolved/)).toBeInTheDocument();

    act(() => {
      result.current.addComment({
        workflowId: "test-workflow-123",
        content: "Test",
        author: "User",
        isResolved: false
      });
    });

    rerender(<CommentPanel />);

    expect(screen.getByText(/1 open, 0 resolved/)).toBeInTheDocument();
  });
});
