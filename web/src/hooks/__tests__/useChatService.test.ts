import { renderHook, act } from "@testing-library/react";
import { useChatService } from "../useChatService";
import { LanguageModel } from "../../stores/ApiTypes";

jest.mock("react-router-dom", () => ({
  useNavigate: jest.fn(() => jest.fn()),
}));

jest.mock("../../stores/GlobalChatStore", () => {
  const createMockState = (overrides = {}) => ({
    status: "connected",
    sendMessage: jest.fn().mockResolvedValue(undefined),
    createNewThread: jest.fn().mockResolvedValue("thread-1"),
    switchThread: jest.fn(),
    threads: {},
    messageCache: {},
    currentThreadId: null,
    deleteThread: jest.fn(),
    progress: 0,
    statusMessage: "Ready",
    stopGeneration: jest.fn(),
    currentPlanningUpdate: null,
    currentTaskUpdate: null,
    lastTaskUpdatesByThread: {},
    currentLogUpdate: null,
    ...overrides,
  });

  return {
    __esModule: true,
    default: jest.fn((selector) => selector(createMockState())),
  };
});

const createMockModel = (id: string): LanguageModel => ({
  id,
  name: `Model ${id}`,
  provider: "test",
  type: "language_model",
});

describe("useChatService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns chat status from store", () => {
    const { result } = renderHook(() => useChatService(createMockModel("model-1")));

    expect(result.current.status).toBe("connected");
  });

  it("returns progress from store", () => {
    const { result } = renderHook(() => useChatService(createMockModel("model-1")));

    expect(result.current.progress).toBe(0);
  });

  it("returns statusMessage from store", () => {
    const { result } = renderHook(() => useChatService(createMockModel("model-1")));

    expect(result.current.statusMessage).toBe("Ready");
  });

  it("returns threads from store", () => {
    const { result } = renderHook(() => useChatService(createMockModel("model-1")));

    expect(result.current.threads).toEqual({});
  });

  it("returns currentThreadId from store", () => {
    const { result } = renderHook(() => useChatService(createMockModel("model-1")));

    expect(result.current.currentThreadId).toBeNull();
  });

  it("returns stopGeneration function", () => {
    const { result } = renderHook(() => useChatService(createMockModel("model-1")));

    expect(typeof result.current.stopGeneration).toBe("function");
  });

  it("returns deleteThread function", () => {
    const { result } = renderHook(() => useChatService(createMockModel("model-1")));

    expect(typeof result.current.deleteThread).toBe("function");
  });

  it("returns planning update state", () => {
    const { result } = renderHook(() => useChatService(createMockModel("model-1")));

    expect(result.current.currentPlanningUpdate).toBeNull();
    expect(result.current.currentTaskUpdate).toBeNull();
  });

  it("returns log update state", () => {
    const { result } = renderHook(() => useChatService(createMockModel("model-1")));

    expect(result.current.currentLogUpdate).toBeNull();
  });

  it("returns all required interface properties", () => {
    const { result } = renderHook(() => useChatService(createMockModel("model-1")));

    expect(result.current).toHaveProperty("status");
    expect(result.current).toHaveProperty("sendMessage");
    expect(result.current).toHaveProperty("onNewThread");
    expect(result.current).toHaveProperty("onSelectThread");
    expect(result.current).toHaveProperty("threads");
    expect(result.current).toHaveProperty("currentThreadId");
    expect(result.current).toHaveProperty("progress");
    expect(result.current).toHaveProperty("statusMessage");
    expect(result.current).toHaveProperty("stopGeneration");
    expect(result.current).toHaveProperty("deleteThread");
  });

  it("handles different model selections", () => {
    const { result: result1 } = renderHook(() => useChatService(createMockModel("model-1")));
    const { result: result2 } = renderHook(() => useChatService(createMockModel("model-2")));

    expect(result1.current.status).toBe(result2.current.status);
  });

  it("provides sendMessage function", () => {
    const { result } = renderHook(() => useChatService(createMockModel("model-1")));

    expect(typeof result.current.sendMessage).toBe("function");
  });

  it("provides onNewThread function", () => {
    const { result } = renderHook(() => useChatService(createMockModel("model-1")));

    expect(typeof result.current.onNewThread).toBe("function");
  });

  it("provides onSelectThread function", () => {
    const { result } = renderHook(() => useChatService(createMockModel("model-1")));

    expect(typeof result.current.onSelectThread).toBe("function");
  });
});
