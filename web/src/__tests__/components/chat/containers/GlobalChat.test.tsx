import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import GlobalChat from "../../../../components/chat/containers/GlobalChat";
import mockTheme from "../../../../__mocks__/themeMock";

// Mock react-router-dom hooks
const mockNavigate = jest.fn();
const mockParams = { thread_id: undefined };

jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
  useParams: () => mockParams
}));

// Mock MUI components and hooks
jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useTheme: () => mockTheme
}));

jest.mock("@mui/material", () => ({
  ...jest.requireActual("@mui/material"),
  useMediaQuery: jest.fn().mockReturnValue(false),
  Alert: ({ children, ...props }: any) => (
    <div data-testid="alert" {...props}>
      {children}
    </div>
  ),
  Box: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  Typography: ({ children, ...props }: any) => <p {...props}>{children}</p>
}));

// Mock hooks
jest.mock("../../../../hooks/useEnsureChatConnected", () => ({
  useEnsureChatConnected: jest.fn()
}));

// Mock stores with basic implementations
jest.mock("../../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    status: "connected",
    sendMessage: jest.fn(),
    progress: { current: 0, total: 0 },
    statusMessage: null,
    error: null,
    currentThreadId: "thread-123",
    threads: {},
    getCurrentMessagesSync: jest.fn(() => []),
    createNewThread: jest.fn(),
    switchThread: jest.fn(),
    fetchThread: jest.fn(),
    stopGeneration: jest.fn(),
    agentMode: false,
    setAgentMode: jest.fn(),
    currentPlanningUpdate: null,
    currentTaskUpdate: null,
    currentTaskUpdateThreadId: null,
    lastTaskUpdatesByThread: {},
    currentLogUpdate: null,
    threadsLoaded: true,
    selectedModel: { id: "gpt-4", name: "GPT-4" },
    setSelectedModel: jest.fn(),
    selectedTools: [],
    setSelectedTools: jest.fn(),
    selectedCollections: [],
    setSelectedCollections: jest.fn(),
    currentRunningToolCallId: null,
    currentToolMessage: null
  })),
  useThreadsQuery: jest.fn(() => ({
    isLoading: false,
    error: null
  }))
}));

jest.mock("../../../../stores/PanelStore", () => ({
  usePanelStore: jest.fn(() => ({
    panel: {
      isVisible: false,
      panelSize: 300,
      minWidth: 50
    }
  }))
}));

jest.mock("../../../../stores/RightPanelStore", () => ({
  useRightPanelStore: jest.fn(() => ({
    panel: {
      isVisible: false,
      panelSize: 300
    }
  }))
}));

// Mock global WebSocket manager
jest.mock("../../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    getConnectionState: jest.fn().mockReturnValue({
      isConnected: true,
      isConnecting: false,
      error: null
    }),
    subscribeEvent: jest.fn().mockReturnValue(() => {}),
    isConnectionOpen: jest.fn().mockReturnValue(true)
  }
}));

// Mock complex components to avoid dependency issues
jest.mock("../../../../components/chat/containers/ChatView", () => ({
  __esModule: true,
  default: ({ status, messages }: any) => (
    <div data-testid="chat-view">
      <div>Status: {status}</div>
      <div>Messages: {messages?.length || 0}</div>
    </div>
  )
}));

jest.mock("../../../../components/chat/thread/NewChatButton", () => ({
  NewChatButton: ({ onNewThread }: { onNewThread: () => void }) => (
    <button onClick={onNewThread} data-testid="new-chat-button-header">
      New Chat Header
    </button>
  )
}));

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={mockTheme}>
      <MemoryRouter>{component}</MemoryRouter>
    </ThemeProvider>
  );
};

