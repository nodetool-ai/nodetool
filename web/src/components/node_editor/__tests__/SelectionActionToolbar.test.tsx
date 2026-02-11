import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import SelectionActionToolbar from "../SelectionActionToolbar";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
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
        ]
      })
    );
  });

  it("renders when visible with 2+ nodes selected", () => {
    renderWithTheme(<SelectionActionToolbar visible={true} />);
    const toolbar = screen.getByRole("region", { name: /selection action toolbar/i });
    expect(toolbar).toBeInTheDocument();
  });

  it("does not render when not visible", () => {
    const { container } = renderWithTheme(<SelectionActionToolbar visible={false} />);
    expect(container.querySelector(".selection-action-toolbar")).toBeNull();
  });

  it("contains multiple action buttons", () => {
    renderWithTheme(<SelectionActionToolbar visible={true} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(5);
  });
});
