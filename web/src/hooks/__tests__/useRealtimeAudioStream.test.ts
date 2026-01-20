import { renderHook, act } from "@testing-library/react";
import { useRealtimeAudioStream } from "../useRealtimeAudioStream";

jest.mock("../useInputStream", () => ({
  useInputStream: jest.fn(() => ({
    send: jest.fn(),
    end: jest.fn(),
  })),
}));

jest.mock("../../stores/WorkflowRunner", () => ({
  useWebsocketRunner: jest.fn(() => ({
    state: "idle",
  })),
}));

const mockUseInputStream = jest.requireMock("../useInputStream").useInputStream;
const mockUseWebsocketRunner = jest.requireMock("../../stores/WorkflowRunner").useWebsocketRunner;

describe("useRealtimeAudioStream", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("initializes with isStreaming as false", () => {
    const { result } = renderHook(() => useRealtimeAudioStream());

    expect(result.current.isStreaming).toBe(false);
    expect(result.current.stream).toBeNull();
    expect(result.current.version).toBe(0);
  });

  it("accepts optional inputNodeName parameter", () => {
    const { result } = renderHook(() => useRealtimeAudioStream("audio-input"));

    expect(result.current.isStreaming).toBe(false);
  });

  it("stop function sends end-of-stream signal", () => {
    const mockSend = jest.fn();
    const mockEnd = jest.fn();
    mockUseInputStream.mockReturnValueOnce({ send: mockSend, end: mockEnd });

    const { result } = renderHook(() => useRealtimeAudioStream("audio-input"));

    act(() => {
      result.current.stop();
    });

    expect(mockSend).toHaveBeenCalledWith(
      { type: "chunk", content: "", done: true, content_type: "audio" },
      "chunk"
    );
    expect(mockEnd).toHaveBeenCalledWith("chunk");
  });

  it("increments version on stop", () => {
    const { result } = renderHook(() => useRealtimeAudioStream());

    act(() => {
      result.current.stop();
    });

    expect(result.current.version).toBe(1);
  });

  it("handles multiple stop calls", () => {
    const { result } = renderHook(() => useRealtimeAudioStream());

    act(() => {
      result.current.stop();
    });

    expect(result.current.version).toBe(1);

    act(() => {
      result.current.stop();
    });

    expect(result.current.version).toBe(2);
  });

  it("uses input node name from parameter", () => {
    const mockSend = jest.fn();
    const mockEnd = jest.fn();
    mockUseInputStream.mockReturnValueOnce({ send: mockSend, end: mockEnd });

    renderHook(() => useRealtimeAudioStream("my-audio-node"));

    expect(mockUseInputStream).toHaveBeenCalledWith("my-audio-node");
  });

  it("uses empty string when inputNodeName is undefined", () => {
    mockUseInputStream.mockReturnValueOnce({ send: jest.fn(), end: jest.fn() });

    renderHook(() => useRealtimeAudioStream());

    expect(mockUseInputStream).toHaveBeenCalledWith("");
  });

  it("returns stream as null initially", () => {
    const { result } = renderHook(() => useRealtimeAudioStream());

    expect(result.current.stream).toBeNull();
  });

  it("returns control functions", () => {
    const { result } = renderHook(() => useRealtimeAudioStream());

    expect(typeof result.current.start).toBe("function");
    expect(typeof result.current.stop).toBe("function");
    expect(typeof result.current.toggle).toBe("function");
  });

  it("tracks version state", () => {
    const { result } = renderHook(() => useRealtimeAudioStream());

    expect(result.current.version).toBe(0);

    act(() => {
      result.current.stop();
    });

    expect(result.current.version).toBe(1);
  });

  it("handles stop gracefully when not streaming", () => {
    const { result } = renderHook(() => useRealtimeAudioStream());

    expect(result.current.isStreaming).toBe(false);

    act(() => {
      result.current.stop();
    });

    expect(result.current.isStreaming).toBe(false);
    expect(result.current.version).toBe(1);
  });
});
