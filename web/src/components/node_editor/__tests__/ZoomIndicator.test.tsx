import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ZoomIndicator from "../ZoomIndicator";

const mockZoomTo = jest.fn();
const mockFitView = jest.fn();
let mockZoom = 1;

jest.mock("@xyflow/react", () => ({
  useViewport: () => ({ zoom: mockZoom }),
  useReactFlow: () => ({
    zoomTo: mockZoomTo,
    fitView: mockFitView
  })
}));

describe("ZoomIndicator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockZoom = 1;
  });

  it("renders when visible", () => {
    render(<ZoomIndicator visible={true} />);
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("does not render when not visible", () => {
    const { container } = render(<ZoomIndicator visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("displays correct zoom percentage", () => {
    mockZoom = 0.5;
    render(<ZoomIndicator />);
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("calls zoomTo when zoom in button is clicked", () => {
    render(<ZoomIndicator />);
    const zoomInButton = screen.getByRole("button", { name: /zoom in/i });
    fireEvent.click(zoomInButton);
    expect(mockZoomTo).toHaveBeenCalledWith(1.2, { duration: 200 });
  });

  it("calls zoomTo when zoom out button is clicked", () => {
    render(<ZoomIndicator />);
    const zoomOutButton = screen.getByRole("button", { name: /zoom out/i });
    fireEvent.click(zoomOutButton);
    expect(mockZoomTo).toHaveBeenCalledWith(0.8, { duration: 200 });
  });

  it("resets zoom to 100% when percentage is clicked", () => {
    mockZoom = 0.5;
    render(<ZoomIndicator />);
    const percentageText = screen.getByText("50%");
    fireEvent.click(percentageText);
    expect(mockZoomTo).toHaveBeenCalledWith(1, { duration: 200 });
  });

  it("calls fitView when fit button is clicked", () => {
    render(<ZoomIndicator />);
    const fitButton = screen.getByRole("button", { name: /fit all nodes/i });
    fireEvent.click(fitButton);
    expect(mockFitView).toHaveBeenCalledWith({ padding: 0.2, duration: 200 });
  });

  it("renders zoom in/out and fit buttons", () => {
    render(<ZoomIndicator />);
    expect(screen.getByRole("button", { name: /zoom in/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /zoom out/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /fit all nodes/i })).toBeInTheDocument();
  });
});
