import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { WorkflowDiffViewer } from "../WorkflowDiffViewer";
import { WorkflowDiff } from "../../hooks/useWorkflowDiff";

const theme = createTheme();
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider theme={theme}>
    <CssBaseline />
    {children}
  </ThemeProvider>
);

const mockDiff: WorkflowDiff = {
  addedNodes: [
    { id: "new-node", type: "text", data: { text: "New text node" } },
    { id: "another-new", type: "llm", data: { model: "gpt-4" } },
  ],
  removedNodes: [
    { id: "old-node", type: "output", data: { format: "text" } },
  ],
  modifiedNodes: [
    {
      id: "modified-node",
      type: "text",
      changes: [
        { field: "data.text", oldValue: "Hello", newValue: "Hello World" },
      ],
    },
  ],
  addedEdges: [
    { id: "new-edge", source: "new-node", target: "another-new" },
  ],
  removedEdges: [
    { id: "old-edge", source: "old-node", target: "modified-node" },
  ],
  unchangedNodes: ["unchanged-1"],
  unchangedEdges: ["unchanged-edge-1"],
};

describe("WorkflowDiffViewer", () => {
  it("renders without crashing", () => {
    render(<WorkflowDiffViewer diff={mockDiff} />, { wrapper });
    expect(screen.getByText("Changes Summary")).toBeInTheDocument();
  });

  it("displays summary chips for change counts", () => {
    render(<WorkflowDiffViewer diff={mockDiff} />, { wrapper });

    expect(screen.getByText("2 added")).toBeInTheDocument();
    expect(screen.getByText("1 removed")).toBeInTheDocument();
    expect(screen.getByText("1 modified")).toBeInTheDocument();
  });

  it("displays added nodes in green", () => {
    render(<WorkflowDiffViewer diff={mockDiff} />, { wrapper });

    expect(screen.getByText("new-node")).toBeInTheDocument();
    expect(screen.getByText("another-new")).toBeInTheDocument();
    expect(screen.getByText("text")).toBeInTheDocument();
    expect(screen.getByText("llm")).toBeInTheDocument();
  });

  it("displays removed nodes in red", () => {
    render(<WorkflowDiffViewer diff={mockDiff} />, { wrapper });

    expect(screen.getByText("old-node")).toBeInTheDocument();
    expect(screen.getByText("output")).toBeInTheDocument();
  });

  it("displays modified nodes with change count", () => {
    render(<WorkflowDiffViewer diff={mockDiff} />, { wrapper });

    expect(screen.getByText("modified-node")).toBeInTheDocument();
    expect(screen.getByText("1 change(s)")).toBeInTheDocument();
  });

  it("expands modified node to show changes on click", async () => {
    const user = userEvent.setup();
    render(<WorkflowDiffViewer diff={mockDiff} />, { wrapper });

    const expandButton = screen.getByLabelText(/expand/i);
    await user.click(expandButton);

    expect(screen.getByText("data.text:")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("displays edge changes", () => {
    render(<WorkflowDiffViewer diff={mockDiff} />, { wrapper });

    expect(screen.getByText("Connection Changes")).toBeInTheDocument();
    expect(screen.getByText("new-node → another-new")).toBeInTheDocument();
    expect(screen.getByText("old-node → modified-node")).toBeInTheDocument();
  });

  it("shows 'No changes' message when diff is empty", () => {
    const emptyDiff: WorkflowDiff = {
      addedNodes: [],
      removedNodes: [],
      modifiedNodes: [],
      addedEdges: [],
      removedEdges: [],
      unchangedNodes: [],
      unchangedEdges: [],
    };

    render(<WorkflowDiffViewer diff={emptyDiff} />, { wrapper });

    expect(screen.getByText("No changes between versions")).toBeInTheDocument();
  });

  it("renders in compact mode without expansion", () => {
    render(<WorkflowDiffViewer diff={mockDiff} compact />, { wrapper });

    expect(screen.queryByText("Connection Changes")).not.toBeInTheDocument();
  });
});
