import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import CommentForm from "../CommentForm";
import { useWorkflowCommentStore } from "../../../stores/WorkflowCommentStore";
import { renderHook } from "@testing-library/react";

// Mock the auth store
jest.mock("../../../stores/useAuth", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    user: { id: "test-user-id", email: "test@example.com" }
  }))
}));

// Wrapper component with theme provider
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ThemeProvider theme={mockTheme}>
      {children}
    </ThemeProvider>
  );
};

describe("CommentForm", () => {
  beforeEach(() => {
    // Reset the store before each test
    useWorkflowCommentStore.setState({
      comments: {},
      selectedCommentId: null
    });
  });

  it("renders the input field", () => {
    render(<CommentForm workflowId="workflow-123" />, { wrapper: TestWrapper });

    expect(screen.getByPlaceholderText("Add a comment...")).toBeInTheDocument();
  });

  it("submits comment on send button click", async () => {
    const { result } = renderHook(() => useWorkflowCommentStore());
    render(<CommentForm workflowId="workflow-123" />, { wrapper: TestWrapper });

    const input = screen.getByRole("textbox");
    await userEvent.type(input, "Test comment");

    const sendButton = screen.getByRole("button");
    await userEvent.click(sendButton);

    await waitFor(() => {
      const comments = result.current.getWorkflowComments("workflow-123");
      expect(comments).toHaveLength(1);
      expect(comments[0].content).toBe("Test comment");
    });
  });

  it("submits comment on Ctrl+Enter", async () => {
    const { result } = renderHook(() => useWorkflowCommentStore());
    render(<CommentForm workflowId="workflow-123" />, { wrapper: TestWrapper });

    const input = screen.getByRole("textbox");
    await userEvent.type(input, "Test comment");

    await userEvent.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => {
      const comments = result.current.getWorkflowComments("workflow-123");
      expect(comments).toHaveLength(1);
      expect(comments[0].content).toBe("Test comment");
    });
  });

  it("clears input after submission", async () => {
    render(<CommentForm workflowId="workflow-123" />, { wrapper: TestWrapper });

    const input = screen.getByRole("textbox");
    await userEvent.type(input, "Test comment");

    const sendButton = screen.getByRole("button");
    await userEvent.click(sendButton);

    await waitFor(() => {
      expect(input).toHaveValue("");
    });
  });

  it("does not submit empty comments", async () => {
    const { result } = renderHook(() => useWorkflowCommentStore());
    render(<CommentForm workflowId="workflow-123" />, { wrapper: TestWrapper });

    const sendButton = screen.getByRole("button");
    await userEvent.click(sendButton);

    await waitFor(() => {
      const comments = result.current.getWorkflowComments("workflow-123");
      expect(comments).toHaveLength(0);
    });
  });

  it("disables send button when input is empty", () => {
    render(<CommentForm workflowId="workflow-123" />, { wrapper: TestWrapper });

    const sendButton = screen.getByRole("button");
    expect(sendButton).toBeDisabled();
  });

  it("enables send button when there is text", async () => {
    render(<CommentForm workflowId="workflow-123" />, { wrapper: TestWrapper });

    const input = screen.getByRole("textbox");
    await userEvent.type(input, "Test");

    await waitFor(() => {
      const sendButton = screen.getByRole("button");
      expect(sendButton).not.toBeDisabled();
    });
  });
});
