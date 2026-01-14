import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
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
const mockZoomIn = jest.fn();
const mockZoomOut = jest.fn();
const mockFitView = jest.fn();

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("ViewportStatusIndicator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockZoomTo.mockClear();
    mockZoomIn.mockClear();
    mockZoomOut.mockClear();
    mockFitView.mockClear();

    (useViewport as jest.Mock).mockImplementation(() => ({
      zoom: mockZoom
    }));

    (useReactFlow as jest.Mock).mockImplementation(() => ({
      zoomTo: mockZoomTo,
      zoomIn: mockZoomIn,
      zoomOut: mockZoomOut,
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

  it("displays zoom with highlight when at preset level", () => {
    (useViewport as jest.Mock).mockImplementation(() => ({
      zoom: 1
    }));
    renderWithTheme(<ViewportStatusIndicator />);
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("opens zoom preset menu when zoom percentage is clicked", async () => {
    renderWithTheme(<ViewportStatusIndicator />);
    const zoomButton = screen.getByText("125%");
    await userEvent.click(zoomButton);
    await waitFor(() => {
      expect(screen.getByText("25%")).toBeInTheDocument();
      expect(screen.getByText("50%")).toBeInTheDocument();
      expect(screen.getByText("75%")).toBeInTheDocument();
      expect(screen.getByText("100%")).toBeInTheDocument();
      expect(screen.getByText("150%")).toBeInTheDocument();
      expect(screen.getByText("200%")).toBeInTheDocument();
    });
  });

  it("calls zoomTo with preset value when menu item is clicked", async () => {
    renderWithTheme(<ViewportStatusIndicator />);
    const zoomButton = screen.getByText("125%");
    await userEvent.click(zoomButton);
    const preset100 = await screen.findByText("100%");
    await userEvent.click(preset100);
    expect(mockZoomTo).toHaveBeenCalledWith(1, { duration: 200 });
  });

  it("closes menu after selecting preset", async () => {
    renderWithTheme(<ViewportStatusIndicator />);
    const zoomButton = screen.getByText("125%");
    await userEvent.click(zoomButton);
    const preset100 = await screen.findByText("100%");
    await userEvent.click(preset100);
    await waitFor(() => {
      expect(screen.queryByText("25%")).not.toBeInTheDocument();
    });
  });

  it("calls zoomTo with adjusted zoom when zoom in button is clicked", async () => {
    (useViewport as jest.Mock).mockImplementation(() => ({
      zoom: 1.25
    }));
    renderWithTheme(<ViewportStatusIndicator />);
    const addButton = screen.getByTestId("AddIcon").closest("button") as HTMLElement;
    await userEvent.click(addButton);
    expect(mockZoomTo).toHaveBeenCalledWith(Math.min(1.25 * 1.2, 5), { duration: 100 });
  });

  it("calls zoomTo with adjusted zoom when zoom out button is clicked", async () => {
    (useViewport as jest.Mock).mockImplementation(() => ({
      zoom: 1.25
    }));
    renderWithTheme(<ViewportStatusIndicator />);
    const removeButton = screen.getByTestId("RemoveIcon").closest("button") as HTMLElement;
    await userEvent.click(removeButton);
    expect(mockZoomTo).toHaveBeenCalledWith(Math.max(1.25 / 1.2, 0.1), { duration: 100 });
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

  it("shows correct zoom percentage for different zoom levels", () => {
    const zoomLevels = [0.1, 0.25, 0.5, 1, 1.5, 2, 3, 5];
    for (const z of zoomLevels) {
      (useViewport as jest.Mock).mockImplementation(() => ({
        zoom: z
      }));
      const { unmount } = renderWithTheme(<ViewportStatusIndicator />);
      expect(screen.getByText(`${Math.round(z * 100)}%`)).toBeInTheDocument();
      unmount();
    }
  });

  it("renders zoom controls visible by default", () => {
    renderWithTheme(<ViewportStatusIndicator />);
    expect(screen.getByTestId("RemoveIcon")).toBeInTheDocument();
    expect(screen.getByTestId("AddIcon")).toBeInTheDocument();
    expect(screen.getByTestId("CenterFocusStrongIcon")).toBeInTheDocument();
  });
});
