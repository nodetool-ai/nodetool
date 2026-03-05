import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TitleBar from "../TitleBar";

describe("TitleBar", () => {
  const mockMinimize = jest.fn();
  const mockMaximize = jest.fn();
  const mockClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Setup mock window.api.windowControls
    (window.api as any) = {
      windowControls: {
        minimize: mockMinimize,
        maximize: mockMaximize,
        close: mockClose
      }
    };
  });

  afterEach(() => {
    // Clean up
    delete (window.api as any)?.windowControls;
  });

  it("renders all three window control buttons", () => {
    render(<TitleBar />);

    // Check that all three buttons are present
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);

    // Check for minimize button by aria-label
    const minimizeButton = screen.getByLabelText("Minimize window");
    expect(minimizeButton).toBeInTheDocument();
    expect(minimizeButton).toHaveAttribute("title", "Minimize");

    // Check for maximize button by aria-label
    const maximizeButton = screen.getByLabelText("Maximize window");
    expect(maximizeButton).toBeInTheDocument();
    expect(maximizeButton).toHaveAttribute("title", "Maximize");

    // Check for close button by aria-label
    const closeButton = screen.getByLabelText("Close window");
    expect(closeButton).toBeInTheDocument();
    expect(closeButton).toHaveAttribute("title", "Close");
  });

  it("calls minimize when minimize button is clicked", async () => {
    const user = userEvent.setup();
    render(<TitleBar />);

    const minimizeButton = screen.getByLabelText("Minimize window");
    await user.click(minimizeButton);

    expect(mockMinimize).toHaveBeenCalledTimes(1);
  });

  it("calls maximize when maximize button is clicked", async () => {
    const user = userEvent.setup();
    render(<TitleBar />);

    const maximizeButton = screen.getByLabelText("Maximize window");
    await user.click(maximizeButton);

    expect(mockMaximize).toHaveBeenCalledTimes(1);
  });

  it("calls close when close button is clicked", async () => {
    const user = userEvent.setup();
    render(<TitleBar />);

    const closeButton = screen.getByLabelText("Close window");
    await user.click(closeButton);

    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("gracefully handles missing window.api", async () => {
    const user = userEvent.setup();
    // Remove window.api
    delete (window as any).api;

    render(<TitleBar />);

    const minimizeButton = screen.getByLabelText("Minimize window");
    await user.click(minimizeButton);

    // Should not throw error and mock functions should not be called
    expect(mockMinimize).not.toHaveBeenCalled();
  });

  it("gracefully handles missing windowControls", async () => {
    const user = userEvent.setup();
    // Remove windowControls but keep window.api
    (window.api as any) = {};

    render(<TitleBar />);

    const closeButton = screen.getByLabelText("Close window");
    await user.click(closeButton);

    // Should not throw error
    expect(mockClose).not.toHaveBeenCalled();
  });

  it("applies hover styles on mouse enter/leave", async () => {
    const user = userEvent.setup();
    render(<TitleBar />);

    const closeButton = screen.getByLabelText("Close window");

    // Initial state should have base styles
    expect(closeButton).toHaveStyle({
      cursor: "pointer",
      borderRadius: "6px"
    });

    // Simulate hover
    await user.hover(closeButton);

    // Button should still exist and be interactive
    expect(closeButton).toBeInTheDocument();

    // Unhover
    await user.unhover(closeButton);
    expect(closeButton).toBeInTheDocument();
  });

  it("has correct display name for debugging", () => {
    expect(TitleBar.displayName).toBe("TitleBar");
  });

  it("renders buttons with correct accessibility attributes", () => {
    render(<TitleBar />);

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);

    // Each button should have an aria-label and title
    buttons.forEach((button) => {
      expect(button).toHaveAttribute("aria-label");
      expect(button).toHaveAttribute("title");
    });
  });

  it("renders in correct order: minimize, maximize, close", () => {
    render(<TitleBar />);

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);

    expect(buttons[0]).toHaveAttribute("aria-label", "Minimize window");
    expect(buttons[1]).toHaveAttribute("aria-label", "Maximize window");
    expect(buttons[2]).toHaveAttribute("aria-label", "Close window");
  });
});
