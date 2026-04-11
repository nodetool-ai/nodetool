/**
 * SpeedDisplay Component Tests
 *
 * Tests the SpeedDisplay component that shows drag slowdown factor percentage.
 * This component uses React Portal to render outside the DOM hierarchy and
 * falls back to regular rendering if portal creation fails.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { createPortal } from "react-dom";
import log from "loglevel";
import { SpeedDisplay } from "../SpeedDisplay";

// Mock createPortal to control its behavior
jest.mock("react-dom", () => ({
  ...jest.requireActual("react-dom"),
  createPortal: jest.fn()
}));

// Mock loglevel
jest.mock("loglevel", () => ({
  __esModule: true,
  default: {
    warn: jest.fn()
  }
}));

const mockCreatePortal = createPortal as jest.MockedFunction<typeof createPortal>;
const mockLogWarn = log.warn as jest.MockedFunction<typeof log.warn>;

describe("SpeedDisplay", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: createPortal works normally
    mockCreatePortal.mockImplementation((node, _container) => {
      // Return the node directly for testing
      return node as React.ReactPortal;
    });
  });

  describe("Visibility behavior", () => {
    it("should return null when not dragging", () => {
      const { container } = render(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={false}
        />
      );

      expect(container.firstChild).toBeNull();
      expect(mockCreatePortal).not.toHaveBeenCalled();
    });

    it("should return null when speedFactor is >= 0.999 (no slowdown)", () => {
      const { container } = render(
        <SpeedDisplay
          speedFactor={0.999}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      expect(container.firstChild).toBeNull();
      expect(mockCreatePortal).not.toHaveBeenCalled();
    });

    it("should return null when speedFactor is 1.0 (no slowdown)", () => {
      const { container } = render(
        <SpeedDisplay
          speedFactor={1.0}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      expect(container.firstChild).toBeNull();
      expect(mockCreatePortal).not.toHaveBeenCalled();
    });

    it("should render when dragging and speedFactor < 0.999", () => {
      const { container } = render(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      expect(container.firstChild).not.toBeNull();
      expect(mockCreatePortal).toHaveBeenCalled();
    });

    it("should render when dragging with very low speedFactor", () => {
      const { container } = render(
        <SpeedDisplay
          speedFactor={0.01}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      expect(container.firstChild).not.toBeNull();
      expect(mockCreatePortal).toHaveBeenCalled();
    });

    it("should render when dragging with speedFactor just below threshold", () => {
      const { container } = render(
        <SpeedDisplay
          speedFactor={0.998}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      expect(container.firstChild).not.toBeNull();
      expect(mockCreatePortal).toHaveBeenCalled();
    });
  });

  describe("Percentage display", () => {
    it("should display 50% for speedFactor of 0.5", () => {
      render(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      expect(screen.getByText("50%")).toBeInTheDocument();
    });

    it("should display 10% for speedFactor of 0.1", () => {
      render(
        <SpeedDisplay
          speedFactor={0.1}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      expect(screen.getByText("10%")).toBeInTheDocument();
    });

    it("should display 1% for speedFactor of 0.01", () => {
      render(
        <SpeedDisplay
          speedFactor={0.01}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      expect(screen.getByText("1%")).toBeInTheDocument();
    });

    it("should display 99% for speedFactor of 0.99", () => {
      render(
        <SpeedDisplay
          speedFactor={0.99}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      expect(screen.getByText("99%")).toBeInTheDocument();
    });

    it("should display 0% for speedFactor of 0.001", () => {
      render(
        <SpeedDisplay
          speedFactor={0.001}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      expect(screen.getByText("0%")).toBeInTheDocument();
    });

    it("should round percentage correctly (0.956 -> 96%)", () => {
      render(
        <SpeedDisplay
          speedFactor={0.956}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      expect(screen.getByText("96%")).toBeInTheDocument();
    });
  });

  describe("Portal rendering", () => {
    it("should use createPortal to render into document.body", () => {
      render(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      expect(mockCreatePortal).toHaveBeenCalledWith(
        expect.anything(),
        document.body
      );
    });

    it("should call createPortal only once per render", () => {
      render(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      expect(mockCreatePortal).toHaveBeenCalledTimes(1);
    });
  });

  describe("Fallback behavior", () => {
    it("should fall back to regular rendering when createPortal throws", () => {
      // Mock createPortal to throw an error
      mockCreatePortal.mockImplementation(() => {
        throw new Error("Portal creation failed");
      });

      const { container } = render(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      // Should still render something (fallback)
      expect(container.firstChild).not.toBeNull();
      expect(mockLogWarn).toHaveBeenCalledWith(
        "Failed to create portal for SpeedDisplay:",
        expect.any(Error)
      );
    });

    it("should log warning with error details when portal fails", () => {
      const testError = new Error("Test portal error");
      mockCreatePortal.mockImplementation(() => {
        throw testError;
      });

      render(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      expect(mockLogWarn).toHaveBeenCalledWith(
        "Failed to create portal for SpeedDisplay:",
        testError
      );
    });

    it("should log warning only once per failed render", () => {
      mockCreatePortal.mockImplementation(() => {
        throw new Error("Portal error");
      });

      render(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      expect(mockLogWarn).toHaveBeenCalledTimes(1);
    });
  });

  describe("Positioning", () => {
    it("should apply correct left position based on mousePosition", () => {
      const { container } = render(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 200, y: 100 }}
          isDragging={true}
        />
      );

      const display = container.querySelector("div");
      expect(display?.style.left).toBe("175px"); // x - 25
    });

    it("should apply correct top position based on mousePosition", () => {
      const { container } = render(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 100, y: 200 }}
          isDragging={true}
        />
      );

      const display = container.querySelector("div");
      expect(display?.style.top).toBe("230px"); // y + 30
    });

    it("should handle zero position values", () => {
      const { container } = render(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 0, y: 0 }}
          isDragging={true}
        />
      );

      const display = container.querySelector("div");
      expect(display?.style.left).toBe("-25px"); // 0 - 25
      expect(display?.style.top).toBe("30px"); // 0 + 30
    });

    it("should handle negative position values", () => {
      const { container } = render(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: -50, y: -50 }}
          isDragging={true}
        />
      );

      const display = container.querySelector("div");
      expect(display?.style.left).toBe("-75px"); // -50 - 25
      expect(display?.style.top).toBe("-20px"); // -50 + 30
    });
  });

  describe("Styling", () => {
    it("should apply fixed positioning", () => {
      const { container } = render(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      const display = container.querySelector("div");
      expect(display?.style.position).toBe("fixed");
    });

    it("should have high z-index", () => {
      const { container } = render(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      const display = container.querySelector("div");
      expect(display?.style.zIndex).toBe("999999");
    });

    it("should disable pointer events", () => {
      const { container } = render(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      const display = container.querySelector("div");
      expect(display?.style.pointerEvents).toBe("none");
    });

    it("should set opacity to 0.4", () => {
      const { container } = render(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      const display = container.querySelector("div");
      expect(display?.style.opacity).toBe("0.4");
    });

    it("should have transition for opacity", () => {
      const { container } = render(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      const display = container.querySelector("div");
      expect(display?.style.transition).toBe("opacity 0.1s ease-in-out");
    });

    it("should have max-width of 200px", () => {
      const { container } = render(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      const display = container.querySelector("div");
      expect(display?.style.maxWidth).toBe("200px");
    });

    it("should center text alignment", () => {
      const { container } = render(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      const display = container.querySelector("div");
      expect(display?.style.textAlign).toBe("center");
    });
  });

  describe("Default values", () => {
    it("should not render when speedFactor is 1.0 (default parameter value)", () => {
      // Test that the default parameter value works correctly
      const { container } = render(
        <SpeedDisplay
          speedFactor={1.0}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      // speedFactor of 1.0 means no slowdown, should not render
      expect(container.firstChild).toBeNull();
    });
  });

  describe("Edge cases", () => {
    it("should handle very small speedFactor values", () => {
      render(
        <SpeedDisplay
          speedFactor={0.0001}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      // 0.0001 * 100 = 0.01%, toFixed(0) = "0"
      expect(screen.getByText("0%")).toBeInTheDocument();
    });

    it("should handle large position values", () => {
      const { container } = render(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 10000, y: 10000 }}
          isDragging={true}
        />
      );

      const display = container.querySelector("div");
      expect(display?.style.left).toBe("9975px"); // 10000 - 25
      expect(display?.style.top).toBe("10030px"); // 10000 + 30
    });

    it("should handle decimal position values", () => {
      const { container } = render(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 100.5, y: 200.7 }}
          isDragging={true}
        />
      );

      const display = container.querySelector("div");
      expect(display?.style.left).toBe("75.5px"); // 100.5 - 25
      expect(display?.style.top).toBe("230.7px"); // 200.7 + 30
    });
  });

  describe("Rendering consistency", () => {
    it("should render consistently on re-renders with same props", () => {
      const { rerender } = render(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      // First render
      expect(screen.getByText("50%")).toBeInTheDocument();
      const firstCallCount = mockCreatePortal.mock.calls.length;

      // Re-render with same props
      rerender(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      expect(screen.getByText("50%")).toBeInTheDocument();
      expect(mockCreatePortal.mock.calls.length).toBeGreaterThan(firstCallCount);
    });

    it("should update percentage when speedFactor changes", () => {
      const { rerender } = render(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      expect(screen.getByText("50%")).toBeInTheDocument();

      rerender(
        <SpeedDisplay
          speedFactor={0.25}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      expect(screen.getByText("25%")).toBeInTheDocument();
    });

    it("should hide when isDragging changes from true to false", () => {
      const { rerender, container } = render(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      expect(container.firstChild).not.toBeNull();

      rerender(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={false}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it("should show when isDragging changes from false to true", () => {
      const { rerender, container } = render(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={false}
        />
      );

      expect(container.firstChild).toBeNull();

      rerender(
        <SpeedDisplay
          speedFactor={0.5}
          mousePosition={{ x: 100, y: 100 }}
          isDragging={true}
        />
      );

      expect(container.firstChild).not.toBeNull();
    });
  });
});