describe("GlobalChat", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Basic Rendering", () => {
    it("renders GlobalChat component without crashing", () => {
      expect(() => {
        renderWithProviders(<GlobalChat />);
      }).not.toThrow();
    });

    it("renders with mocked store state", () => {
      renderWithProviders(<GlobalChat />);

      // Component should render with our mocked state
      expect(screen.getByTestId("chat-view")).toBeInTheDocument();
    });

    it("shows header with new chat button", () => {
      renderWithProviders(<GlobalChat />);

      expect(screen.getByTestId("new-chat-button-header")).toBeInTheDocument();
    });
  });

  describe("Loading States", () => {
    it("shows loading state when threads are loading", async () => {
      const GlobalChatStore = await import("../../../../stores/GlobalChatStore");
      const { useThreadsQuery } = GlobalChatStore;
      (useThreadsQuery as jest.Mock).mockReturnValue({
        isLoading: true,
        error: null
      });

      renderWithProviders(<GlobalChat />);

      expect(screen.getByText("Loading chat...")).toBeInTheDocument();
    });

    it("shows error state when threads fail to load", async () => {
      const GlobalChatStore = await import("../../../../stores/GlobalChatStore");
      const { useThreadsQuery } = GlobalChatStore;
      (useThreadsQuery as jest.Mock).mockReturnValue({
        isLoading: false,
        error: new Error("Failed to load threads")
      });

      renderWithProviders(<GlobalChat />);

      expect(screen.getByText(/Failed to load threads/)).toBeInTheDocument();
    });
  });

  describe("Status Handling", () => {
    it("shows error alert when connection status is failed", async () => {
      // Mock the store to return failed status
      const GlobalChatStore = await import("../../../../stores/GlobalChatStore");
      const useGlobalChatStore = GlobalChatStore.default;
      const { useThreadsQuery } = GlobalChatStore;
      (useGlobalChatStore as unknown as jest.Mock).mockReturnValueOnce({
        status: "failed",
        sendMessage: jest.fn(),
        progress: { current: 0, total: 0 },
        statusMessage: null,
        error: "Connection failed",
        currentThreadId: "thread-123",
        threads: {},
        getCurrentMessagesSync: jest.fn(() => []),
        createNewThread: jest.fn(),
        switchThread: jest.fn(),
        fetchThread: jest.fn(),
        stopGeneration: jest.fn(),
        agentMode: false,
        setAgentMode: jest.fn(),
        currentPlanningUpdate: null,
        currentTaskUpdate: null,
        currentTaskUpdateThreadId: null,
        lastTaskUpdatesByThread: {},
        currentLogUpdate: null,
        threadsLoaded: true,
        selectedModel: { id: "gpt-4", name: "GPT-4" },
        setSelectedModel: jest.fn(),
        selectedTools: [],
        setSelectedTools: jest.fn(),
        selectedCollections: [],
        setSelectedCollections: jest.fn(),
        currentRunningToolCallId: null,
        currentToolMessage: null
      });
      (useThreadsQuery as jest.Mock).mockReturnValueOnce({ isLoading: false, error: null });

      renderWithProviders(<GlobalChat />);

      expect(screen.getByText("Connection failed")).toBeInTheDocument();
    });

    it("shows reconnecting alert when status is reconnecting", async () => {
      // Mock the store to return reconnecting status
      const GlobalChatStore = await import("../../../../stores/GlobalChatStore");
      const useGlobalChatStore = GlobalChatStore.default;
      const { useThreadsQuery } = GlobalChatStore;
      (useGlobalChatStore as unknown as jest.Mock).mockReturnValueOnce({
        status: "reconnecting",
        sendMessage: jest.fn(),
        progress: { current: 0, total: 0 },
        statusMessage: "Reconnecting...",
        error: null,
        currentThreadId: "thread-123",
        threads: {},
        getCurrentMessagesSync: jest.fn(() => []),
        createNewThread: jest.fn(),
        switchThread: jest.fn(),
        fetchThread: jest.fn(),
        stopGeneration: jest.fn(),
        agentMode: false,
        setAgentMode: jest.fn(),
        currentPlanningUpdate: null,
        currentTaskUpdate: null,
        currentTaskUpdateThreadId: null,
        lastTaskUpdatesByThread: {},
        currentLogUpdate: null,
        threadsLoaded: true,
        selectedModel: { id: "gpt-4", name: "GPT-4" },
        setSelectedModel: jest.fn(),
        selectedTools: [],
        setSelectedTools: jest.fn(),
        selectedCollections: [],
        setSelectedCollections: jest.fn(),
        currentRunningToolCallId: null,
        currentToolMessage: null
       });
       (useThreadsQuery as jest.Mock).mockReturnValueOnce({ isLoading: false, error: null });

        // Mock the connection state to be connecting
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { globalWebSocketManager } = require("../../../../lib/websocket/GlobalWebSocketManager");
        globalWebSocketManager.getConnectionState.mockReturnValue({
        isConnected: false,
        isConnecting: true,
        error: null
       });

      renderWithProviders(<GlobalChat />);

      expect(screen.getByText("Reconnecting...")).toBeInTheDocument();
    });
  });
});
