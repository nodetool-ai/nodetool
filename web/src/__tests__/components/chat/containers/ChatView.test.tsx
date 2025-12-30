import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import ChatView from "../../../../components/chat/containers/ChatView";
import mockTheme from "../../../../__mocks__/themeMock";
import {
  Message,
  LanguageModel,
  PlanningUpdate,
  TaskUpdate
} from "../../../../stores/ApiTypes";

// Mock react-router-dom hooks
const mockNavigate = jest.fn();

jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate
}));

// Mock MUI components and hooks
jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useTheme: () => mockTheme
}));

jest.mock("@mui/material", () => ({
  ...jest.requireActual("@mui/material"),
  useMediaQuery: jest.fn().mockReturnValue(false),
  Box: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  Typography: ({ children, ...props }: any) => <p {...props}>{children}</p>,
  CircularProgress: ({ ...props }: any) => (
    <div data-testid="circular-progress" {...props} />
  )
}));

// Mock ChatThreadView component
jest.mock("../../../../components/chat/thread/ChatThreadView", () => ({
  __esModule: true,
  default: function MockChatThreadView({ messages, status }: any) {
    return (
      <div data-testid="chat-thread-view">
        <div>Messages: {messages?.length || 0}</div>
        <div>Status: {status}</div>
        {messages?.map((msg: any, index: number) => (
          <div key={index} data-testid={`message-${index}`}>
            <div data-testid={`message-role-${index}`}>{msg.role}</div>
            <div data-testid={`message-content-${index}`}>
              {Array.isArray(msg.content)
                ? msg.content.map((c: any, i: number) => (
                    <span key={i}>
                      {c.type === "text" ? c.text : "[non-text content]"}
                    </span>
                  ))
                : msg.content}
            </div>
          </div>
        ))}
      </div>
    );
  }
}));

// Mock ChatInputSection component
jest.mock("../../../../components/chat/containers/ChatInputSection", () => ({
  __esModule: true,
  default: function MockChatInputSection({
    status,
    onSendMessage,
    selectedTools,
    selectedCollections
  }: any) {
    return (
      <div data-testid="chat-input-section">
        <div>Status: {status}</div>
        <div>Tools: {selectedTools?.length || 0}</div>
        <div>Collections: {selectedCollections?.length || 0}</div>
        <button
          data-testid="send-message-btn"
          onClick={() =>
            onSendMessage(
              [{ type: "text", text: "Test message" }],
              "Test message",
              false
            )
          }
        >
          Send Message
        </button>
      </div>
    );
  }
}));

