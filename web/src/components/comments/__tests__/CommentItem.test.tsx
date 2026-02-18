import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import CommentItem from "../CommentItem";
import { useWorkflowCommentStore } from "../../../stores/WorkflowCommentStore";
import type { WorkflowComment } from "../../../stores/WorkflowCommentStore";
import { renderHook, act } from "@testing-library/react";

const mockComment: WorkflowComment = {
  id: "comment-123",
  workflowId: "workflow-123",
  content: "This is a test comment",
  author: "Test User",
  createdAt: "2024-01-15T10:30:00Z",
  updatedAt: "2024-01-15T10:30:00Z",
  isResolved: false
};

// Wrapper component with theme provider
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ThemeProvider theme={mockTheme}>
      {children}
    </ThemeProvider>
  );
};

describe("CommentItem", () => {
  beforeEach(() => {
    // Reset the store before each test
    useWorkflowCommentStore.setState({
      comments: {},
      selectedCommentId: null
    });
  });

  it("renders comment content and author", () => {
    render(<CommentItem comment={mockComment} />, { wrapper: TestWrapper });

    expect(screen.getByText("This is a test comment")).toBeInTheDocument();
    expect(screen.getByText("Test User")).toBeInTheDocument();
  });

  it("displays formatted creation date", () => {
    render(<CommentItem comment={mockComment} />, { wrapper: TestWrapper });

    expect(screen.getByText(/Jan 15/)).toBeInTheDocument();
  });

  it("shows resolved status when true", () => {
    const resolvedComment = { ...mockComment, isResolved: true };
    render(<CommentItem comment={resolvedComment} />, { wrapper: TestWrapper });

    expect(screen.getByText("Resolved")).toBeInTheDocument();
  });

  it("does not show resolved badge when false", () => {
    render(<CommentItem comment={mockComment} />, { wrapper: TestWrapper });

    expect(screen.queryByText("Resolved")).not.toBeInTheDocument();
  });

  it("toggles resolved status when clicking the check button", async () => {
    const { result } = renderHook(() => useWorkflowCommentStore());

    act(() => {
      result.current.addComment({
        workflowId: "workflow-123",
        content: "Test",
        author: "User",
        isResolved: false
      });
    });

    const comments = result.current.getWorkflowComments("workflow-123");
    const comment = comments[0];

    render(<CommentItem comment={comment} />, { wrapper: TestWrapper });

    const checkButton = screen.getAllByRole("button")[0]; // First button is the check icon
    expect(comment.isResolved).toBe(false);

    await userEvent.click(checkButton);

    await waitFor(() => {
      expect(result.current.getComment(comment.id)?.isResolved).toBe(true);
    });
  });

  it("deletes comment when clicking the delete button", async () => {
    const { result } = renderHook(() => useWorkflowCommentStore());

    act(() => {
      result.current.addComment({
        workflowId: "workflow-123",
        content: "Test",
        author: "User",
        isResolved: false
      });
    });

    const comments = result.current.getWorkflowComments("workflow-123");
    const comment = comments[0];

    // Mock window.confirm
    global.confirm = jest.fn(() => true) as unknown as () => boolean;

    render(<CommentItem comment={comment} />, { wrapper: TestWrapper });

    const deleteButton = screen.getAllByRole("button")[2]; // Third button is delete

    await userEvent.click(deleteButton);

    await waitFor(() => {
      expect(result.current.getComment(comment.id)).toBeUndefined();
    });
  });

  it("calls onSelect when clicking edit button", async () => {
    const onSelect = jest.fn();
    render(<CommentItem comment={mockComment} onSelect={onSelect} />, { wrapper: TestWrapper });

    const editButton = screen.getAllByRole("button")[1]; // Second button is edit

    await userEvent.click(editButton);

    expect(onSelect).toHaveBeenCalledWith("comment-123");
  });
});
