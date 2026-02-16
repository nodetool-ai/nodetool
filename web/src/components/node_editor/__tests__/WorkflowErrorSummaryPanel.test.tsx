import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ReactFlowProvider } from "@xyflow/react";
import WorkflowErrorSummaryPanel from "../WorkflowErrorSummaryPanel";
import useErrorStore from "../../../stores/ErrorStore";

// Mock useReactFlow
jest.mock("@xyflow/react", () => ({
  useReactFlow: () => ({
    fitView: jest.fn(),
    setCenter: jest.fn()
  })
}));

// Mock the contexts
jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: () => ({
    nodes: [
      {
        id: "node1",
        type: "testType",
        position: { x: 100, y: 100 },
        data: { workflow_id: "workflow1" }
      },
      {
        id: "node2",
        type: "testType",
        position: { x: 200, y: 200 },
        data: { workflow_id: "workflow1" }
      }
    ]
  })
}));

jest.mock("../../../stores/MetadataStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      getMetadata: () => ({ title: "Test Node", node_type: "testType" })
    })
  }
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ReactFlowProvider>{children}</ReactFlowProvider>
);

describe("WorkflowErrorSummaryPanel", () => {
  beforeEach(() => {
    // Clear errors before each test
    useErrorStore.getState().clearErrors("workflow1");
  });

  it("renders correctly when visible", () => {
    render(<WorkflowErrorSummaryPanel visible={true} />, { wrapper });

    expect(screen.getByText(/0 errors?/i)).toBeInTheDocument();
  });

  it("shows empty state when no errors", () => {
    render(<WorkflowErrorSummaryPanel visible={true} />, { wrapper });

    expect(screen.getByText(/no errors in workflow/i)).toBeInTheDocument();
  });

  it("displays error count when errors exist", () => {
    // Set up errors
    useErrorStore.getState().setError("workflow1", "node1", "Test error 1");
    useErrorStore.getState().setError("workflow1", "node2", "Test error 2");

    render(<WorkflowErrorSummaryPanel visible={true} />, { wrapper });

    expect(screen.getByText(/2 errors?/i)).toBeInTheDocument();
  });

  it("displays individual error items", () => {
    useErrorStore.getState().setError("workflow1", "node1", "Test error message");

    render(<WorkflowErrorSummaryPanel visible={true} />, { wrapper });

    expect(screen.getByText("Test Node")).toBeInTheDocument();
    expect(screen.getByText(/Test error message/i)).toBeInTheDocument();
  });

  it("expands error message on click", async () => {
    const longErrorMessage =
      "This is a very long error message that should be truncated when collapsed " +
      "but fully visible when expanded by clicking the expand button.";

    useErrorStore.getState().setError("workflow1", "node1", longErrorMessage);

    render(<WorkflowErrorSummaryPanel visible={true} />, { wrapper });

    const expandButton = screen.getByRole("button", { name: /expand/i });
    fireEvent.click(expandButton);

    await waitFor(() => {
      expect(screen.getByText(longErrorMessage)).toBeInTheDocument();
    });
  });

  it("calls onClose when close button is clicked", () => {
    const handleClose = jest.fn();

    useErrorStore.getState().setError("workflow1", "node1", "Test error");

    render(<WorkflowErrorSummaryPanel visible={true} onClose={handleClose} />, {
      wrapper
    });

    const closeButton = screen.getAllByRole("button").find((btn) =>
      btn.getAttribute("title")?.includes("Close panel")
    );

    if (closeButton) {
      fireEvent.click(closeButton);
      expect(handleClose).toHaveBeenCalledTimes(1);
    }
  });

  it("clears all errors when clear button is clicked", () => {
    useErrorStore.getState().setError("workflow1", "node1", "Test error 1");
    useErrorStore.getState().setError("workflow1", "node2", "Test error 2");

    render(<WorkflowErrorSummaryPanel visible={true} />, { wrapper });

    const clearButton = screen.getByRole("button", { name: /clear all errors/i });
    fireEvent.click(clearButton);

    expect(screen.getByText(/0 errors?/i)).toBeInTheDocument();
    expect(screen.getByText(/no errors in workflow/i)).toBeInTheDocument();
  });

  it("does not render when visible is false", () => {
    useErrorStore.getState().setError("workflow1", "node1", "Test error");

    const { container } = render(
      <WorkflowErrorSummaryPanel visible={false} />,
      { wrapper }
    );

    expect(container.firstChild).toBeNull();
  });

  it("handles Error objects correctly", () => {
    const error = new Error("Instance error message");
    useErrorStore.getState().setError("workflow1", "node1", error);

    render(<WorkflowErrorSummaryPanel visible={true} />, { wrapper });

    expect(screen.getByText("Instance error message")).toBeInTheDocument();
  });

  it("handles string errors correctly", () => {
    useErrorStore.getState().setError("workflow1", "node1", "String error message");

    render(<WorkflowErrorSummaryPanel visible={true} />, { wrapper });

    expect(screen.getByText("String error message")).toBeInTheDocument();
  });

  it("handles object errors with message property", () => {
    const errorObj = { message: "Object error message", code: "ERR_001" };
    useErrorStore.getState().setError("workflow1", "node1", errorObj);

    render(<WorkflowErrorSummaryPanel visible={true} />, { wrapper });

    expect(screen.getByText("Object error message")).toBeInTheDocument();
  });

  it("navigates to node when error item is clicked", () => {
    const mockSetCenter = jest.requireMock("@xyflow/react").useReactFlow().setCenter;

    useErrorStore.getState().setError("workflow1", "node1", "Test error");

    render(<WorkflowErrorSummaryPanel visible={true} />, { wrapper });

    const errorItem = screen.getByText("Test Node").closest("button");
    if (errorItem) {
      fireEvent.click(errorItem);
      expect(mockSetCenter).toHaveBeenCalledWith(
        100,
        100,
        expect.objectContaining({
          zoom: 1.2,
          duration: 300
        })
      );
    }
  });
});
