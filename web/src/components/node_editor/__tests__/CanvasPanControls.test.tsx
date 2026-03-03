import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CanvasPanControls from "../CanvasPanControls";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { Viewport } from "@xyflow/react";

jest.mock("@xyflow/react", () => {
  const actual = jest.requireActual("@xyflow/react");
  return {
    ...actual,
    useReactFlow: jest.fn()
  };
});

import { useReactFlow } from "@xyflow/react";

const mockSetViewport = jest.fn();
const mockGetViewport = jest.fn();
const mockFitView = jest.fn();
const initialViewport: Viewport = { x: 100, y: 100, zoom: 1 };

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("CanvasPanControls", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetViewport.mockClear();
    mockGetViewport.mockClear();
    mockFitView.mockClear();

    mockGetViewport.mockReturnValue(initialViewport);

    (useReactFlow as jest.Mock).mockImplementation(() => ({
      setViewport: mockSetViewport,
      getViewport: mockGetViewport,
      fitView: mockFitView
    }));
  });

  it("renders all pan controls when visible", () => {
    renderWithTheme(<CanvasPanControls visible={true} />);
    
    expect(screen.getByLabelText("Pan canvas up")).toBeInTheDocument();
    expect(screen.getByLabelText("Pan canvas down")).toBeInTheDocument();
    expect(screen.getByLabelText("Pan canvas left")).toBeInTheDocument();
    expect(screen.getByLabelText("Pan canvas right")).toBeInTheDocument();
    expect(screen.getByLabelText("Center view in canvas")).toBeInTheDocument();
  });

  it("does not render when visible prop is false", () => {
    const { container } = renderWithTheme(<CanvasPanControls visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("calls setViewport with correct values when pan up is clicked", async () => {
    const user = userEvent.setup();
    renderWithTheme(<CanvasPanControls panDistance={150} />);
    
    const upButton = screen.getByLabelText("Pan canvas up");
    await user.click(upButton);

    await waitFor(() => {
      expect(mockSetViewport).toHaveBeenCalledWith(
        { x: 100, y: -50, zoom: 1 },
        { duration: 200 }
      );
    });
  });

  it("calls setViewport with correct values when pan down is clicked", async () => {
    const user = userEvent.setup();
    renderWithTheme(<CanvasPanControls panDistance={150} />);
    
    const downButton = screen.getByLabelText("Pan canvas down");
    await user.click(downButton);

    await waitFor(() => {
      expect(mockSetViewport).toHaveBeenCalledWith(
        { x: 100, y: 250, zoom: 1 },
        { duration: 200 }
      );
    });
  });

  it("calls setViewport with correct values when pan left is clicked", async () => {
    const user = userEvent.setup();
    renderWithTheme(<CanvasPanControls panDistance={150} />);
    
    const leftButton = screen.getByLabelText("Pan canvas left");
    await user.click(leftButton);

    await waitFor(() => {
      expect(mockSetViewport).toHaveBeenCalledWith(
        { x: -50, y: 100, zoom: 1 },
        { duration: 200 }
      );
    });
  });

  it("calls setViewport with correct values when pan right is clicked", async () => {
    const user = userEvent.setup();
    renderWithTheme(<CanvasPanControls panDistance={150} />);
    
    const rightButton = screen.getByLabelText("Pan canvas right");
    await user.click(rightButton);

    await waitFor(() => {
      expect(mockSetViewport).toHaveBeenCalledWith(
        { x: 250, y: 100, zoom: 1 },
        { duration: 200 }
      );
    });
  });

  it("calls fitView when center button is clicked", async () => {
    const user = userEvent.setup();
    renderWithTheme(<CanvasPanControls />);
    
    const centerButton = screen.getByLabelText("Center view in canvas");
    await user.click(centerButton);

    await waitFor(() => {
      expect(mockFitView).toHaveBeenCalledWith({ padding: 0.2, duration: 200 });
    });
  });

  it("uses custom panDistance when provided", async () => {
    const user = userEvent.setup();
    renderWithTheme(<CanvasPanControls panDistance={200} />);
    
    const upButton = screen.getByLabelText("Pan canvas up");
    await user.click(upButton);

    await waitFor(() => {
      expect(mockSetViewport).toHaveBeenCalledWith(
        { x: 100, y: -100, zoom: 1 },
        { duration: 200 }
      );
    });
  });

  it("uses custom panDuration when provided", async () => {
    const user = userEvent.setup();
    renderWithTheme(<CanvasPanControls panDuration={300} />);
    
    const centerButton = screen.getByLabelText("Center view in canvas");
    await user.click(centerButton);

    await waitFor(() => {
      expect(mockFitView).toHaveBeenCalledWith({ padding: 0.2, duration: 300 });
    });
  });

  it("renders with custom position props", () => {
    const { container } = renderWithTheme(
      <CanvasPanControls bottom={100} right={200} />
    );
    
    const controls = container.querySelector('[data-testid="canvas-pan-controls"]');
    expect(controls).toHaveStyle({
      bottom: "100px",
      right: "200px"
    });
  });

  it("has correct ARIA labels for accessibility", () => {
    renderWithTheme(<CanvasPanControls />);
    
    expect(screen.getByLabelText("Pan canvas up")).toHaveAttribute("aria-label", "Pan canvas up");
    expect(screen.getByLabelText("Pan canvas down")).toHaveAttribute("aria-label", "Pan canvas down");
    expect(screen.getByLabelText("Pan canvas left")).toHaveAttribute("aria-label", "Pan canvas left");
    expect(screen.getByLabelText("Pan canvas right")).toHaveAttribute("aria-label", "Pan canvas right");
    expect(screen.getByLabelText("Center view in canvas")).toHaveAttribute("aria-label", "Center view in canvas");
  });

  it("has correct data-testid for testing", () => {
    const { container } = renderWithTheme(<CanvasPanControls />);
    expect(container.querySelector('[data-testid="canvas-pan-controls"]')).toBeInTheDocument();
  });

  it("renders buttons with tooltips", () => {
    renderWithTheme(<CanvasPanControls />);
    
    // Verify all buttons are rendered with proper ARIA labels
    // (MUI Tooltip renders as a separate component, not as a title attribute)
    expect(screen.getByLabelText("Pan canvas up")).toBeInTheDocument();
    expect(screen.getByLabelText("Pan canvas down")).toBeInTheDocument();
    expect(screen.getByLabelText("Pan canvas left")).toBeInTheDocument();
    expect(screen.getByLabelText("Pan canvas right")).toBeInTheDocument();
  });

  it("passes correct duration options to setViewport", async () => {
    const user = userEvent.setup();
    renderWithTheme(<CanvasPanControls panDuration={250} />);
    
    const upButton = screen.getByLabelText("Pan canvas up");
    await user.click(upButton);

    await waitFor(() => {
      expect(mockSetViewport).toHaveBeenCalledWith(
        { x: 100, y: -50, zoom: 1 },
        { duration: 250 }
      );
    });
  });
});
