import { renderHook } from "@testing-library/react";
import { useChatIntegration } from "../useChatIntegration";

// Mock GlobalChatStore
jest.mock("../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: jest.fn((selector) => {
    const mockState = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
      progress: 0,
      statusMessage: "Ready",
      getCurrentMessagesSync: jest.fn().mockReturnValue([]),
      selectedModel: null,
      setSelectedModel: jest.fn(),
      selectedTools: [],
      selectedCollections: [],
      stopGeneration: jest.fn(),
      createNewThread: jest.fn().mockResolvedValue("thread-123"),
      currentThreadId: null,
      messageCache: {},
      status: "idle",
      subscribe: jest.fn(() => jest.fn())
    };
    return selector(mockState);
  })
}));

describe("useChatIntegration", () => {
  const createMockParams = () => ({
    isCodeEditor: false,
    monacoRef: { current: null },
    getSelectedTextFnRef: { current: null },
    replaceSelectionFnRef: { current: null },
    setAllTextFnRef: { current: null },
    setCurrentText: jest.fn(),
    currentText: "Current text content"
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("sendMessage", () => {
    it("prepends context to string content", async () => {
      const { useGlobalChatStore } = require("../../stores/GlobalChatStore");
      const mockSendMessage = jest.fn().mockResolvedValue(undefined);
      
      useGlobalChatStore.mockImplementation((selector) => {
        const mockState = {
          sendMessage: mockSendMessage,
          progress: 0,
          statusMessage: "Ready",
          getCurrentMessagesSync: jest.fn().mockReturnValue([]),
          selectedModel: null,
          setSelectedModel: jest.fn(),
          selectedTools: [],
          selectedCollections: [],
          stopGeneration: jest.fn(),
          createNewThread: jest.fn().mockResolvedValue("thread-123"),
          currentThreadId: null,
          messageCache: {},
          status: "idle",
          subscribe: jest.fn(() => jest.fn())
        };
        return selector(mockState);
      });

      const params = createMockParams();
      const { result } = renderHook(() => useChatIntegration(params));
      const sendMessage = result.current.sendMessage;

      const message = {
        type: "message" as const,
        name: "",
        role: "user" as const,
        content: "Test message"
      };

      await sendMessage(message);

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "<context>Current text content</context>\n\nTest message"
        })
      );
    });

    it("prepends context to array content", async () => {
      const { useGlobalChatStore } = require("../../stores/GlobalChatStore");
      const mockSendMessage = jest.fn().mockResolvedValue(undefined);
      
      useGlobalChatStore.mockImplementation((selector) => {
        const mockState = {
          sendMessage: mockSendMessage,
          progress: 0,
          statusMessage: "Ready",
          getCurrentMessagesSync: jest.fn().mockReturnValue([]),
          selectedModel: null,
          setSelectedModel: jest.fn(),
          selectedTools: [],
          selectedCollections: [],
          stopGeneration: jest.fn(),
          createNewThread: jest.fn().mockResolvedValue("thread-123"),
          currentThreadId: null,
          messageCache: {},
          status: "idle",
          subscribe: jest.fn(() => jest.fn())
        };
        return selector(mockState);
      });

      const params = createMockParams();
      const { result } = renderHook(() => useChatIntegration(params));
      const sendMessage = result.current.sendMessage;

      const message = {
        type: "message" as const,
        name: "",
        role: "user" as const,
        content: [
          { type: "text" as const, text: "Test message" }
        ]
      };

      await sendMessage(message);

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.arrayContaining([
            expect.objectContaining({
              text: "<context>Current text content</context>\n\nTest message"
            })
          ])
        })
      );
    });
  });

  describe("handleAITransform", () => {
    it("sends message with selected text when available", async () => {
      const { useGlobalChatStore } = require("../../stores/GlobalChatStore");
      const mockSendMessage = jest.fn().mockResolvedValue(undefined);
      const mockGetCurrentMessagesSync = jest.fn().mockReturnValue([]);
      
      useGlobalChatStore.mockImplementation((selector) => {
        const mockState = {
          sendMessage: mockSendMessage,
          progress: 0,
          statusMessage: "Ready",
          getCurrentMessagesSync: mockGetCurrentMessagesSync,
          selectedModel: { id: "model-1", provider: "test" },
          setSelectedModel: jest.fn(),
          selectedTools: [],
          selectedCollections: [],
          stopGeneration: jest.fn(),
          createNewThread: jest.fn().mockResolvedValue("thread-123"),
          currentThreadId: null,
          messageCache: {},
          status: "idle",
          subscribe: jest.fn(() => jest.fn())
        };
        return selector(mockState);
      });

      const params = createMockParams();
      params.getSelectedTextFnRef.current = () => "Selected text";

      const { result } = renderHook(() => useChatIntegration(params));
      const handleAITransform = result.current.handleAITransform;

      await handleAITransform("Improve this");

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.arrayContaining([
            expect.objectContaining({
              text: expect.stringContaining("Improve this")
            })
          ])
        })
      );
    });

    it("sends message with current text when no selection", async () => {
      const { useGlobalChatStore } = require("../../stores/GlobalChatStore");
      const mockSendMessage = jest.fn().mockResolvedValue(undefined);
      const mockGetCurrentMessagesSync = jest.fn().mockReturnValue([]);
      
      useGlobalChatStore.mockImplementation((selector) => {
        const mockState = {
          sendMessage: mockSendMessage,
          progress: 0,
          statusMessage: "Ready",
          getCurrentMessagesSync: mockGetCurrentMessagesSync,
          selectedModel: { id: "model-1", provider: "test" },
          setSelectedModel: jest.fn(),
          selectedTools: [],
          selectedCollections: [],
          stopGeneration: jest.fn(),
          createNewThread: jest.fn().mockResolvedValue("thread-123"),
          currentThreadId: null,
          messageCache: {},
          status: "idle",
          subscribe: jest.fn(() => jest.fn())
        };
        return selector(mockState);
      });

      const params = createMockParams();

      const { result } = renderHook(() => useChatIntegration(params));
      const handleAITransform = result.current.handleAITransform;

      await handleAITransform("Improve this");

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.arrayContaining([
            expect.objectContaining({
              text: expect.stringContaining("Current text content")
            })
          ])
        })
      );
    });

    it("does nothing when text is empty", async () => {
      const { useGlobalChatStore } = require("../../stores/GlobalChatStore");
      const mockSendMessage = jest.fn().mockResolvedValue(undefined);
      
      useGlobalChatStore.mockImplementation((selector) => {
        const mockState = {
          sendMessage: mockSendMessage,
          progress: 0,
          statusMessage: "Ready",
          getCurrentMessagesSync: jest.fn().mockReturnValue([]),
          selectedModel: null,
          setSelectedModel: jest.fn(),
          selectedTools: [],
          selectedCollections: [],
          stopGeneration: jest.fn(),
          createNewThread: jest.fn().mockResolvedValue("thread-123"),
          currentThreadId: null,
          messageCache: {},
          status: "idle",
          subscribe: jest.fn(() => jest.fn())
        };
        return selector(mockState);
      });

      const params = createMockParams();
      params.currentText = "";

      const { result } = renderHook(() => useChatIntegration(params));
      const handleAITransform = result.current.handleAITransform;

      await handleAITransform("Improve this");

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it("uses selectedModel and selectedTools from store", async () => {
      const { useGlobalChatStore } = require("../../stores/GlobalChatStore");
      const mockSendMessage = jest.fn().mockResolvedValue(undefined);
      const mockGetCurrentMessagesSync = jest.fn().mockReturnValue([]);
      
      useGlobalChatStore.mockImplementation((selector) => {
        const mockState = {
          sendMessage: mockSendMessage,
          progress: 0,
          statusMessage: "Ready",
          getCurrentMessagesSync: mockGetCurrentMessagesSync,
          selectedModel: { id: "gpt-4", provider: "openai" },
          setSelectedModel: jest.fn(),
          selectedTools: ["tool-1", "tool-2"],
          selectedCollections: [],
          stopGeneration: jest.fn(),
          createNewThread: jest.fn().mockResolvedValue("thread-123"),
          currentThreadId: null,
          messageCache: {},
          status: "idle",
          subscribe: jest.fn(() => jest.fn())
        };
        return selector(mockState);
      });

      const params = createMockParams();

      const { result } = renderHook(() => useChatIntegration(params));
      const handleAITransform = result.current.handleAITransform;

      await handleAITransform("Analyze this");

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "openai",
          model: "gpt-4",
          tools: ["tool-1", "tool-2"]
        })
      );
    });
  });

  describe("return values", () => {
    it("returns status from store", () => {
      const { useGlobalChatStore } = require("../../stores/GlobalChatStore");
      
      useGlobalChatStore.mockImplementation((selector) => {
        const mockState = {
          sendMessage: jest.fn(),
          progress: 50,
          statusMessage: "Processing",
          getCurrentMessagesSync: jest.fn().mockReturnValue([]),
          selectedModel: null,
          setSelectedModel: jest.fn(),
          selectedTools: [],
          selectedCollections: [],
          stopGeneration: jest.fn(),
          createNewThread: jest.fn().mockResolvedValue("thread-123"),
          currentThreadId: null,
          messageCache: {},
          status: "streaming",
          subscribe: jest.fn(() => jest.fn())
        };
        return selector(mockState);
      });

      const params = createMockParams();
      const { result } = renderHook(() => useChatIntegration(params));

      expect(result.current.progress).toBe(50);
      expect(result.current.statusMessage).toBe("Processing");
    });

    it("returns selectedModel as null when not set", () => {
      const { useGlobalChatStore } = require("../../stores/GlobalChatStore");
      
      useGlobalChatStore.mockImplementation((selector) => {
        const mockState = {
          sendMessage: jest.fn(),
          progress: 0,
          statusMessage: "Ready",
          getCurrentMessagesSync: jest.fn().mockReturnValue([]),
          selectedModel: null,
          setSelectedModel: jest.fn(),
          selectedTools: [],
          selectedCollections: [],
          stopGeneration: jest.fn(),
          createNewThread: jest.fn().mockResolvedValue("thread-123"),
          currentThreadId: null,
          messageCache: {},
          status: "idle",
          subscribe: jest.fn(() => jest.fn())
        };
        return selector(mockState);
      });

      const params = createMockParams();
      const { result } = renderHook(() => useChatIntegration(params));

      expect(result.current.selectedModel).toBeNull();
    });

    it("returns control functions", () => {
      const { useGlobalChatStore } = require("../../stores/GlobalChatStore");
      const mockStopGeneration = jest.fn();
      const mockCreateNewThread = jest.fn().mockResolvedValue("new-thread");
      const mockSetSelectedModel = jest.fn();
      
      useGlobalChatStore.mockImplementation((selector) => {
        const mockState = {
          sendMessage: jest.fn(),
          progress: 0,
          statusMessage: "Ready",
          getCurrentMessagesSync: jest.fn().mockReturnValue([]),
          selectedModel: null,
          setSelectedModel: mockSetSelectedModel,
          selectedTools: [],
          selectedCollections: [],
          stopGeneration: mockStopGeneration,
          createNewThread: mockCreateNewThread,
          currentThreadId: null,
          messageCache: {},
          status: "idle",
          subscribe: jest.fn(() => jest.fn())
        };
        return selector(mockState);
      });

      const params = createMockParams();
      const { result } = renderHook(() => useChatIntegration(params));

      expect(result.current.stopGeneration).toBe(mockStopGeneration);
      expect(result.current.createNewThread).toBe(mockCreateNewThread);
      expect(result.current.setSelectedModel).toBe(mockSetSelectedModel);
    });
  });
});
