import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { WorkflowActivityLog } from "../WorkflowActivityLog";
import { useWorkflowActivityStore } from "../../../stores/WorkflowActivityStore";
import mockTheme from "../../../__mocks__/themeMock";
import type { Node } from "@xyflow/react";

const renderWithTheme = (component: React.ReactNode) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("WorkflowActivityLog", () => {
  const createMockNodes = (count: number): Node[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `node-${i}`,
      type: "mock",
      position: { x: 0, y: 0 },
      data: {}
    }));
  };

  const addMockExecutions = (count: number) => {
    const store = useWorkflowActivityStore.getState();
    const mockNodes = createMockNodes(3);
    for (let i = 0; i < count; i++) {
      const id = store.startExecution(`wf-${i}`, `Workflow ${i}`, mockNodes);
      if (i % 3 === 0) {
        store.completeExecution(id);
      } else if (i % 3 === 1) {
        store.failExecution(id, "Test error");
      } else if (i % 3 === 2) {
        store.cancelExecution(id);
      }
    }
  };

  beforeEach(() => {
    useWorkflowActivityStore.getState().clearHistory();
  });

  it("should render empty state when no executions exist", () => {
    renderWithTheme(<WorkflowActivityLog />);

    expect(screen.getByText("No execution history yet")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("should render list of executions", () => {
    addMockExecutions(3);
    renderWithTheme(<WorkflowActivityLog />);

    expect(screen.getByText("Workflow 0")).toBeInTheDocument();
    expect(screen.getByText("Workflow 1")).toBeInTheDocument();
    expect(screen.getByText("Workflow 2")).toBeInTheDocument();
  });

  it("should filter executions by workflow id", () => {
    const store = useWorkflowActivityStore.getState();
    const mockNodes = createMockNodes(1);

    store.startExecution("wf-1", "Workflow 1", mockNodes);
    store.startExecution("wf-2", "Workflow 2", mockNodes);
    store.startExecution("wf-1", "Another Workflow 1", mockNodes);

    renderWithTheme(<WorkflowActivityLog workflowId="wf-1" />);

    expect(screen.getByText("Workflow 1")).toBeInTheDocument();
    expect(screen.getByText("Another Workflow 1")).toBeInTheDocument();
    expect(screen.queryByText("Workflow 2")).not.toBeInTheDocument();
  });

  it("should limit number of executions displayed", () => {
    addMockExecutions(10);
    renderWithTheme(<WorkflowActivityLog limit={5} />);

    const listItems = screen.getAllByRole("listitem");
    expect(listItems).toHaveLength(5);
  });

  it("should show node count chip", () => {
    addMockExecutions(1);
    renderWithTheme(<WorkflowActivityLog />);

    expect(screen.getByText("3 nodes")).toBeInTheDocument();
  });

  it("should show error message for failed executions", () => {
    const store = useWorkflowActivityStore.getState();
    const mockNodes = createMockNodes(1);
    const id = store.startExecution("wf-1", "Test", mockNodes);
    store.failExecution(id, "Something went wrong");

    renderWithTheme(<WorkflowActivityLog />);

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("should show 'clear all history' link when executions exist", () => {
    addMockExecutions(1);
    renderWithTheme(<WorkflowActivityLog />);

    expect(screen.getByText("Clear all history")).toBeInTheDocument();
  });

  it("should not show 'clear all history' when no executions", () => {
    renderWithTheme(<WorkflowActivityLog />);

    expect(screen.queryByText("Clear all history")).not.toBeInTheDocument();
  });
});
