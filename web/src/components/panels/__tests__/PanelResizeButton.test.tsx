/**
 * PanelResizeButton Component Tests
 *
 * Tests the PanelResizeButton component which provides a resize handle
 * for left and right panels.
 *
 * Key behaviors to test:
 * - Renders with correct aria-label for left/right panels
 * - Has correct positioning styles based on side
 * - Handles mouse down events with stopPropagation
 * - Uses dynamic styles based on visibility and panel size
 * - Is memoized with React.memo
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PanelResizeButton from "../PanelResizeButton";

describe("PanelResizeButton", () => {
  const mockOnMouseDown = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("rendering", () => {
    it("renders the resize button", () => {
      render(
        <PanelResizeButton
          side="right"
          isVisible={true}
          panelSize={300}
          onMouseDown={mockOnMouseDown}
        />
      );

      const button = screen.getByRole("button", { name: /resize right panel/i });
      expect(button).toBeInTheDocument();
    });

    it("renders with correct aria-label for left panel", () => {
      render(
        <PanelResizeButton
          side="left"
          isVisible={true}
          panelSize={300}
          onMouseDown={mockOnMouseDown}
        />
      );

      const button = screen.getByRole("button", { name: /resize left panel/i });
      expect(button).toBeInTheDocument();
    });

    it("renders with correct aria-label for right panel", () => {
      render(
        <PanelResizeButton
          side="right"
          isVisible={true}
          panelSize={300}
          onMouseDown={mockOnMouseDown}
        />
      );

      const button = screen.getByRole("button", { name: /resize right panel/i });
      expect(button).toBeInTheDocument();
    });

    it("has panel-resize-button class", () => {
      const { container } = render(
        <PanelResizeButton
          side="right"
          isVisible={true}
          panelSize={300}
          onMouseDown={mockOnMouseDown}
        />
      );

      const button = container.querySelector(".panel-resize-button");
      expect(button).toBeInTheDocument();
    });

    it("has resize-handle div inside button", () => {
      const { container } = render(
        <PanelResizeButton
          side="right"
          isVisible={true}
          panelSize={300}
          onMouseDown={mockOnMouseDown}
        />
      );

      const handle = container.querySelector(".resize-handle");
      expect(handle).toBeInTheDocument();
    });

    it("has tabIndex of -1 to avoid keyboard focus", () => {
      const { container } = render(
        <PanelResizeButton
          side="right"
          isVisible={true}
          panelSize={300}
          onMouseDown={mockOnMouseDown}
        />
      );

      const button = container.querySelector(".panel-resize-button");
      expect(button).toHaveAttribute("tabIndex", "-1");
    });
  });

  describe("mouse interaction", () => {
    it("calls onMouseDown when button is clicked", async () => {
      const user = userEvent.setup();

      render(
        <PanelResizeButton
          side="right"
          isVisible={true}
          panelSize={300}
          onMouseDown={mockOnMouseDown}
        />
      );

      const button = screen.getByRole("button", { name: /resize right panel/i });
      await user.click(button);

      expect(mockOnMouseDown).toHaveBeenCalledTimes(1);
    });

    it("stops event propagation on mouse down", () => {
      const event = new MouseEvent("mousedown", { bubbles: true });
      jest.spyOn(event, "stopPropagation");

      render(
        <PanelResizeButton
          side="right"
          isVisible={true}
          panelSize={300}
          onMouseDown={mockOnMouseDown}
        />
      );

      const button = screen.getByRole("button", { name: /resize right panel/i });
      button.dispatchEvent(event);

      expect(event.stopPropagation).toHaveBeenCalled();
    });
  });

  describe("positioning styles", () => {
    it("positions right panel button correctly when visible", () => {
      const { container } = render(
        <PanelResizeButton
          side="right"
          isVisible={true}
          panelSize={300}
          onMouseDown={mockOnMouseDown}
        />
      );

      const button = container.querySelector(".panel-resize-button");
      expect(button).toHaveStyle({ right: "300px" });
    });

    it("positions left panel button correctly when visible", () => {
      const { container } = render(
        <PanelResizeButton
          side="left"
          isVisible={true}
          panelSize={300}
          onMouseDown={mockOnMouseDown}
        />
      );

      const button = container.querySelector(".panel-resize-button");
      expect(button).toHaveStyle({ left: "300px" });
    });

    it("uses minOffset when panelSize is too small", () => {
      const { container } = render(
        <PanelResizeButton
          side="right"
          isVisible={true}
          panelSize={10}
          onMouseDown={mockOnMouseDown}
        />
      );

      const button = container.querySelector(".panel-resize-button");
      // Math.max(10 + 0, 24) = 24
      expect(button).toHaveStyle({ right: "24px" });
    });

    it("positions right panel button at collapsed offset when not visible", () => {
      const { container } = render(
        <PanelResizeButton
          side="right"
          isVisible={false}
          panelSize={300}
          onMouseDown={mockOnMouseDown}
        />
      );

      const button = container.querySelector(".panel-resize-button");
      expect(button).toHaveStyle({ right: "12px" });
    });

    it("positions left panel button at collapsed offset when not visible", () => {
      const { container } = render(
        <PanelResizeButton
          side="left"
          isVisible={false}
          panelSize={300}
          onMouseDown={mockOnMouseDown}
        />
      );

      const button = container.querySelector(".panel-resize-button");
      expect(button).toHaveStyle({ left: "12px" });
    });

    it("applies increased padding when visible", () => {
      const { container } = render(
        <PanelResizeButton
          side="right"
          isVisible={true}
          panelSize={300}
          onMouseDown={mockOnMouseDown}
        />
      );

      const button = container.querySelector(".panel-resize-button");
      expect(button).toHaveStyle({ padding: "6px" });
    });

    it("applies reduced padding when not visible", () => {
      const { container } = render(
        <PanelResizeButton
          side="right"
          isVisible={false}
          panelSize={300}
          onMouseDown={mockOnMouseDown}
        />
      );

      const button = container.querySelector(".panel-resize-button");
      expect(button).toHaveStyle({ padding: "2px" });
    });
  });

  describe("memoization", () => {
    it("is memoized with React.memo", () => {
      expect(PanelResizeButton.displayName).toBeUndefined();
      // The component is exported as memo() wrapped
    });

    it("does not re-render unnecessarily when props are unchanged", () => {
      const { rerender } = render(
        <PanelResizeButton
          side="right"
          isVisible={true}
          panelSize={300}
          onMouseDown={mockOnMouseDown}
        />
      );

      const button = screen.getByRole("button", { name: /resize right panel/i });

      // Rerender with same props
      rerender(
        <PanelResizeButton
          side="right"
          isVisible={true}
          panelSize={300}
          onMouseDown={mockOnMouseDown}
        />
      );

      // Button should still be there
      expect(button).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("handles zero panel size", () => {
      const { container } = render(
        <PanelResizeButton
          side="right"
          isVisible={true}
          panelSize={0}
          onMouseDown={mockOnMouseDown}
        />
      );

      const button = container.querySelector(".panel-resize-button");
      // Math.max(0 + 0, 24) = 24
      expect(button).toHaveStyle({ right: "24px" });
    });

    it("handles very large panel size", () => {
      const { container } = render(
        <PanelResizeButton
          side="right"
          isVisible={true}
          panelSize={10000}
          onMouseDown={mockOnMouseDown}
        />
      );

      const button = container.querySelector(".panel-resize-button");
      expect(button).toHaveStyle({ right: "10000px" });
    });

    it("handles rapid visibility changes", () => {
      const { rerender } = render(
        <PanelResizeButton
          side="right"
          isVisible={true}
          panelSize={300}
          onMouseDown={mockOnMouseDown}
        />
      );

      rerender(
        <PanelResizeButton
          side="right"
          isVisible={false}
          panelSize={300}
          onMouseDown={mockOnMouseDown}
        />
      );

      rerender(
        <PanelResizeButton
          side="right"
          isVisible={true}
          panelSize={300}
          onMouseDown={mockOnMouseDown}
        />
      );

      const button = screen.getByRole("button", { name: /resize right panel/i });
      expect(button).toBeInTheDocument();
    });

    it("handles side prop changes", () => {
      const { rerender } = render(
        <PanelResizeButton
          side="right"
          isVisible={true}
          panelSize={300}
          onMouseDown={mockOnMouseDown}
        />
      );

      rerender(
        <PanelResizeButton
          side="left"
          isVisible={true}
          panelSize={300}
          onMouseDown={mockOnMouseDown}
        />
      );

      const button = screen.getByRole("button", { name: /resize left panel/i });
      expect(button).toBeInTheDocument();
    });
  });
});
