import { renderHook, act } from "@testing-library/react";
import { useInputStream } from "../useInputStream";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";

jest.mock("../../stores/WorkflowRunner", () => ({
  useWebsocketRunner: jest.fn()
}));

const mockUseWebsocketRunner = useWebsocketRunner as jest.Mock;

describe("useInputStream", () => {
  const mockStreamInput = jest.fn();
  const mockEndInputStream = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("basic functionality", () => {
    it("provides send and end functions", () => {
      mockUseWebsocketRunner.mockImplementation((selector) => {
        const state = {
          streamInput: mockStreamInput,
          endInputStream: mockEndInputStream,
          state: "running"
        };
        return selector(state);
      });

      const { result } = renderHook(() => useInputStream("test-input"));

      expect(result.current.send).toBeDefined();
      expect(result.current.end).toBeDefined();
      expect(typeof result.current.send).toBe("function");
      expect(typeof result.current.end).toBe("function");
    });

    it("calls streamInput with correct arguments when state is running", () => {
      mockUseWebsocketRunner.mockImplementation((selector) => {
        const state = {
          streamInput: mockStreamInput,
          endInputStream: mockEndInputStream,
          state: "running"
        };
        return selector(state);
      });

      const { result } = renderHook(() => useInputStream("test-input"));

      act(() => {
        result.current.send("test-value");
      });

      expect(mockStreamInput).toHaveBeenCalledWith("test-input", "test-value", undefined);
    });

    it("calls streamInput with handle when provided", () => {
      mockUseWebsocketRunner.mockImplementation((selector) => {
        const state = {
          streamInput: mockStreamInput,
          endInputStream: mockEndInputStream,
          state: "running"
        };
        return selector(state);
      });

      const { result } = renderHook(() => useInputStream("test-input"));

      act(() => {
        result.current.send("test-value", "custom-handle");
      });

      expect(mockStreamInput).toHaveBeenCalledWith("test-input", "test-value", "custom-handle");
    });

    it("calls endInputStream with correct arguments when state is running", () => {
      mockUseWebsocketRunner.mockImplementation((selector) => {
        const state = {
          streamInput: mockStreamInput,
          endInputStream: mockEndInputStream,
          state: "running"
        };
        return selector(state);
      });

      const { result } = renderHook(() => useInputStream("test-input"));

      act(() => {
        result.current.end();
      });

      expect(mockEndInputStream).toHaveBeenCalledWith("test-input", undefined);
    });

    it("calls endInputStream with handle when provided", () => {
      mockUseWebsocketRunner.mockImplementation((selector) => {
        const state = {
          streamInput: mockStreamInput,
          endInputStream: mockEndInputStream,
          state: "running"
        };
        return selector(state);
      });

      const { result } = renderHook(() => useInputStream("test-input"));

      act(() => {
        result.current.end("custom-handle");
      });

      expect(mockEndInputStream).toHaveBeenCalledWith("test-input", "custom-handle");
    });
  });

  describe("state guards", () => {
    it("does not call streamInput when state is not running", () => {
      mockUseWebsocketRunner.mockImplementation((selector) => {
        const state = {
          streamInput: mockStreamInput,
          endInputStream: mockEndInputStream,
          state: "idle"
        };
        return selector(state);
      });

      const { result } = renderHook(() => useInputStream("test-input"));

      act(() => {
        result.current.send("test-value");
      });

      expect(mockStreamInput).not.toHaveBeenCalled();
    });

    it("does not call endInputStream when state is not running", () => {
      mockUseWebsocketRunner.mockImplementation((selector) => {
        const state = {
          streamInput: mockStreamInput,
          endInputStream: mockEndInputStream,
          state: "idle"
        };
        return selector(state);
      });

      const { result } = renderHook(() => useInputStream("test-input"));

      act(() => {
        result.current.end();
      });

      expect(mockEndInputStream).not.toHaveBeenCalled();
    });

    it("does not call streamInput when inputName is empty", () => {
      mockUseWebsocketRunner.mockImplementation((selector) => {
        const state = {
          streamInput: mockStreamInput,
          endInputStream: mockEndInputStream,
          state: "running"
        };
        return selector(state);
      });

      const { result } = renderHook(() => useInputStream(""));

      act(() => {
        result.current.send("test-value");
      });

      expect(mockStreamInput).not.toHaveBeenCalled();
    });

    it("does not call endInputStream when inputName is empty", () => {
      mockUseWebsocketRunner.mockImplementation((selector) => {
        const state = {
          streamInput: mockStreamInput,
          endInputStream: mockEndInputStream,
          state: "running"
        };
        return selector(state);
      });

      const { result } = renderHook(() => useInputStream(""));

      act(() => {
        result.current.end();
      });

      expect(mockEndInputStream).not.toHaveBeenCalled();
    });
  });

  describe("memoization", () => {
    it("memoizes send callback based on dependencies", () => {
      mockUseWebsocketRunner.mockImplementation((selector) => {
        const state = {
          streamInput: mockStreamInput,
          endInputStream: mockEndInputStream,
          state: "running"
        };
        return selector(state);
      });

      const { result, rerender } = renderHook(
        ({ name }) => useInputStream(name),
        { initialProps: { name: "test-input" } }
      );

      const firstSend = result.current.send;

      // Rerender with same props
      rerender({ name: "test-input" });
      expect(result.current.send).toBe(firstSend);

      // Rerender with different name
      rerender({ name: "different-input" });
      expect(result.current.send).not.toBe(firstSend);
    });

    it("memoizes end callback based on dependencies", () => {
      mockUseWebsocketRunner.mockImplementation((selector) => {
        const state = {
          streamInput: mockStreamInput,
          endInputStream: mockEndInputStream,
          state: "running"
        };
        return selector(state);
      });

      const { result, rerender } = renderHook(
        ({ name }) => useInputStream(name),
        { initialProps: { name: "test-input" } }
      );

      const firstEnd = result.current.end;

      // Rerender with same props
      rerender({ name: "test-input" });
      expect(result.current.end).toBe(firstEnd);

      // Rerender with different name
      rerender({ name: "different-input" });
      expect(result.current.end).not.toBe(firstEnd);
    });
  });
});
