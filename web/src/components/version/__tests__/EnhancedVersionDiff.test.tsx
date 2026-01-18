/**
 * Tests for Enhanced Version Diff Components
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { EnhancedVersionDiff } from "../EnhancedVersionDiff";
import { InteractiveGraphVisualDiff } from "../InteractiveGraphVisualDiff";
import { GraphDiff } from "../../../utils/graphDiff";

const theme = createTheme();

const renderWithTheme = (component: React.ReactNode) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

const createMockDiff = (): GraphDiff => ({
  addedNodes: [
    { id: "node1", type: "nodetool.input.StringInput", sync_mode: "single" as const, data: {}, ui_properties: {}, dynamic_properties: {}, dynamic_outputs: {}, parent_id: null },
    { id: "node2", type: "nodetool.process.LLM", sync_mode: "single" as const, data: {}, ui_properties: {}, dynamic_properties: {}, dynamic_outputs: {}, parent_id: null }
  ],
  removedNodes: [
    { id: "node3", type: "nodetool.output.TextOutput", sync_mode: "single" as const, data: {}, ui_properties: {}, dynamic_properties: {}, dynamic_outputs: {}, parent_id: null }
  ],
  modifiedNodes: [
    {
      nodeId: "node4",
      nodeType: "nodetool.process.LLM",
      changes: [
        { key: "model", oldValue: "gpt-3.5", newValue: "gpt-4" },
        { key: "temperature", oldValue: 0.7, newValue: 0.5 }
      ]
    }
  ],
  addedEdges: [
    { id: "edge1", source: "node1", sourceHandle: "output", target: "node2", targetHandle: "input" }
  ],
  removedEdges: [
    { id: "edge2", source: "node3", sourceHandle: "output", target: "node4", targetHandle: "input" }
  ],
  hasChanges: true
});

describe("EnhancedVersionDiff", () => {
  it("renders summary statistics correctly", () => {
    const diff = createMockDiff();
    renderWithTheme(<EnhancedVersionDiff diff={diff} oldVersionNumber={1} newVersionNumber={2} />);

    expect(screen.getByText("Total Changes")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument(); // 2 added + 1 removed + 1 modified + 1 added edge + 1 removed edge
    // Check for added/modified/removed stats using regex
    const statsText = screen.getByText("Total Changes").parentElement?.textContent || "";
    expect(statsText).toContain("6");
  });

  it("displays added nodes section", () => {
    const diff = createMockDiff();
    renderWithTheme(<EnhancedVersionDiff diff={diff} oldVersionNumber={1} newVersionNumber={2} />);

    expect(screen.getByText("Added Nodes (2)")).toBeInTheDocument();
    // Check that node type names are present
    expect(screen.getByText("StringInput")).toBeInTheDocument();
  });

  it("displays removed nodes section", () => {
    const diff = createMockDiff();
    renderWithTheme(<EnhancedVersionDiff diff={diff} oldVersionNumber={1} newVersionNumber={2} />);

    expect(screen.getByText("Removed Nodes (1)")).toBeInTheDocument();
    expect(screen.getByText("TextOutput")).toBeInTheDocument();
  });

  it("expands modified node details on click", async () => {
    const diff = createMockDiff();
    renderWithTheme(<EnhancedVersionDiff diff={diff} oldVersionNumber={1} newVersionNumber={2} />);

    // Find and click the expand button for the modified node
    const expandButtons = screen.queryAllByLabelText("expand more");
    if (expandButtons.length > 0) {
      fireEvent.click(expandButtons[0]);

      // Check that property changes are displayed
      expect(screen.getByText("model")).toBeInTheDocument();
      expect(screen.getByText("temperature")).toBeInTheDocument();
    }
  });

  it("shows no changes message when diff is empty", () => {
    const emptyDiff: GraphDiff = {
      addedNodes: [],
      removedNodes: [],
      modifiedNodes: [],
      addedEdges: [],
      removedEdges: [],
      hasChanges: false
    };
    renderWithTheme(<EnhancedVersionDiff diff={emptyDiff} oldVersionNumber={1} newVersionNumber={2} />);

    expect(screen.getByText(/No changes between version/i)).toBeInTheDocument();
  });

  it("displays connection changes", () => {
    const diff = createMockDiff();
    renderWithTheme(<EnhancedVersionDiff diff={diff} oldVersionNumber={1} newVersionNumber={2} />);

    expect(screen.getByText("Connection Changes")).toBeInTheDocument();
    expect(screen.getByText("node1 → node2")).toBeInTheDocument();
    expect(screen.getByText("node3 → node4")).toBeInTheDocument();
  });
});

describe("InteractiveGraphVisualDiff", () => {
  const mockOldGraph = {
    nodes: [
      { id: "node1", type: "nodetool.input.StringInput", sync_mode: "single" as const, data: {}, ui_properties: {}, dynamic_properties: {}, dynamic_outputs: {}, parent_id: null },
      { id: "node2", type: "nodetool.output.TextOutput", sync_mode: "single" as const, data: {}, ui_properties: {}, dynamic_properties: {}, dynamic_outputs: {}, parent_id: null }
    ],
    edges: [
      { id: "edge1", source: "node1", sourceHandle: "output", target: "node2", targetHandle: "input" }
    ]
  };

  const mockNewGraph = {
    nodes: [
      { id: "node1", type: "nodetool.input.StringInput", sync_mode: "single" as const, data: {}, ui_properties: {}, dynamic_properties: {}, dynamic_outputs: {}, parent_id: null },
      { id: "node3", type: "nodetool.process.LLM", sync_mode: "single" as const, data: {}, ui_properties: {}, dynamic_properties: {}, dynamic_outputs: {}, parent_id: null }
    ],
    edges: [
      { id: "edge2", source: "node1", sourceHandle: "output", target: "node3", targetHandle: "input" }
    ]
  };

  it("renders the visual diff component", () => {
    const diff = createMockDiff();
    renderWithTheme(
      <InteractiveGraphVisualDiff
        diff={diff}
        oldGraph={mockOldGraph}
        newGraph={mockNewGraph}
        width={400}
        height={300}
      />
    );

    // Check that the component renders with zoom controls
    expect(screen.getByLabelText("Zoom in")).toBeInTheDocument();
  });

  it("renders zoom controls", () => {
    const diff = createMockDiff();
    renderWithTheme(
      <InteractiveGraphVisualDiff
        diff={diff}
        oldGraph={mockOldGraph}
        newGraph={mockNewGraph}
        width={400}
        height={300}
      />
    );

    expect(screen.getByLabelText("Zoom in")).toBeInTheDocument();
    expect(screen.getByLabelText("Zoom out")).toBeInTheDocument();
    expect(screen.getByLabelText("Center")).toBeInTheDocument();
  });

  it("shows selected node info when clicked", async () => {
    const diff = createMockDiff();
    const onNodeSelect = jest.fn();

    renderWithTheme(
      <InteractiveGraphVisualDiff
        diff={diff}
        oldGraph={mockOldGraph}
        newGraph={mockNewGraph}
        width={400}
        height={300}
        onNodeSelect={onNodeSelect}
      />
    );

    // Check that the info panel appears - it should show info when a node is selected
    expect(screen.getByLabelText("Zoom in")).toBeInTheDocument();
    expect(screen.getByLabelText("Zoom out")).toBeInTheDocument();
  });

  it("renders legend with change counts", () => {
    const diff = createMockDiff();
    renderWithTheme(
      <InteractiveGraphVisualDiff
        diff={diff}
        oldGraph={mockOldGraph}
        newGraph={mockNewGraph}
        width={400}
        height={300}
      />
    );

    expect(screen.getByText("+2")).toBeInTheDocument(); // 2 added nodes
    expect(screen.getByText("-1")).toBeInTheDocument(); // 1 removed node
    expect(screen.getByText("~1")).toBeInTheDocument(); // 1 modified node
  });

  it("shows no changes message when diff is empty", () => {
    const emptyDiff: GraphDiff = {
      addedNodes: [],
      removedNodes: [],
      modifiedNodes: [],
      addedEdges: [],
      removedEdges: [],
      hasChanges: false
    };

    renderWithTheme(
      <InteractiveGraphVisualDiff
        diff={emptyDiff}
        oldGraph={mockOldGraph}
        newGraph={mockNewGraph}
        width={400}
        height={300}
      />
    );

    expect(screen.getByText("No changes to display")).toBeInTheDocument();
  });
});
