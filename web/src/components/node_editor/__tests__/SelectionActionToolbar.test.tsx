import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import SelectionActionToolbar from "../SelectionActionToolbar";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: jest.fn(),
  useNodeStoreRef: jest.fn(() => ({
    getState: () => ({
      nodes: [],
      edges: [],
      workflow: { id: "workflow-test" },
      findNode: jest.fn(),
      getSelectedNodes: () => []
    })
  }))
}));

jest.mock("../../../hooks/useSelectionActions", () => ({
  useSelectionActions: jest.fn(() => ({
    alignLeft: jest.fn(),
    alignCenter: jest.fn(),
    alignRight: jest.fn(),
    alignTop: jest.fn(),
    alignMiddle: jest.fn(),
    alignBottom: jest.fn(),
    distributeHorizontal: jest.fn(),
    distributeVertical: jest.fn(),
    deleteSelected: jest.fn(),
    duplicateSelected: jest.fn(),
    groupSelected: jest.fn(),
    bypassSelected: jest.fn()
  }))
}));

const runSelectedNodes = jest.fn();
jest.mock("../../../hooks/nodes/useRunSelectedNodes", () => ({
  useRunSelectedNodes: jest.fn(() => ({
    runSelectedNodes,
    isWorkflowRunning: false,
    runProgress: null
  }))
}));

jest.mock("../../../config/shortcuts", () => ({
  getShortcutTooltip: jest.fn(() => "Test Tooltip")
}));

import { useNodes } from "../../../contexts/NodeContext";

describe("SelectionActionToolbar", () => {
  const renderWithTheme = (ui: React.ReactElement) =>
    render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

  beforeEach(() => {
    jest.clearAllMocks();
    (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
      sel({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, selected: true },
          { id: "2", position: { x: 100, y: 0 }, selected: true },
          { id: "3", position: { x: 200, y: 0 }, selected: true }
        ],
        getSelectedNodeCount: () => 3
      })
    );
  });

  it("renders when visible with 2+ nodes selected", () => {
    renderWithTheme(<SelectionActionToolbar visible={true} />);
    const toolbar = screen.getByRole("region", {
      name: /selection action toolbar/i
    });
    expect(toolbar).toBeInTheDocument();
  });

  it("does not render when not visible", () => {
    const { container } = renderWithTheme(
      <SelectionActionToolbar visible={false} />
    );
    expect(container.querySelector(".selection-action-toolbar")).toBeNull();
  });

  it("contains multiple action buttons", () => {
    renderWithTheme(<SelectionActionToolbar visible={true} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(5);
  });

  it("runs the selected nodes without forwarding the click event", async () => {
    const user = userEvent.setup();
    renderWithTheme(<SelectionActionToolbar visible={true} />);

    await user.click(screen.getByRole("button", { name: /run selected/i }));

    expect(runSelectedNodes).toHaveBeenCalledTimes(1);
    // The handler must call runSelectedNodes() with no args — passing the
    // MouseEvent as a run count would make it a silent no-op.
    expect(runSelectedNodes.mock.calls[0]).toHaveLength(0);
  });

  it("keeps align and distribute tools in an Arrange submenu", async () => {
    const user = userEvent.setup();
    renderWithTheme(<SelectionActionToolbar visible={true} />);

    // Layout tools are hidden behind the Arrange dropdown to keep the bar compact.
    expect(
      screen.queryByRole("button", { name: /align left/i })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /arrange/i }));

    expect(
      screen.getByRole("button", { name: /align left/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /distribute horizontally/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /distribute vertically/i })
    ).toBeInTheDocument();
  });
});
