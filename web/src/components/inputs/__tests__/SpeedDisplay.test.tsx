/**
 * SpeedDisplay Component Tests
 *
 * Tests the SpeedDisplay component that shows drag slowdown factor percentage.
 * This component uses React Portal to render outside the DOM hierarchy and
 * tracks mouse position internally via a mousemove listener + rAF.
 */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { createPortal } from "react-dom";
import { ThemeProvider } from "@mui/material/styles";
import { SpeedDisplay } from "../SpeedDisplay";
import mockTheme from "../../../__mocks__/themeMock";

// Mock createPortal to control its behavior
jest.mock("react-dom", () => ({
  ...jest.requireActual("react-dom"),
  createPortal: jest.fn()
}));

// Mock requestAnimationFrame to run synchronously in tests
let rafCallback: FrameRequestCallback | null = null;
const originalRAF = globalThis.requestAnimationFrame;
const originalCAF = globalThis.cancelAnimationFrame;

const mockCreatePortal = createPortal as jest.MockedFunction<typeof createPortal>;
let mockLogWarn: jest.SpyInstance;

describe("SpeedDisplay", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLogWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockCreatePortal.mockImplementation((node, _container) => {
      return node as React.ReactPortal;
    });
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      rafCallback = cb;
      return 1;
    };
    globalThis.cancelAnimationFrame = jest.fn();
  });

  afterEach(() => {
    mockLogWarn?.mockRestore();
    globalThis.requestAnimationFrame = originalRAF;
    globalThis.cancelAnimationFrame = originalCAF;
    rafCallback = null;
  });

  describe("Visibility behavior", () => {
    it("should return null when not dragging", () => {
      const { container } = render(
        <SpeedDisplay
          speedFactor={0.5}
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
          isDragging={true}
        />
      );

      expect(screen.getByText("50%")).toBeInTheDocument();
    });

    it("should display 10% for speedFactor of 0.1", () => {
      render(
        <SpeedDisplay
          speedFactor={0.1}
          isDragging={true}
        />
      );

      expect(screen.getByText("10%")).toBeInTheDocument();
    });

    it("should display 1% for speedFactor of 0.01", () => {
      render(
        <SpeedDisplay
          speedFactor={0.01}
          isDragging={true}
        />
      );

      expect(screen.getByText("1%")).toBeInTheDocument();
    });

    it("should display 99% for speedFactor of 0.99", () => {
      render(
        <SpeedDisplay
          speedFactor={0.99}
          isDragging={true}
        />
      );

      expect(screen.getByText("99%")).toBeInTheDocument();
    });

    it("should display 0% for speedFactor of 0.001", () => {
      render(
        <SpeedDisplay
          speedFactor={0.001}
          isDragging={true}
        />
      );

      expect(screen.getByText("0%")).toBeInTheDocument();
    });

    it("should round percentage correctly (0.956 -> 96%)", () => {
      render(
        <SpeedDisplay
          speedFactor={0.956}
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
          isDragging={true}
        />
      );

      expect(mockCreatePortal).toHaveBeenCalledTimes(1);
    });
  });

  describe("Fallback behavior", () => {
    it("should fall back to regular rendering when createPortal throws", () => {
      mockCreatePortal.mockImplementation(() => {
        throw new Error("Portal creation failed");
      });

      const { container } = render(
        <SpeedDisplay
          speedFactor={0.5}
          isDragging={true}
        />
      );

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
          isDragging={true}
        />
      );

      expect(mockLogWarn).toHaveBeenCalledTimes(1);
    });
  });

  describe("Mouse tracking", () => {
    it("should update position on mousemove via rAF", () => {
      const { container } = render(
        <SpeedDisplay
          speedFactor={0.5}
          isDragging={true}
        />
      );

      const display = container.querySelector("div");

      act(() => {
        fireEvent.mouseMove(document, { clientX: 200, clientY: 300 });
        if (rafCallback) rafCallback(0);
      });

      expect(display?.style.left).toBe("175px");
      expect(display?.style.top).toBe("330px");
    });
  });

  describe("Styling", () => {
    it("should apply fixed positioning", () => {
      const { container } = render(
        <SpeedDisplay
          speedFactor={0.5}
          isDragging={true}
        />
      );

      const display = container.querySelector("div");
      expect(display?.style.position).toBe("fixed");
    });

    it("should have high z-index", () => {
      const { container } = render(
        <ThemeProvider theme={mockTheme}>
          <SpeedDisplay
            speedFactor={0.5}
            isDragging={true}
          />
        </ThemeProvider>
      );

      const display = container.querySelector("div");
      expect(display?.style.zIndex).toBe(String(mockTheme.zIndex.highest));
    });

    it("should disable pointer events", () => {
      const { container } = render(
        <SpeedDisplay
          speedFactor={0.5}
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
          isDragging={true}
        />
      );

      const display = container.querySelector("div");
      expect(display?.style.transition).toBe("opacity 120ms ease");
    });

    it("should have max-width of 200px", () => {
      const { container } = render(
        <SpeedDisplay
          speedFactor={0.5}
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
          isDragging={true}
        />
      );

      const display = container.querySelector("div");
      expect(display?.style.textAlign).toBe("center");
    });
  });

  describe("Default values", () => {
    it("should not render when speedFactor is 1.0 (default parameter value)", () => {
      const { container } = render(
        <SpeedDisplay
          speedFactor={1.0}
          isDragging={true}
        />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe("Edge cases", () => {
    it("should handle very small speedFactor values", () => {
      render(
        <SpeedDisplay
          speedFactor={0.0001}
          isDragging={true}
        />
      );

      expect(screen.getByText("0%")).toBeInTheDocument();
    });
  });

  describe("Rendering consistency", () => {
    it("should render consistently on re-renders with same props", () => {
      const { rerender } = render(
        <SpeedDisplay
          speedFactor={0.5}
          isDragging={true}
        />
      );

      expect(screen.getByText("50%")).toBeInTheDocument();
      const firstCallCount = mockCreatePortal.mock.calls.length;

      rerender(
        <SpeedDisplay
          speedFactor={0.5}
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
          isDragging={true}
        />
      );

      expect(screen.getByText("50%")).toBeInTheDocument();

      rerender(
        <SpeedDisplay
          speedFactor={0.25}
          isDragging={true}
        />
      );

      expect(screen.getByText("25%")).toBeInTheDocument();
    });

    it("should hide when isDragging changes from true to false", () => {
      const { rerender, container } = render(
        <SpeedDisplay
          speedFactor={0.5}
          isDragging={true}
        />
      );

      expect(container.firstChild).not.toBeNull();

      rerender(
        <SpeedDisplay
          speedFactor={0.5}
          isDragging={false}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it("should show when isDragging changes from false to true", () => {
      const { rerender, container } = render(
        <SpeedDisplay
          speedFactor={0.5}
          isDragging={false}
        />
      );

      expect(container.firstChild).toBeNull();

      rerender(
        <SpeedDisplay
          speedFactor={0.5}
          isDragging={true}
        />
      );

      expect(container.firstChild).not.toBeNull();
    });
  });
});
