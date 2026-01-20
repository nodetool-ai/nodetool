import { renderHook, act } from "@testing-library/react";
import { useInputStream, useChunkedInputStream } from "../useInputStream";

jest.mock("../../stores/WorkflowRunner", () => ({
  useWebsocketRunner: jest.fn()
}));

import { useWebsocketRunner } from "../../stores/WorkflowRunner";

describe("useInputStream", () => {
  const mockStreamInput = jest.fn();
  const mockEndInputStream = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
      if (typeof selector === "function") {
        return selector({
          streamInput: mockStreamInput,
          endInputStream: mockEndInputStream,
          state: "running"
        });
      }
      return {
        streamInput: mockStreamInput,
        endInputStream: mockEndInputStream,
        state: "running"
      };
    });
  });

  describe("basic streaming", () => {
    it("returns send and end functions", () => {
      const { result } = renderHook(() => useInputStream("test-input"));
      
      expect(result.current.send).toBeDefined();
      expect(typeof result.current.send).toBe("function");
      expect(result.current.end).toBeDefined();
      expect(typeof result.current.end).toBe("function");
    });

    it("does not call streamInput when inputName is empty", () => {
      const { result } = renderHook(() => useInputStream(""));
      
      act(() => {
        result.current.send("test value");
      });
      
      expect(mockStreamInput).not.toHaveBeenCalled();
    });

    it("does not call streamInput when state is not running", () => {
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        if (typeof selector === "function") {
          return selector({
            streamInput: mockStreamInput,
            endInputStream: mockEndInputStream,
            state: "idle"
          });
        }
        return {
          streamInput: mockStreamInput,
          endInputStream: mockEndInputStream,
          state: "idle"
        };
      });

      const { result } = renderHook(() => useInputStream("test-input"));
      
      act(() => {
        result.current.send("test value");
      });
      
      expect(mockStreamInput).not.toHaveBeenCalled();
    });

    it("calls streamInput with correct parameters when running", () => {
      const { result } = renderHook(() => useInputStream("test-input"));
      
      act(() => {
        result.current.send("test-value");
      });
      
      expect(mockStreamInput).toHaveBeenCalledWith("test-input", "test-value", undefined);
    });

    it("calls streamInput with handle when specified", () => {
      const { result } = renderHook(() => useInputStream("test-input"));
      
      act(() => {
        result.current.send("test-value", "custom-handle");
      });
      
      expect(mockStreamInput).toHaveBeenCalledWith("test-input", "test-value", "custom-handle");
    });

    it("does not call endInputStream when inputName is empty", () => {
      const { result } = renderHook(() => useInputStream(""));
      
      act(() => {
        result.current.end();
      });
      
      expect(mockEndInputStream).not.toHaveBeenCalled();
    });

    it("calls endInputStream with correct parameters", () => {
      const { result } = renderHook(() => useInputStream("test-input"));
      
      act(() => {
        result.current.end();
      });
      
      expect(mockEndInputStream).toHaveBeenCalledWith("test-input", undefined);
    });

    it("calls endInputStream with handle when specified", () => {
      const { result } = renderHook(() => useInputStream("test-input"));
      
      act(() => {
        result.current.end("custom-handle");
      });
      
      expect(mockEndInputStream).toHaveBeenCalledWith("test-input", "custom-handle");
    });
  });

  describe("different states", () => {
    it("does not send when state is completed", () => {
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        if (typeof selector === "function") {
          return selector({
            streamInput: mockStreamInput,
            endInputStream: mockEndInputStream,
            state: "completed"
          });
        }
        return {
          streamInput: mockStreamInput,
          endInputStream: mockEndInputStream,
          state: "completed"
        };
      });

      const { result } = renderHook(() => useInputStream("test-input"));
      
      act(() => {
        result.current.send("test value");
      });
      
      expect(mockStreamInput).not.toHaveBeenCalled();
    });

    it("does not send when state is error", () => {
      (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
        if (typeof selector === "function") {
          return selector({
            streamInput: mockStreamInput,
            endInputStream: mockEndInputStream,
            state: "error"
          });
        }
        return {
          streamInput: mockStreamInput,
          endInputStream: mockEndInputStream,
          state: "error"
        };
      });

      const { result } = renderHook(() => useInputStream("test-input"));
      
      act(() => {
        result.current.send("test value");
      });
      
      expect(mockStreamInput).not.toHaveBeenCalled();
    });
  });
});

describe("useChunkedInputStream", () => {
  const mockStreamInput = jest.fn();
  const mockEndInputStream = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useWebsocketRunner as jest.Mock).mockImplementation((selector) => {
      if (typeof selector === "function") {
        return selector({
          streamInput: mockStreamInput,
          endInputStream: mockEndInputStream,
          state: "running"
        });
      }
      return {
        streamInput: mockStreamInput,
        endInputStream: mockEndInputStream,
        state: "running"
      };
    });
  });

  describe("appendText", () => {
    it("sends text chunk with done=false by default", () => {
      const { result } = renderHook(() => useChunkedInputStream("test-input"));
      
      act(() => {
        result.current.appendText("Hello");
      });
      
      expect(mockStreamInput).toHaveBeenCalledWith(
        "test-input",
        { type: "chunk", content: "Hello", done: false },
        "chunk"
      );
    });

    it("sends text chunk with done=true when specified", () => {
      const { result } = renderHook(() => useChunkedInputStream("test-input"));
      
      act(() => {
        result.current.appendText("Hello world", true);
      });
      
      expect(mockStreamInput).toHaveBeenCalledWith(
        "test-input",
        { type: "chunk", content: "Hello world", done: true },
        "chunk"
      );
    });

    it("uses custom handle when specified", () => {
      const { result } = renderHook(() => useChunkedInputStream("test-input", "custom-handle"));
      
      act(() => {
        result.current.appendText("Hello");
      });
      
      expect(mockStreamInput).toHaveBeenCalledWith(
        "test-input",
        { type: "chunk", content: "Hello", done: false },
        "custom-handle"
      );
    });
  });

  describe("appendAudioBase64", () => {
    it("sends audio chunk with content_type audio", () => {
      const { result } = renderHook(() => useChunkedInputStream("test-input"));
      
      act(() => {
        result.current.appendAudioBase64("base64data");
      });
      
      expect(mockStreamInput).toHaveBeenCalledWith(
        "test-input",
        { type: "chunk", content: "base64data", done: false, content_type: "audio" },
        "chunk"
      );
    });

    it("sends audio chunk with done=true when specified", () => {
      const { result } = renderHook(() => useChunkedInputStream("test-input"));
      
      act(() => {
        result.current.appendAudioBase64("base64data", true);
      });
      
      expect(mockStreamInput).toHaveBeenCalledWith(
        "test-input",
        { type: "chunk", content: "base64data", done: true, content_type: "audio" },
        "chunk"
      );
    });
  });

  describe("end", () => {
    it("calls end with default chunk handle", () => {
      const { result } = renderHook(() => useChunkedInputStream("test-input"));
      
      act(() => {
        result.current.end();
      });
      
      expect(mockEndInputStream).toHaveBeenCalledWith("test-input", "chunk");
    });

    it("calls end with custom handle when specified", () => {
      const { result } = renderHook(() => useChunkedInputStream("test-input", "custom-handle"));
      
      act(() => {
        result.current.end();
      });
      
      expect(mockEndInputStream).toHaveBeenCalledWith("test-input", "custom-handle");
    });
  });
});
