import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { ZoomControls } from "../ZoomControls";
import mockTheme from "../../../__mocks__/themeMock";

// Mock icons
jest.mock("@mui/icons-material/ZoomIn", () => ({
  __esModule: true,
  default: () => <span data-testid="zoom-in-icon" />
}));

jest.mock("@mui/icons-material/ZoomOut", () => ({
  __esModule: true,
  default: () => <span data-testid="zoom-out-icon" />
}));

jest.mock("@mui/icons-material/RestartAlt", () => ({
  __esModule: true,
  default: () => <span data-testid="reset-icon" />
}));

describe("ZoomControls", () => {
  const mockOnZoomChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders with default props", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomControls zoom={1} onZoomChange={mockOnZoomChange} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("zoom-out-icon")).toBeInTheDocument();
    expect(screen.getByTestId("zoom-in-icon")).toBeInTheDocument();
    expect(screen.getByTestId("reset-icon")).toBeInTheDocument();
  });

  it("displays correct zoom percentage", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomControls zoom={1} onZoomChange={mockOnZoomChange} />
      </ThemeProvider>
    );

    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("displays 50% for zoom 0.5", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomControls zoom={0.5} onZoomChange={mockOnZoomChange} />
      </ThemeProvider>
    );

    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("displays 200% for zoom 2", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomControls zoom={2} onZoomChange={mockOnZoomChange} />
      </ThemeProvider>
    );

    expect(screen.getByText("200%")).toBeInTheDocument();
  });

  it("calls onZoomChange with increased value when zoom in is clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomControls zoom={1} onZoomChange={mockOnZoomChange} />
      </ThemeProvider>
    );

    const zoomInButton = screen.getAllByRole("button")[1]; // Second button is zoom in
    fireEvent.click(zoomInButton);

    expect(mockOnZoomChange).toHaveBeenCalledWith(1.1);
  });

  it("calls onZoomChange with decreased value when zoom out is clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomControls zoom={1} onZoomChange={mockOnZoomChange} />
      </ThemeProvider>
    );

    const zoomOutButton = screen.getAllByRole("button")[0]; // First button is zoom out
    fireEvent.click(zoomOutButton);

    expect(mockOnZoomChange).toHaveBeenCalledWith(0.9);
  });

  it("resets to default zoom when reset button is clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomControls zoom={2} onZoomChange={mockOnZoomChange} />
      </ThemeProvider>
    );

    const resetButton = screen.getAllByRole("button")[2]; // Third button is reset
    fireEvent.click(resetButton);

    expect(mockOnZoomChange).toHaveBeenCalledWith(1);
  });

  it("respects custom defaultZoom for reset", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomControls zoom={2} onZoomChange={mockOnZoomChange} defaultZoom={0.5} />
      </ThemeProvider>
    );

    const resetButton = screen.getAllByRole("button")[2];
    fireEvent.click(resetButton);

    expect(mockOnZoomChange).toHaveBeenCalledWith(0.5);
  });

  it("uses custom step size", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomControls zoom={1} onZoomChange={mockOnZoomChange} step={0.25} />
      </ThemeProvider>
    );

    const zoomInButton = screen.getAllByRole("button")[1];
    fireEvent.click(zoomInButton);

    expect(mockOnZoomChange).toHaveBeenCalledWith(1.25);
  });

  it("disables zoom out button at min zoom", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomControls zoom={0.1} onZoomChange={mockOnZoomChange} minZoom={0.1} />
      </ThemeProvider>
    );

    const zoomOutButton = screen.getAllByRole("button")[0];
    expect(zoomOutButton).toBeDisabled();
  });

  it("disables zoom in button at max zoom", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomControls zoom={5} onZoomChange={mockOnZoomChange} maxZoom={5} />
      </ThemeProvider>
    );

    const zoomInButton = screen.getAllByRole("button")[1];
    expect(zoomInButton).toBeDisabled();
  });

  it("respects custom minZoom boundary", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomControls zoom={0.3} onZoomChange={mockOnZoomChange} minZoom={0.25} />
      </ThemeProvider>
    );

    const zoomOutButton = screen.getAllByRole("button")[0];
    fireEvent.click(zoomOutButton);

    expect(mockOnZoomChange).toHaveBeenCalledWith(0.25); // Should clamp to minZoom (0.3 - 0.1 = 0.2, clamped to 0.25)
  });

  it("respects custom maxZoom boundary", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomControls zoom={2.4} onZoomChange={mockOnZoomChange} maxZoom={2.5} />
      </ThemeProvider>
    );

    const zoomInButton = screen.getAllByRole("button")[1];
    fireEvent.click(zoomInButton);

    expect(mockOnZoomChange).toHaveBeenCalledWith(2.5); // Should clamp to maxZoom (2.4 + 0.1 = 2.5, at limit)
  });

  it("does not show zoom value when showValue is false", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomControls zoom={1} onZoomChange={mockOnZoomChange} showValue={false} />
      </ThemeProvider>
    );

    expect(screen.queryByText("100%")).not.toBeInTheDocument();
  });

  it("does not show reset button when showReset is false", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomControls zoom={1} onZoomChange={mockOnZoomChange} showReset={false} />
      </ThemeProvider>
    );

    expect(screen.getByTestId("zoom-out-icon")).toBeInTheDocument();
    expect(screen.getByTestId("zoom-in-icon")).toBeInTheDocument();
    expect(screen.queryByTestId("reset-icon")).not.toBeInTheDocument();
  });

  it("has aria-labels for accessibility", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomControls zoom={1} onZoomChange={mockOnZoomChange} />
      </ThemeProvider>
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveAttribute("aria-label", "Zoom out");
    expect(buttons[1]).toHaveAttribute("aria-label", "Zoom in");
    expect(buttons[2]).toHaveAttribute("aria-label", "Reset zoom");
  });

  it("applies custom className", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomControls zoom={1} onZoomChange={mockOnZoomChange} className="custom-zoom" />
      </ThemeProvider>
    );

    const container = screen.getByText("100%").parentElement;
    expect(container).toHaveClass("custom-zoom");
  });

  it("applies nodrag class by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomControls zoom={1} onZoomChange={mockOnZoomChange} />
      </ThemeProvider>
    );

    const container = screen.getByText("100%").parentElement;
    expect(container).toHaveClass("nodrag");
  });

  it("applies zoom-controls class", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomControls zoom={1} onZoomChange={mockOnZoomChange} />
      </ThemeProvider>
    );

    const container = screen.getByText("100%").parentElement;
    expect(container).toHaveClass("zoom-controls");
  });

  it("renders with medium button size", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomControls zoom={1} onZoomChange={mockOnZoomChange} buttonSize="medium" />
      </ThemeProvider>
    );

    expect(screen.getByTestId("zoom-in-icon")).toBeInTheDocument();
    expect(screen.getByTestId("zoom-out-icon")).toBeInTheDocument();
  });

  it("rounds zoom percentage correctly", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomControls zoom={1.234} onZoomChange={mockOnZoomChange} />
      </ThemeProvider>
    );

    expect(screen.getByText("123%")).toBeInTheDocument();
  });

  it("handles edge case: zoom at exactly minZoom", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomControls zoom={0.1} onZoomChange={mockOnZoomChange} minZoom={0.1} />
      </ThemeProvider>
    );

    const zoomOutButton = screen.getAllByRole("button")[0];
    expect(zoomOutButton).toBeDisabled();

    // Zoom in should still work
    const zoomInButton = screen.getAllByRole("button")[1];
    fireEvent.click(zoomInButton);
    expect(mockOnZoomChange).toHaveBeenCalledWith(0.2);
  });

  it("handles edge case: zoom at exactly maxZoom", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomControls zoom={5} onZoomChange={mockOnZoomChange} maxZoom={5} />
      </ThemeProvider>
    );

    const zoomInButton = screen.getAllByRole("button")[1];
    expect(zoomInButton).toBeDisabled();

    // Zoom out should still work
    const zoomOutButton = screen.getAllByRole("button")[0];
    fireEvent.click(zoomOutButton);
    expect(mockOnZoomChange).toHaveBeenCalledWith(4.9);
  });

  it("handles step size that results in non-integer percentages", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomControls zoom={1} onZoomChange={mockOnZoomChange} step={0.15} />
      </ThemeProvider>
    );

    const zoomInButton = screen.getAllByRole("button")[1];
    fireEvent.click(zoomInButton);

    expect(mockOnZoomChange).toHaveBeenCalledWith(1.15);
  });

  it("respects both min and max zoom boundaries simultaneously", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ZoomControls zoom={1} onZoomChange={mockOnZoomChange} minZoom={0.5} maxZoom={2} />
      </ThemeProvider>
    );

    // Test min boundary
    const zoomOutButton = screen.getAllByRole("button")[0];
    fireEvent.click(zoomOutButton);
    expect(mockOnZoomChange).toHaveBeenCalledWith(0.9);

    // Test max boundary
    const zoomInButton = screen.getAllByRole("button")[1];
    fireEvent.click(zoomInButton);
    expect(mockOnZoomChange).toHaveBeenCalledWith(1.1);
  });
});
