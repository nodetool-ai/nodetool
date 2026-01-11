import React from "react";
import { render, screen } from "@testing-library/react";
import WorkflowDescriptionDialog from "../WorkflowDescriptionDialog";
import mockTheme from "../../../__mocks__/themeMock";
import { ThemeProvider } from "@mui/material/styles";
import { WorkflowAttributes } from "../../../stores/ApiTypes";

const mockWorkflow: WorkflowAttributes = {
  id: "test-workflow-1",
  name: "Test Workflow",
  description: "This is a test description",
  access: "private",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

const mockGetCurrentWorkflow = jest.fn(() => mockWorkflow);
const mockUpdateWorkflow = jest.fn().mockResolvedValue(undefined);

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: jest.fn()
}));

import { useWorkflowManager } from "../../../contexts/WorkflowManagerContext";

const renderWithProviders = (ui: React.ReactNode) => {
  (useWorkflowManager as unknown as jest.Mock).mockImplementation(
    (sel: any) => sel({
      getCurrentWorkflow: mockGetCurrentWorkflow,
      updateWorkflow: mockUpdateWorkflow
    })
  );
  return render(
    <ThemeProvider theme={mockTheme}>
      {ui}
    </ThemeProvider>
  );
};

describe("WorkflowDescriptionDialog", () => {
  const defaultProps = {
    workflowId: "test-workflow-1",
    open: true,
    onClose: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders dialog with workflow description", () => {
    mockGetCurrentWorkflow.mockReturnValue(mockWorkflow);
    renderWithProviders(
      <WorkflowDescriptionDialog {...defaultProps} />
    );

    expect(screen.getByText("Workflow Description")).toBeInTheDocument();
    expect(screen.getByText("This is a test description")).toBeInTheDocument();
  });

  it("shows empty state when no description", () => {
    mockGetCurrentWorkflow.mockReturnValue({
      ...mockWorkflow,
      description: ""
    });

    renderWithProviders(
      <WorkflowDescriptionDialog {...defaultProps} />
    );

    expect(
      screen.getByText(/No description provided/i)
    ).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    mockGetCurrentWorkflow.mockReturnValue(mockWorkflow);
    renderWithProviders(
      <WorkflowDescriptionDialog {...defaultProps} open={false} />
    );

    expect(screen.queryByText("Workflow Description")).not.toBeInTheDocument();
  });

  it("shows Edit button when description exists", () => {
    mockGetCurrentWorkflow.mockReturnValue(mockWorkflow);
    renderWithProviders(
      <WorkflowDescriptionDialog {...defaultProps} />
    );

    expect(screen.getByRole("button", { name: /Edit/i })).toBeInTheDocument();
  });

  it("shows Add Description button when description is empty", () => {
    mockGetCurrentWorkflow.mockReturnValue({
      ...mockWorkflow,
      description: ""
    });

    renderWithProviders(
      <WorkflowDescriptionDialog {...defaultProps} />
    );

    expect(screen.getByRole("button", { name: /Add Description/i })).toBeInTheDocument();
  });

  it("shows description icon in header", () => {
    mockGetCurrentWorkflow.mockReturnValue(mockWorkflow);
    renderWithProviders(
      <WorkflowDescriptionDialog {...defaultProps} />
    );

    expect(screen.getByTestId("DescriptionIcon")).toBeInTheDocument();
  });

  it("shows close button in header", () => {
    mockGetCurrentWorkflow.mockReturnValue(mockWorkflow);
    renderWithProviders(
      <WorkflowDescriptionDialog {...defaultProps} />
    );

    expect(screen.getByRole("button", { name: /close dialog/i })).toBeInTheDocument();
  });

  it("handles long descriptions", () => {
    const longDescription = "This is a very long description that should wrap properly within the dialog. ".repeat(10);
    mockGetCurrentWorkflow.mockReturnValue({
      ...mockWorkflow,
      description: longDescription
    });

    renderWithProviders(
      <WorkflowDescriptionDialog {...defaultProps} />
    );

    expect(screen.getByText(/Workflow Description/i)).toBeInTheDocument();
  });

  it("displays description with proper formatting", () => {
    mockGetCurrentWorkflow.mockReturnValue(mockWorkflow);
    renderWithProviders(
      <WorkflowDescriptionDialog {...defaultProps} />
    );

    const descriptionElement = screen.getByText("This is a test description");
    expect(descriptionElement).toBeInTheDocument();
    expect(descriptionElement).toHaveClass("description-text");
  });

  it("does not show empty class when description exists", () => {
    mockGetCurrentWorkflow.mockReturnValue(mockWorkflow);
    renderWithProviders(
      <WorkflowDescriptionDialog {...defaultProps} />
    );

    expect(screen.getByText("This is a test description")).not.toHaveClass("empty");
  });

  it("shows empty class when no description", () => {
    mockGetCurrentWorkflow.mockReturnValue({
      ...mockWorkflow,
      description: ""
    });

    renderWithProviders(
      <WorkflowDescriptionDialog {...defaultProps} />
    );

    const emptyElement = screen.getByText(/No description provided/i);
    expect(emptyElement).toHaveClass("empty");
  });
});
