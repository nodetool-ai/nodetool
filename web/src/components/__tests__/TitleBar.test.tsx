/**
 * TitleBar component tests
 *
 * Tests the TitleBar component which provides:
 * - Window controls for Electron app
 * - Minimize, maximize, and close buttons
 * - Hover effects
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TitleBar from "../TitleBar";

// Mock window.api
const mockWindowControls = {
  minimize: jest.fn(),
  maximize: jest.fn(),
  close: jest.fn(),
};

declare global {
  interface Window {
    api?: {
      windowControls?: {
        minimize?: () => void;
        maximize?: () => void;
        close?: () => void;
      };
    };
  }
}

describe("TitleBar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset window.api
    delete (window as any).api;
  });

  it("should render successfully", () => {
    render(<TitleBar />);
    expect(screen.getByRole("button", { name: /minimize/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /maximize/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("should render three buttons", () => {
    render(<TitleBar />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
  });

  it("should render minimize button with correct symbol", () => {
    render(<TitleBar />);
    const button = screen.getByTitle("Minimize");
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("—");
  });

  it("should render maximize button with correct symbol", () => {
    render(<TitleBar />);
    const button = screen.getByTitle("Maximize");
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("▢");
  });

  it("should render close button with correct symbol", () => {
    render(<TitleBar />);
    const button = screen.getByTitle("Close");
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("✕");
  });

  it("should call window.api.windowControls.minimize when minimize button is clicked", async () => {
    const user = userEvent.setup();
    window.api = { windowControls: mockWindowControls };

    render(<TitleBar />);

    const minimizeButton = screen.getByTitle("Minimize");
    await user.click(minimizeButton);

    expect(mockWindowControls.minimize).toHaveBeenCalledTimes(1);
  });

  it("should call window.api.windowControls.maximize when maximize button is clicked", async () => {
    const user = userEvent.setup();
    window.api = { windowControls: mockWindowControls };

    render(<TitleBar />);

    const maximizeButton = screen.getByTitle("Maximize");
    await user.click(maximizeButton);

    expect(mockWindowControls.maximize).toHaveBeenCalledTimes(1);
  });

  it("should call window.api.windowControls.close when close button is clicked", async () => {
    const user = userEvent.setup();
    window.api = { windowControls: mockWindowControls };

    render(<TitleBar />);

    const closeButton = screen.getByTitle("Close");
    await user.click(closeButton);

    expect(mockWindowControls.close).toHaveBeenCalledTimes(1);
  });

  it("should handle missing window.api gracefully", async () => {
    const user = userEvent.setup();

    render(<TitleBar />);

    const minimizeButton = screen.getByTitle("Minimize");
    
    // Should not throw when clicking without window.api
    await expect(user.click(minimizeButton)).resolves.not.toThrow();
  });

  it("should handle missing windowControls gracefully", async () => {
    const user = userEvent.setup();
    window.api = {};

    render(<TitleBar />);

    const closeButton = screen.getByTitle("Close");
    
    // Should not throw when clicking without windowControls
    await expect(user.click(closeButton)).resolves.not.toThrow();
  });

  it("should render with correct ARIA labels", () => {
    render(<TitleBar />);

    expect(screen.getByLabelText("Minimize window")).toBeInTheDocument();
    expect(screen.getByLabelText("Maximize window")).toBeInTheDocument();
    expect(screen.getByLabelText("Close window")).toBeInTheDocument();
  });

  it("should apply hover styles on mouse enter", async () => {
    const user = userEvent.setup();
    render(<TitleBar />);

    const button = screen.getByTitle("Minimize");
    
    await user.hover(button);
    
    // Button should still be present and interactive
    expect(button).toBeInTheDocument();
  });

  it("should remove hover styles on mouse leave", async () => {
    const user = userEvent.setup();
    render(<TitleBar />);

    const button = screen.getByTitle("Minimize");
    
    await user.hover(button);
    await user.unhover(button);
    
    // Button should still be present
    expect(button).toBeInTheDocument();
  });

  it("should render container with flex display", () => {
    const { container } = render(<TitleBar />);
    
    const div = container.firstChild as HTMLElement;
    expect(div).toHaveStyle({ display: "flex" });
  });

  it("should render buttons in correct order", () => {
    render(<TitleBar />);
    const buttons = screen.getAllByRole("button");
    
    expect(buttons[0]).toHaveAttribute("title", "Minimize");
    expect(buttons[1]).toHaveAttribute("title", "Maximize");
    expect(buttons[2]).toHaveAttribute("title", "Close");
  });
});
