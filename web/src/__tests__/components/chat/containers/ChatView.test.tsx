import React from "react";
import "@testing-library/jest-dom";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import ChatView from "../../../../components/chat/containers/ChatView";
import { KeyboardProvider } from "../../../../components/KeyboardProvider";
import useGlobalChatStore from "../../../../stores/GlobalChatStore";
import { DEFAULT_THREAD_RUNTIME } from "../../../../core/chat/threadRuntime";
import mockTheme from "../../../../__mocks__/themeMock";
import {
  Message,
  MessageContent,
  LanguageModel,
  PlanningUpdate,
  TaskUpdate
} from "../../../../stores/ApiTypes";
import { TaskUpdateEvent } from "@nodetool-ai/protocol";

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
  Box: ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
  Typography: ({ children, ...props }: React.ComponentProps<"p">) => <p {...props}>{children}</p>,
  CircularProgress: ({ ...props }: React.ComponentProps<"div">) => (
    <div data-testid="circular-progress" {...props} />
  )
}));

jest.mock("@mui/material/useMediaQuery", () => ({
  __esModule: true,
  default: jest.fn()
}));

// Mock ChatThreadView component
jest.mock("../../../../components/chat/thread/ChatThreadView", () => ({
  __esModule: true,
  default: function MockChatThreadView({
    messages,
    status
  }: {
    messages?: Message[];
    status?: string;
  }) {
    return (
      <div data-testid="chat-thread-view">
        <div>Messages: {messages?.length || 0}</div>
        <div>Status: {status}</div>
        {messages?.map((msg, index: number) => (
          <div key={index} data-testid={`message-${index}`}>
            <div data-testid={`message-role-${index}`}>{msg.role}</div>
            <div data-testid={`message-content-${index}`}>
              {Array.isArray(msg.content)
                ? msg.content.map((c, i: number) => (
                    <span key={i}>
                      {c.type === "text" ? c.text : "[non-text content]"}
                    </span>
                  ))
                : String(msg.content ?? "")}
            </div>
          </div>
        ))}
      </div>
    );
  }
}));

jest.mock("../../../../components/node/TaskUpdateDisplay", () => ({
  __esModule: true,
  default: () => <div data-testid="task-update-display" />
}));

