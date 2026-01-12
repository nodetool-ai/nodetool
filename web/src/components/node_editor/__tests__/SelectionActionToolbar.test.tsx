import React from "react";
import { render, screen } from "@testing-library/react";
import SelectionActionToolbar from "../SelectionActionToolbar";

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
  beforeEach(() => {
    jest.clearAllMocks();
    (useNodes as unknown as jest.Mock).mockImplementation((sel: any) =>
      sel({
        getSelectedNodes: () => [
          { id: "1", position: { x: 0, y: 0 }, selected: true },
          { id: "2", position: { x: 100, y: 0 }, selected: true },
          { id: "3", position: { x: 200, y: 0 }, selected: true }
        ]
      })
    );
  });

  it("renders when visible with 2+ nodes selected", () => {
    render(<SelectionActionToolbar visible={true} onToggleNodeInfo={jest.fn()} />);
    const toolbar = screen.getByRole("region", { name: /selection action toolbar/i });
    expect(toolbar).toBeInTheDocument();
  });

  it("does not render when not visible", () => {
    const { container } = render(<SelectionActionToolbar visible={false} onToggleNodeInfo={jest.fn()} />);
    expect(container.querySelector(".selection-action-toolbar")).toBeNull();
  });

  it("contains multiple action buttons", () => {
    render(<SelectionActionToolbar visible={true} onToggleNodeInfo={jest.fn()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(5);
  });
});
