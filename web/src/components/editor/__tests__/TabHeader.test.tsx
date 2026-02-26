import React from "react";
import "@testing-library/jest-dom";
import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import TabHeader from "../TabHeader";
import mockTheme from "../../../__mocks__/themeMock";
import type { WorkflowAttributes } from "../../../stores/ApiTypes";

// Mock the WorkflowManagerContext
const mockNodeStore = {
  getState: jest.fn(() => ({ workflowIsDirty: false })),
  subscribe: jest.fn(() => () => {})
};

const mockWorkflowManager = {
  nodeStores: {
    "test-workflow-id": mockNodeStore
  }
};

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (callback: (state: typeof mockWorkflowManager) => unknown) => {
    return callback(mockWorkflowManager);
  },
  WorkflowManagerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

// Mock the useIsWorkflowRunning hook
jest.mock("../../../hooks/useWorkflowRunnerState", () => ({
  useIsWorkflowRunning: jest.fn(() => false)
}));

const renderWithTheme = (ui: React.ReactElement) => {
  return render(
    <ThemeProvider theme={mockTheme}>
      {ui}
    </ThemeProvider>
  );
};

const createMockWorkflow = (id: string = "test-workflow-id"): WorkflowAttributes => ({
  id,
  name: "Test Workflow",
  description: "",
  created_at: "",
  updated_at: "",
  access: "private"
} as WorkflowAttributes);

describe("TabHeader", () => {
  let mockProps: {
    workflow: WorkflowAttributes;
    isActive: boolean;
    isEditing: boolean;
    dropTarget: { id: string; position: "left" | "right" } | null;
    onNavigate: jest.Mock;
    onDoubleClick: jest.Mock;
    onClose: jest.Mock;
    onCloseOthers: jest.Mock;
    onCloseAll: jest.Mock;
    onDragStart: jest.Mock;
    onDragOver: jest.Mock;
    onDragLeave: jest.Mock;
    onDrop: jest.Mock;
    onNameChange: jest.Mock;
    onKeyDown: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockProps = {
      workflow: createMockWorkflow(),
      isActive: true,
      isEditing: false,
      dropTarget: null,
      onNavigate: jest.fn(),
      onDoubleClick: jest.fn(),
      onClose: jest.fn(),
      onCloseOthers: jest.fn(),
      onCloseAll: jest.fn(),
      onDragStart: jest.fn(),
      onDragOver: jest.fn(),
      onDragLeave: jest.fn(),
      onDrop: jest.fn(),
      onNameChange: jest.fn(),
      onKeyDown: jest.fn()
    };
  });

  it("renders workflow name correctly", () => {
    renderWithTheme(<TabHeader {...mockProps} />);
    expect(screen.getByText("Test Workflow")).toBeInTheDocument();
  });

  it("calls onNavigate when tab is clicked", () => {
    renderWithTheme(<TabHeader {...mockProps} />);
    const tab = screen.getByText("Test Workflow").closest(".tab");
    fireEvent.click(tab!);
    expect(mockProps.onNavigate).toHaveBeenCalledWith("test-workflow-id");
  });

  it("closes tab when close icon is clicked", () => {
    renderWithTheme(<TabHeader {...mockProps} />);
    const closeIcon = screen.getByTestId("CloseIcon").closest(".close-icon");
    fireEvent.click(closeIcon!);
    expect(mockProps.onClose).toHaveBeenCalledWith("test-workflow-id");
  });

  it("closes tab on middle-click using auxclick event", () => {
    renderWithTheme(<TabHeader {...mockProps} />);
    const tab = screen.getByText("Test Workflow").closest(".tab");

    // Simulate middle-click (button 1) with auxclick event
    const event = new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 });
    tab!.dispatchEvent(event);

    expect(mockProps.onClose).toHaveBeenCalledWith("test-workflow-id");
    expect(mockProps.onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close tab on primary click (button 0) via auxclick", () => {
    renderWithTheme(<TabHeader {...mockProps} />);
    const tab = screen.getByText("Test Workflow").closest(".tab");

    // Primary button (button 0) should not trigger close via auxclick
    const event = new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 0 });
    tab!.dispatchEvent(event);

    expect(mockProps.onClose).not.toHaveBeenCalled();
  });

  it("shows dirty indicator when workflow is dirty", () => {
    mockNodeStore.getState = jest.fn(() => ({ workflowIsDirty: true }));
    renderWithTheme(<TabHeader {...mockProps} />);
    const dirtyIndicator = screen.getByText("*");
    expect(dirtyIndicator).toBeInTheDocument();
  });

  it("opens context menu on right-click", () => {
    renderWithTheme(<TabHeader {...mockProps} />);
    const tab = screen.getByText("Test Workflow").closest(".tab");

    fireEvent.contextMenu(tab!);

    // Check that context menu items are present
    expect(screen.getByText("Close Tab")).toBeInTheDocument();
    expect(screen.getByText("Close Other Tabs")).toBeInTheDocument();
    expect(screen.getByText("Close All Tabs")).toBeInTheDocument();
  });
});
