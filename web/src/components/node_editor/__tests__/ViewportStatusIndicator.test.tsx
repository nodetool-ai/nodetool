import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ViewportStatusIndicator from "../ViewportStatusIndicator";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("@xyflow/react", () => {
  const actual = jest.requireActual("@xyflow/react");
  return {
    ...actual,
    useViewport: jest.fn(),
    useReactFlow: jest.fn()
  };
});

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
}));

jest.mock("../../../config/shortcuts", () => ({
  getShortcutTooltip: jest.fn(() => "Reset Zoom")
}));

import { useNodes } from "../../../contexts/NodeContext";
import { useViewport, useReactFlow } from "@xyflow/react";

const mockZoom = 1.25;
const mockZoomTo = jest.fn();
const mockFitView = jest.fn();

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("ViewportStatusIndicator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockZoomTo.mockClear();
    mockFitView.mockClear();

    (useViewport as jest.Mock).mockImplementation(() => ({
      zoom: mockZoom
    }));

    (useReactFlow as jest.Mock).mockImplementation(() => ({
      zoomTo: mockZoomTo,
      fitView: mockFitView
    }));

    (useNodes as jest.Mock).mockImplementation((sel: any) =>
      sel({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, selected: true },
          { id: "2", position: { x: 100, y: 0 }, selected: false }
        ]
      })
    );
  });

  it("displays zoom percentage", () => {
    renderWithTheme(<ViewportStatusIndicator />);
    expect(screen.getByText("125%")).toBeInTheDocument();
  });

  it("displays selected/total count when nodes are selected", () => {
    renderWithTheme(<ViewportStatusIndicator />);
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("displays total count when multiple nodes exist", () => {
    (useNodes as jest.Mock).mockImplementation((sel: any) =>
      sel({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, selected: false },
          { id: "2", position: { x: 100, y: 0 }, selected: false }
        ]
      })
    );
    renderWithTheme(<ViewportStatusIndicator />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("calls zoomTo with 1 when reset zoom button is clicked", async () => {
    renderWithTheme(<ViewportStatusIndicator />);
    const zoomButton = screen.getByText("125%");
    await userEvent.click(zoomButton);
    expect(mockZoomTo).toHaveBeenCalledWith(1, { duration: 200 });
  });

  it("calls fitView when fit view button is clicked", async () => {
    renderWithTheme(<ViewportStatusIndicator />);
    const fitViewButton = screen.getByTestId("CenterFocusStrongIcon");
    await userEvent.click(fitViewButton.closest("button") as HTMLElement);
    expect(mockFitView).toHaveBeenCalledWith({ padding: 0.2, duration: 200 });
  });

  it("hides when visible prop is false", () => {
    const { container } = renderWithTheme(<ViewportStatusIndicator visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("updates zoom percentage when zoom changes", () => {
    (useViewport as jest.Mock).mockImplementation(() => ({
      zoom: 2.5
    }));
    renderWithTheme(<ViewportStatusIndicator />);
    expect(screen.getByText("250%")).toBeInTheDocument();
  });

  it("shows total count when no nodes are selected", () => {
    (useNodes as jest.Mock).mockImplementation((sel: any) =>
      sel({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, selected: false },
          { id: "2", position: { x: 100, y: 0 }, selected: false }
        ]
      })
    );
    renderWithTheme(<ViewportStatusIndicator />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders without selected/total format when no selection", () => {
    (useNodes as jest.Mock).mockImplementation((sel: any) =>
      sel({
        nodes: [{ id: "1", position: { x: 0, y: 0 }, selected: false }]
      })
    );
    renderWithTheme(<ViewportStatusIndicator />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