// Mock ChatInputSection component
jest.mock("../../../../components/chat/containers/ChatInputSection", () => ({
  __esModule: true,
  default: function MockChatInputSection({
    status,
    onSendMessage
  }: {
    status?: string;
    onSendMessage: (
      content: MessageContent[],
      prompt: string
    ) => Promise<void> | void;
  }) {
    return (
      <div data-testid="chat-input-section">
        <div>Status: {status}</div>
        <button
          data-testid="send-message-btn"
          onClick={() =>
            onSendMessage(
              [{ type: "text", text: "Test message" }],
              "Test message"
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
  return render(
    <ThemeProvider theme={mockTheme}>
      <KeyboardProvider>{component}</KeyboardProvider>
    </ThemeProvider>
  );
};

/**
 * `railsFit` reads `breakpoints.up("md")` (a min-width query) and `isMobile`
 * reads `breakpoints.down("sm")` (a max-width one), so one mocked hook has to
 * answer both.
 */
const setViewport = (viewport: "desktop" | "narrow") => {
  (useMediaQuery as jest.MockedFunction<typeof useMediaQuery>).mockImplementation(
    (query) =>
      String(query).includes("min-width")
        ? viewport === "desktop"
        : viewport === "narrow"
  );
};

const seedThreadError = (threadId: string, error: string) => {
  act(() => {
    useGlobalChatStore.setState({
      currentThreadId: threadId,
      error: null,
      threadRuntime: {
        [threadId]: { ...DEFAULT_THREAD_RUNTIME, error }
      }
    });
  });
};

describe("ChatView", () => {
  const mockedUseMediaQuery = useMediaQuery as jest.MockedFunction<
    typeof useMediaQuery
  >;
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
    model: mockModel
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseMediaQuery.mockReturnValue(false);
    act(() => {
      useGlobalChatStore.setState({
        currentThreadId: null,
        error: null,
        threadRuntime: {},
        todosByThread: {}
      });
    });
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
        renderWithProviders(
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
          system_prompt: undefined,
          // No workspace tabs are open in this test, so there is nothing for
          // the agent to address and buildUiContext returns null.
          ui_context: null,
          graph: undefined,
          workflow_id: undefined,
          workflow_target: undefined,
          media_generation: null
        });
      });
    });

    it("attaches chatSource and send-time uiContext to the outgoing message", async () => {
      renderWithProviders(
        <ChatView
          {...baseProps}
          chatSource="sketch_assistant"
          uiContext={() => ({
            focused: { type: "sketch", id: "sk-1", title: "Fox" },
            selection: { layer_ids: ["layer-2"] }
          })}
        />
      );

      fireEvent.click(screen.getByTestId("send-message-btn"));

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            ui_context: expect.objectContaining({
              source: "sketch_assistant",
              focused: { type: "sketch", id: "sk-1", title: "Fox" },
              selection: { layer_ids: ["layer-2"] }
            })
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

      const planningUpdate: PlanningUpdate = {
        type: "planning_update",
        status: "running",
        phase: "Test plan",
        content: "step 1 of 3"
      };

      const taskUpdate: TaskUpdate = {
        type: "task_update",
        task: { id: "task-1", title: "Test task", status: "completed" },
        event: TaskUpdateEvent.TaskCompleted
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

    it("shows an active task in the desktop right sidebar", () => {
      mockedUseMediaQuery.mockReturnValue(true);
      const taskUpdate: TaskUpdate = {
        type: "task_update",
        task: { id: "task-1", title: "Test task", status: "running" },
        event: TaskUpdateEvent.StepStarted
      };

      renderWithProviders(
        <ChatView
          {...baseProps}
          status="streaming"
          messages={[
            {
              id: "1",
              type: "message",
              role: "user",
              content: [{ type: "text", text: "Test" }]
            }
          ]}
          currentTaskUpdate={taskUpdate}
        />
      );

      expect(screen.getByLabelText("Active agent task")).toBeInTheDocument();
      expect(screen.getByTestId("task-update-display")).toBeInTheDocument();
    });

    it("hides the active task sidebar on narrow screens", () => {
      const taskUpdate: TaskUpdate = {
        type: "task_update",
        task: { id: "task-1", title: "Test task", status: "running" },
        event: TaskUpdateEvent.StepStarted
      };

      renderWithProviders(
        <ChatView
          {...baseProps}
          status="streaming"
          messages={[
            {
              id: "1",
              type: "message",
              role: "user",
              content: [{ type: "text", text: "Test" }]
            }
          ]}
          currentTaskUpdate={taskUpdate}
        />
      );

      expect(
        screen.queryByLabelText("Active agent task")
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("task-update-display")
      ).not.toBeInTheDocument();
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
        />
      );

      expect(screen.getByTestId("chat-thread-view")).toBeInTheDocument();
    });
  });

  describe("Toolbar and Controls", () => {
    it("passes model change handler to ChatInputSection", () => {
      renderWithProviders(
        <ChatView {...baseProps} onModelChange={jest.fn()} />
      );

      expect(screen.getByTestId("chat-input-section")).toBeInTheDocument();
    });
  });

  describe("Error Banner", () => {
    const conversation: Message[] = [
      {
        id: "1",
        type: "message",
        role: "user",
        content: [{ type: "text", text: "First ask" }]
      },
      {
        id: "2",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "Partial reply" }]
      }
    ];

    it("shows the rendered thread's runtime error", () => {
      seedThreadError("thread-1", "Provider refused the request");

      renderWithProviders(
        <ChatView {...baseProps} threadId="thread-1" messages={conversation} />
      );

      expect(
        screen.getByText("Provider refused the request")
      ).toBeInTheDocument();
    });

    it("renders no banner when the thread has no error", () => {
      renderWithProviders(
        <ChatView {...baseProps} threadId="thread-1" messages={conversation} />
      );

      expect(
        document.querySelector(".chat-error-banner")
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Retry" })
      ).not.toBeInTheDocument();
    });

    it("clears the top-level and thread errors on dismiss", async () => {
      seedThreadError("thread-1", "Provider refused the request");
      act(() => {
        useGlobalChatStore.setState({ error: "Provider refused the request" });
      });

      renderWithProviders(
        <ChatView {...baseProps} threadId="thread-1" messages={conversation} />
      );

      await userEvent.click(screen.getByRole("button", { name: /close/i }));

      const state = useGlobalChatStore.getState();
      expect(state.error).toBeNull();
      expect(state.threadRuntime["thread-1"].error).toBeNull();
      await waitFor(() =>
        expect(
          screen.queryByText("Provider refused the request")
        ).not.toBeInTheDocument()
      );
    });

    it("retries with the last user message's content", async () => {
      seedThreadError("thread-1", "Provider refused the request");

      renderWithProviders(
        <ChatView {...baseProps} threadId="thread-1" messages={conversation} />
      );

      await userEvent.click(screen.getByRole("button", { name: "Retry" }));

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: "user",
          content: [{ type: "text", text: "First ask" }]
        })
      );
    });

    it("hides Retry while a reply is in flight", () => {
      seedThreadError("thread-1", "Provider refused the request");

      renderWithProviders(
        <ChatView
          {...baseProps}
          status="streaming"
          threadId="thread-1"
          messages={conversation}
        />
      );

      expect(
        screen.getByText("Provider refused the request")
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Retry" })
      ).not.toBeInTheDocument();
    });
  });

  describe("Keyboard Shortcuts", () => {
    it("starts a new chat on Control+Shift+O", () => {
      const onNewChat = jest.fn();
      renderWithProviders(
        <ChatView {...baseProps} onNewChat={onNewChat} showNewChatButton />
      );

      act(() => {
        fireEvent.keyDown(window, {
          key: "O",
          ctrlKey: true,
          shiftKey: true
        });
      });

      expect(onNewChat).toHaveBeenCalledTimes(1);
    });

    it("ignores the shortcut in a background workspace tab", () => {
      const onNewChat = jest.fn();
      render(
        <ThemeProvider theme={mockTheme}>
          <KeyboardProvider>
            <div inert>
              <ChatView
                {...baseProps}
                onNewChat={onNewChat}
                showNewChatButton
              />
            </div>
          </KeyboardProvider>
        </ThemeProvider>
      );

      act(() => {
        fireEvent.keyDown(window, {
          key: "O",
          ctrlKey: true,
          shiftKey: true
        });
      });

      expect(onNewChat).not.toHaveBeenCalled();
    });
  });

  describe("Mobile Rails", () => {
    const todoThread = "thread-todos";

    const seedTodos = () => {
      act(() => {
        useGlobalChatStore.setState({
          currentThreadId: todoThread,
          todosByThread: {
            [todoThread]: [
              { content: "Render the frames", status: "in_progress" },
              { content: "Cut the edit", status: "pending" }
            ]
          }
        });
      });
    };

    it("offers the rails as tabs and swaps in the todo rail", async () => {
      setViewport("narrow");
      seedTodos();

      renderWithProviders(
        <ChatView
          {...baseProps}
          threadId={todoThread}
          messages={[
            {
              id: "1",
              type: "message",
              role: "user",
              content: [{ type: "text", text: "Go" }]
            }
          ]}
        />
      );

      expect(screen.getByRole("button", { name: "Chat" })).toBeInTheDocument();
      expect(screen.queryByText("Render the frames")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Tasks" }));

      expect(screen.getByText("Render the frames")).toBeInTheDocument();
      expect(screen.getByText("Cut the edit")).toBeInTheDocument();
      expect(screen.queryByTestId("chat-thread-view")).not.toBeInTheDocument();
      // The composer stays put whichever rail is showing.
      expect(screen.getByTestId("chat-input-section")).toBeInTheDocument();
    });

    it("leaves the desktop layout without the tabs", () => {
      setViewport("desktop");
      seedTodos();

      renderWithProviders(
        <ChatView
          {...baseProps}
          threadId={todoThread}
          messages={[
            {
              id: "1",
              type: "message",
              role: "user",
              content: [{ type: "text", text: "Go" }]
            }
          ]}
        />
      );

      expect(
        screen.queryByRole("button", { name: "Tasks" })
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("chat-thread-view")).toBeInTheDocument();
      // The rail is still there, on the right, as it always was.
      expect(screen.getByText("Render the frames")).toBeInTheDocument();
    });
  });
});
