import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Position } from "@xyflow/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import LinkLayer, { linkAnchors } from "../LinkLayer";

const mockOpenContextMenu = jest.fn();
const mockState = {
  links: [
    { id: "link-1", source: "a", target: "b", label: "reference" },
    { id: "link-2", source: "a", target: "missing" }
  ],
  selectedLinkIds: [] as string[],
  setLinkSelection: jest.fn(),
  deleteEdge: jest.fn(),
  setSelectedNodes: jest.fn()
};

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: (selector: (state: typeof mockState) => unknown) =>
    selector(mockState)
}));

jest.mock("../../../stores/ContextMenuStore", () => ({
  __esModule: true,
  default: (selector: (state: { openContextMenu: jest.Mock }) => unknown) =>
    selector({ openContextMenu: mockOpenContextMenu })
}));

const BOXES: Record<string, { x: number; y: number }> = {
  a: { x: 0, y: 0 },
  b: { x: 400, y: 0 }
};

jest.mock("@xyflow/react", () => {
  const actual = jest.requireActual("@xyflow/react");
  return {
    ...actual,
    ViewportPortal: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    getBezierPath: () => ["M0,0 C1,1 2,2 3,3", 50, 25, 0, 0],
    useInternalNode: (id: string) =>
      BOXES[id]
        ? {
            id,
            measured: { width: 100, height: 50 },
            internals: { positionAbsolute: BOXES[id] }
          }
        : undefined
  };
});

const renderLayer = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <LinkLayer />
    </ThemeProvider>
  );

describe("LinkLayer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState.selectedLinkIds = [];
  });

  it("draws links whose nodes exist, with their label", () => {
    renderLayer();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: 'Link "reference"' })).toBeTruthy();
    expect(screen.getByText("reference")).toBeTruthy();
  });

  it("selects on click, deletes on middle click, opens the edge menu on right click", () => {
    renderLayer();
    const hit = screen.getByRole("button", { name: 'Link "reference"' });

    fireEvent.click(hit);
    expect(mockState.setSelectedNodes).toHaveBeenCalledWith([]);
    expect(mockState.setLinkSelection).toHaveBeenCalledWith(["link-1"]);

    fireEvent(hit, new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    expect(mockState.deleteEdge).toHaveBeenCalledWith("link-1");

    fireEvent.contextMenu(hit, { clientX: 10, clientY: 20 });
    expect(mockOpenContextMenu).toHaveBeenCalledWith(
      "edge-context-menu",
      "link-1",
      10,
      20
    );
  });

  it("deletes a focused link with the Delete key", () => {
    renderLayer();
    fireEvent.keyDown(screen.getByRole("button"), { key: "Delete" });
    expect(mockState.deleteEdge).toHaveBeenCalledWith("link-1");
  });
});

describe("linkAnchors", () => {
  const box = (x: number, y: number) => ({ x, y, width: 100, height: 50 });

  it("joins facing sides of side-by-side nodes", () => {
    expect(linkAnchors(box(0, 0), box(400, 0))).toMatchObject({
      sourceX: 100,
      sourcePosition: Position.Right,
      targetX: 400,
      targetPosition: Position.Left
    });
    expect(linkAnchors(box(400, 0), box(0, 0))).toMatchObject({
      sourceX: 400,
      sourcePosition: Position.Left,
      targetX: 100,
      targetPosition: Position.Right
    });
  });

  it("joins top and bottom of stacked nodes", () => {
    expect(linkAnchors(box(0, 0), box(0, 400))).toMatchObject({
      sourceY: 50,
      sourcePosition: Position.Bottom,
      targetY: 400,
      targetPosition: Position.Top
    });
  });
});