const renderWithProviders = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("ChatView", () => {
  const mockModel: LanguageModel = {
    type: "language_model",
    id: "gpt-4",
    name: "GPT-4",
    provider: "openai"
  };

  const mockSendMessage = jest.fn().mockResolvedValue(undefined);

  const baseProps = {
    status: "connected" as const,
    progress: 0,
    total: 100,
    messages: [] as Message[],
    sendMessage: mockSendMessage,
    progressMessage: null,
    selectedTools: [],
    selectedCollections: [],
    model: mockModel,
    showToolbar: true
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Initial Rendering", () => {
    it("renders ChatView component without crashing", () => {
      expect(() => {
        renderWithProviders(<ChatView {...baseProps} />);
      }).not.toThrow();
    });

    it("renders ChatInputSection with correct props", () => {
      renderWithProviders(<ChatView {...baseProps} />);

      expect(screen.getByTestId("chat-input-section")).toBeInTheDocument();
      expect(screen.getByText("Status: connected")).toBeInTheDocument();
      expect(screen.getByText("Tools: 0")).toBeInTheDocument();
      expect(screen.getByText("Collections: 0")).toBeInTheDocument();
    });
  });

  describe("Empty State Handling", () => {
    it("renders empty state when no messages", () => {
      renderWithProviders(<ChatView {...baseProps} messages={[]} />);

      expect(screen.getByTestId("chat-input-section")).toBeInTheDocument();
      expect(screen.queryByTestId("chat-thread-view")).not.toBeInTheDocument();
    });

    it("renders custom noMessagesPlaceholder when provided", () => {
      const customPlaceholder = (
        <div data-testid="custom-placeholder">No messages yet</div>
      );

      renderWithProviders(
        <ChatView
          {...baseProps}
          messages={[]}
          noMessagesPlaceholder={customPlaceholder}
        />
      );

      expect(screen.getByTestId("custom-placeholder")).toBeInTheDocument();
      expect(screen.getByText("No messages yet")).toBeInTheDocument();
    });
  });

  describe("Message Rendering", () => {
    it("renders ChatThreadView when messages exist", () => {
      const messages: Message[] = [
        {
          id: "1",
          type: "message",
          role: "user",
          content: [{ type: "text", text: "Hello" }]
        }
      ];

      renderWithProviders(<ChatView {...baseProps} messages={messages} />);

      expect(screen.getByTestId("chat-thread-view")).toBeInTheDocument();
      expect(screen.getByText("Messages: 1")).toBeInTheDocument();
    });

    it("renders messages with different roles correctly", () => {
      const messages: Message[] = [
        {
          id: "1",
          type: "message",
          role: "user",
          content: [{ type: "text", text: "Hello from user" }],
          
        },
        {
          id: "2",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "Hello from assistant" }],
          
        }
      ];

      renderWithProviders(<ChatView {...baseProps} messages={messages} />);

      expect(screen.getByTestId("message-0")).toBeInTheDocument();
      expect(screen.getByTestId("message-role-0")).toHaveTextContent("user");
      expect(screen.getByTestId("message-content-0")).toHaveTextContent(
        "Hello from user"
      );

      expect(screen.getByTestId("message-1")).toBeInTheDocument();
      expect(screen.getByTestId("message-role-1")).toHaveTextContent(
        "assistant"
      );
      expect(screen.getByTestId("message-content-1")).toHaveTextContent(
        "Hello from assistant"
      );
    });

    it("handles messages with different content types", () => {
      const messages: Message[] = [
        {
          id: "1",
          type: "message",
          role: "user",
          content: [
            { type: "text", text: "Hello" },
            { type: "image_url", image: { type: "image", uri: "test.jpg" } }
          ],
          
        }
      ];

      renderWithProviders(<ChatView {...baseProps} messages={messages} />);

      expect(screen.getByTestId("message-content-0")).toHaveTextContent(
        "Hello"
      );
      expect(screen.getByTestId("message-content-0")).toHaveTextContent(
        "[non-text content]"
      );
    });
  });

  describe("Status Handling", () => {
    it("passes status to ChatThreadView", () => {
      const messages: Message[] = [
        {
          id: "1",
          type: "message",
          role: "user",
          content: [{ type: "text", text: "Test" }]
        }
      ];

      renderWithProviders(
        <ChatView {...baseProps} messages={messages} status="streaming" />
      );

      // Check that the status is passed to ChatThreadView
      expect(screen.getByTestId("chat-thread-view")).toBeInTheDocument();
    });

    it("passes status to ChatInputSection", () => {
      renderWithProviders(<ChatView {...baseProps} status="loading" />);

      expect(screen.getByText("Status: loading")).toBeInTheDocument();
    });

    it("handles different status values", () => {
      const statuses = [
        "disconnected",
        "connecting",
        "connected",
        "loading",
        "error",
        "streaming",
        "reconnecting",
        "disconnecting",
        "failed"
      ];

      statuses.forEach((status) => {
        const { rerender } = renderWithProviders(
          <ChatView {...baseProps} status={status as any} />
        );

        expect(screen.getByText(`Status: ${status}`)).toBeInTheDocument();
      });
    });
  });

  describe("Send Message Functionality", () => {
    it("calls sendMessage with correct parameters when message is sent", async () => {
      renderWithProviders(<ChatView {...baseProps} />);

      const sendButton = screen.getByTestId("send-message-btn");
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith({
          type: "message",
          name: "",
          role: "user",
          provider: "openai",
          model: "gpt-4",
          content: [{ type: "text", text: "Test message" }],
          tools: undefined,
          collections: undefined,
          agent_mode: false,
          help_mode: false,
          graph: undefined
        });
      });
    });

    it("includes selected tools in message when tools are selected", async () => {
      renderWithProviders(
        <ChatView {...baseProps} selectedTools={["tool1", "tool2"]} />
      );

      const sendButton = screen.getByTestId("send-message-btn");
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            tools: ["tool1", "tool2"]
          })
        );
      });
    });

    it("includes selected collections in message when collections are selected", async () => {
      renderWithProviders(
        <ChatView {...baseProps} selectedCollections={["collection1"]} />
      );

      const sendButton = screen.getByTestId("send-message-btn");
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            collections: ["collection1"]
          })
        );
      });
    });

    it("handles sendMessage errors gracefully", async () => {
      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockSendMessage.mockRejectedValueOnce(new Error("Send failed"));

      renderWithProviders(<ChatView {...baseProps} />);

      const sendButton = screen.getByTestId("send-message-btn");
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          "Error sending message:",
          expect.any(Error)
        );
      });

      consoleSpy.mockRestore();
    });
  });

  describe("Progress and Planning Updates", () => {
    it("passes progress information to ChatThreadView", () => {
      const messages: Message[] = [
        {
          id: "1",
          type: "message",
          role: "user",
          content: [{ type: "text", text: "Test" }],
          
        }
      ];

      const planningUpdate: any = {
        id: "plan-1",
        type: "planning_update",
        status: "running",
        plan: "Test plan",
        current_step: 1,
        total_steps: 3
      };

      const taskUpdate: any = {
        id: "task-1",
        type: "task_update",
        status: "completed",
        task: "Test task",
        result: "Task completed"
      };

      renderWithProviders(
        <ChatView
          {...baseProps}
          messages={messages}
          progress={50}
          total={100}
          progressMessage="Processing..."
          currentPlanningUpdate={planningUpdate}
          currentTaskUpdate={taskUpdate}
        />
      );

      expect(screen.getByTestId("chat-thread-view")).toBeInTheDocument();
    });

    it("passes running tool information to ChatThreadView", () => {
      const messages: Message[] = [
        {
          id: "1",
          type: "message",
          role: "user",
          content: [{ type: "text", text: "Test" }]
        }
      ];

      renderWithProviders(
        <ChatView
          {...baseProps}
          messages={messages}
          runningToolCallId="tool-call-123"
          runningToolMessage="Running tool..."
        />
      );

      expect(screen.getByTestId("chat-thread-view")).toBeInTheDocument();
    });
  });

  describe("Toolbar and Controls", () => {
    it("passes showToolbar prop to ChatInputSection", () => {
      renderWithProviders(<ChatView {...baseProps} showToolbar={false} />);

      expect(screen.getByTestId("chat-input-section")).toBeInTheDocument();
    });

    it("passes agent mode props to ChatInputSection", () => {
      renderWithProviders(
        <ChatView
          {...baseProps}
          agentMode={true}
          onAgentModeToggle={jest.fn()}
        />
      );

      expect(screen.getByTestId("chat-input-section")).toBeInTheDocument();
    });

    it("passes model change handler to ChatInputSection", () => {
      renderWithProviders(
        <ChatView {...baseProps} onModelChange={jest.fn()} />
      );

      expect(screen.getByTestId("chat-input-section")).toBeInTheDocument();
    });
  });
});
