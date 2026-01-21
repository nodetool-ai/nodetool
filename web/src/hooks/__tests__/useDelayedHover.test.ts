import { renderHook, act, waitFor } from "@testing-library/react";
import { useDelayedHover } from "../useDelayedHover";

describe("useDelayedHover", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("basic functionality", () => {
    it("returns callback functions", () => {
      const { result } = renderHook(() => useDelayedHover(jest.fn(), 100));
      
      expect(typeof result.current.onMouseEnter).toBe("function");
      expect(typeof result.current.onMouseLeave).toBe("function");
      expect(typeof result.current.isHovering).toBe("boolean");
    });

    it("initially is not hovering", () => {
      const { result } = renderHook(() => useDelayedHover(jest.fn(), 100));
      
      expect(result.current.isHovering).toBe(false);
    });

    it("sets isHovering to true after delay on mouse enter", async () => {
      const onHoverStart = jest.fn();
      const { result } = renderHook(() => useDelayedHover(onHoverStart, 100));
      
      act(() => {
        result.current.onMouseEnter();
      });

      expect(result.current.isHovering).toBe(true);
      expect(onHoverStart).not.toHaveBeenCalled();

      await waitFor(() => {
        expect(onHoverStart).toHaveBeenCalled();
      }, { timeout: 200 });
    });

    it("clears timeout on mouse leave", async () => {
      const onHoverStart = jest.fn();
      const { result } = renderHook(() => useDelayedHover(onHoverStart, 100));
      
      act(() => {
        result.current.onMouseEnter();
      });

      act(() => {
        result.current.onMouseLeave();
      });

      expect(result.current.isHovering).toBe(false);

      await waitFor(() => {
        expect(onHoverStart).not.toHaveBeenCalled();
      }, { timeout: 200 });
    });
  });

  describe("delay configuration", () => {
    it("uses custom delay", async () => {
      const onHoverStart = jest.fn();
      const { result } = renderHook(() => useDelayedHover(onHoverStart, 500));
      
      act(() => {
        result.current.onMouseEnter();
      });

      await waitFor(() => {
        expect(onHoverStart).toHaveBeenCalled();
      }, { timeout: 600 });

      expect(onHoverStart).toHaveBeenCalledTimes(1);
    });

    it("handles zero delay", () => {
      const onHoverStart = jest.fn();
      const { result } = renderHook(() => useDelayedHover(onHoverStart, 0));
      
      act(() => {
        result.current.onMouseEnter();
      });

      expect(onHoverStart).toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("handles multiple mouse enter events", () => {
      const onHoverStart = jest.fn();
      const { result } = renderHook(() => useDelayedHover(onHoverStart, 100));
      
      act(() => {
        result.current.onMouseEnter();
      });
      act(() => {
        result.current.onMouseEnter();
      });

      expect(result.current.isHovering).toBe(true);
    });

    it("handles mouse leave without mouse enter", () => {
      const onHoverStart = jest.fn();
      const { result } = renderHook(() => useDelayedHover(onHoverStart, 100));
      
      act(() => {
        result.current.onMouseLeave();
      });

      expect(result.current.isHovering).toBe(false);
    });

    it("handles rapid enter and leave", () => {
      const onHoverStart = jest.fn();
      const { result } = renderHook(() => useDelayedHover(onHoverStart, 100));
      
      act(() => {
        result.current.onMouseEnter();
      });
      act(() => {
        result.current.onMouseLeave();
      });
      act(() => {
        result.current.onMouseEnter();
      });

      expect(result.current.isHovering).toBe(true);
    });
  });
});
