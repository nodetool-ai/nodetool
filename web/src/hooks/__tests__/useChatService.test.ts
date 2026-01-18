import { renderHook } from "@testing-library/react";
import { useChatService } from "../useChatService";

jest.mock("react-router-dom", () => ({
  useNavigate: () => jest.fn(),
}));

const mockState = {
  status: "connected",
  sendMessage: jest.fn(),
  createNewThread: jest.fn(() => Promise.resolve("thread-123")),
  switchThread: jest.fn(),
  threads: { "thread-123": { id: "thread-123", title: "Test Thread" } },
  messageCache: { "thread-123": [] },
  currentThreadId: "thread-123",
  deleteThread: jest.fn(),
  progress: 0,
  statusMessage: "Ready",
  stopGeneration: jest.fn(),
  currentPlanningUpdate: null,
  currentTaskUpdate: null,
  lastTaskUpdatesByThread: {},
  currentLogUpdate: null,
};

jest.mock("../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: (selector: (state: any) => any) => selector(mockState),
}));

jest.mock("../../utils/truncateString", () => ({
  truncateString: (str: string) => str,
}));

describe("useChatService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns chat status from store", () => {
    const { result } = renderHook(() => useChatService({ id: "model-1", type: "openai" }));
    
    expect(result.current.status).toBe("connected");
  });

  it("returns sendMessage function", () => {
    const { result } = renderHook(() => useChatService({ id: "model-1", type: "openai" }));
    
    expect(typeof result.current.sendMessage).toBe("function");
  });

  it("returns thread management functions", () => {
    const { result } = renderHook(() => useChatService({ id: "model-1", type: "openai" }));
    
    expect(typeof result.current.onNewThread).toBe("function");
    expect(typeof result.current.onSelectThread).toBe("function");
    expect(typeof result.current.deleteThread).toBe("function");
  });

  it("returns threads and current thread id", () => {
    const { result } = renderHook(() => useChatService({ id: "model-1", type: "openai" }));
    
    expect(result.current.threads).toBeDefined();
    expect(result.current.currentThreadId).toBe("thread-123");
  });

  it("returns progress and status message", () => {
    const { result } = renderHook(() => useChatService({ id: "model-1", type: "openai" }));
    
    expect(result.current.progress).toBe(0);
    expect(result.current.statusMessage).toBe("Ready");
  });

  it("returns planning and task updates", () => {
    const { result } = renderHook(() => useChatService({ id: "model-1", type: "openai" }));
    
    expect(result.current.currentPlanningUpdate).toBeNull();
    expect(result.current.currentTaskUpdate).toBeNull();
  });

  it("returns stopGeneration function", () => {
    const { result } = renderHook(() => useChatService({ id: "model-1", type: "openai" }));
    
    expect(typeof result.current.stopGeneration).toBe("function");
  });

  it("returns getThreadPreview function", () => {
    const { result } = renderHook(() => useChatService({ id: "model-1", type: "openai" }));
    
    expect(typeof result.current.getThreadPreview).toBe("function");
  });

  it("getThreadPreview returns 'No messages yet' for unknown thread", () => {
    const { result } = renderHook(() => useChatService({ id: "model-1", type: "openai" }));
    
    const preview = result.current.getThreadPreview("unknown-thread");
    expect(preview).toBe("No messages yet");
  });

  it("getThreadPreview returns thread title if available", () => {
    const { result } = renderHook(() => useChatService({ id: "model-1", type: "openai" }));
    
    const preview = result.current.getThreadPreview("thread-123");
    expect(preview).toBe("Test Thread");
  });

  it("returns null selectedModel handling", () => {
    const { result } = renderHook(() => useChatService(null));
    
    expect(result.current.status).toBe("connected");
  });
});
