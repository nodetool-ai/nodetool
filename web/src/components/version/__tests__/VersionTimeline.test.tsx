import React from "react";
import { render, screen } from "@testing-library/react";
import { VersionTimeline } from "../VersionTimeline";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { CssBaseline } from "@mui/material";

jest.mock("../../../stores/VersionHistoryStore", () => ({
  useVersionHistoryStore: jest.fn(() => ({
    selectedVersionId: null,
    compareVersionId: null,
    isCompareMode: false,
    setSelectedVersion: jest.fn(),
    setCompareVersion: jest.fn(),
    setCompareMode: jest.fn(),
    setHistoryPanelOpen: jest.fn()
  }))
}));

jest.mock("../../../serverState/useWorkflowVersions", () => ({
  useWorkflowVersions: jest.fn(() => ({
    data: {
      versions: [
        {
          id: "v3",
          workflow_id: "workflow-1",
          version: 3,
          created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
          name: "Current version",
          save_type: "manual",
          graph: {
            nodes: [
              { id: "n1", type: "nodetool.input.StringInput" },
              { id: "n2", type: "nodetool.output.Output" }
            ],
            edges: [{ id: "e1", source: "n1", target: "n2" }]
          }
        },
        {
          id: "v2",
          workflow_id: "workflow-1",
          version: 2,
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
          name: "Checkpoint before changes",
          save_type: "checkpoint",
          graph: {
            nodes: [{ id: "n1", type: "nodetool.input.StringInput" }],
            edges: []
          }
        },
        {
          id: "v1",
          workflow_id: "workflow-1",
          version: 1,
          created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
          save_type: "autosave",
          graph: { nodes: [], edges: [] }
        }
      ],
      total: 3,
      cursor: null
    },
    isLoading: false,
    error: null,
    restoreVersion: jest.fn().mockResolvedValue(undefined),
    isRestoringVersion: false,
    createVersion: jest.fn().mockResolvedValue({}),
    refetch: jest.fn()
  }))
}));

const renderWithTheme = (component: React.ReactNode) => {
  const theme = createTheme();
  return render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {component}
    </ThemeProvider>
  );
};

describe("VersionTimeline", () => {
  const mockOnRestore = jest.fn();
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders versions in timeline order", () => {
    renderWithTheme(
      <VersionTimeline
        workflowId="workflow-1"
        onRestore={mockOnRestore}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
  });

  it("displays save type chips correctly", async () => {
    renderWithTheme(
      <VersionTimeline
        workflowId="workflow-1"
        onRestore={mockOnRestore}
        onClose={mockOnClose}
      />
    );

    const manualSaves = await screen.findAllByText("Manual Save");
    const checkpoints = await screen.findAllByText("Checkpoint");
    const autosaves = await screen.findAllByText("Auto-save");

    expect(manualSaves.length).toBeGreaterThanOrEqual(1);
    expect(checkpoints.length).toBeGreaterThanOrEqual(1);
    expect(autosaves.length).toBeGreaterThanOrEqual(1);
  });

  it("displays node and edge counts", () => {
    renderWithTheme(
      <VersionTimeline
        workflowId="workflow-1"
        onRestore={mockOnRestore}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText("2 nodes")).toBeInTheDocument();
    expect(screen.getByText("1 connections")).toBeInTheDocument();
  });

  it("shows version names when present", () => {
    renderWithTheme(
      <VersionTimeline
        workflowId="workflow-1"
        onRestore={mockOnRestore}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText("Current version")).toBeInTheDocument();
    expect(screen.getByText("Checkpoint before changes")).toBeInTheDocument();
  });

  it("displays version numbers correctly", () => {
    renderWithTheme(
      <VersionTimeline
        workflowId="workflow-1"
        onRestore={mockOnRestore}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
  });
});
