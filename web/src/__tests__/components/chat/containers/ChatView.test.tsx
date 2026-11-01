import React from "react";
import "@testing-library/jest-dom";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  within
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
import type { ChatCommand } from "../../../../components/chat/types/chat.types";

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

// The commands ChatView handed to the composer on its last render.
let latestCommands: ChatCommand[] = [];
const commandNamed = (name: string): ChatCommand => {
  const command = latestCommands.find((item) => item.name === name);
  if (!command) {
    throw new Error(`no /${name} command`);
  }
  return command;
};

// Mock ChatInputSection component
jest.mock("../../../../components/chat/containers/ChatInputSection", () => ({
  __esModule: true,
  default: function MockChatInputSection({
    status,
    onSendMessage,
    threadId,
    commands,
    aboveComposer
  }: {
    status?: string;
    threadId?: string | null;
    commands?: ChatCommand[];
    aboveComposer?: React.ReactNode;
    onSendMessage: (
      content: MessageContent[],
      prompt: string
    ) => Promise<void> | void;
  }) {
    latestCommands = commands ?? [];
    return (
      <div data-testid="chat-input-section">
        {aboveComposer}
        <div>Status: {status}</div>
        <div>Composer thread: {String(threadId)}</div>
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

  describe("Composer Thread", () => {
    it("follows the current thread when the host names none", () => {
      act(() => {
        useGlobalChatStore.setState({ currentThreadId: "chat-tab-thread" });
      });
      renderWithProviders(<ChatView {...baseProps} />);

      expect(
        screen.getByText("Composer thread: chat-tab-thread")
      ).toBeInTheDocument();
    });

    // An agent panel in a background tab has no thread until its first send.
    // Bound to the current thread instead, its composer took the welcome
    // starter a chat tab parked for its own composer.
    it("keeps a host without a thread off the current thread", () => {
      act(() => {
        useGlobalChatStore.setState({ currentThreadId: "chat-tab-thread" });
      });
      renderWithProviders(<ChatView {...baseProps} threadId={null} />);

      expect(screen.getByText("Composer thread: null")).toBeInTheDocument();
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

    it("does not offer to retry the previous message after a new send fails", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      mockSendMessage.mockRejectedValueOnce(new Error("offline"));
      useGlobalChatStore.setState({ currentThreadId: "failed-send-thread", error: "offline" });
      renderWithProviders(<ChatView {...baseProps} messages={[{
        id: "previous", type: "message", role: "user",
        content: [{ type: "text", text: "Previous message" }]
      }]} />);
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
      await userEvent.click(screen.getByTestId("send-message-btn"));
      await waitFor(() => expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument());
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      consoleSpy.mockRestore();
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

    it("docks the running agent task's steps above the composer", async () => {
      const taskUpdate: TaskUpdate = {
        type: "task_update",
        task: {
          id: "task-1",
          title: "Test task",
          status: "running",
          steps: [
            { id: "s1", instructions: "Gather sources", completed: true },
            { id: "s2", instructions: "Write the summary" }
          ]
        },
        step: { id: "s2", instructions: "Write the summary" },
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

      const dock = within(screen.getByTestId("chat-input-section")).getByRole(
        "region",
        { name: "Tasks" }
      );
      const bar = within(dock).getByRole("button");
      expect(bar).toHaveTextContent("Write the summary");
      expect(bar).toHaveTextContent("1/2");

      await userEvent.click(bar);
      expect(within(dock).getByText("Test task")).toBeInTheDocument();
      expect(within(dock).getByText("Gather sources")).toBeInTheDocument();
    });

    it("leaves the finished agent task out of the dock", () => {
      const taskUpdate: TaskUpdate = {
        type: "task_update",
        task: {
          id: "task-1",
          title: "Test task",
          steps: [{ id: "s1", instructions: "Gather sources" }]
        },
        event: TaskUpdateEvent.TaskCompleted
      };

      renderWithProviders(
        <ChatView {...baseProps} status="connected" currentTaskUpdate={taskUpdate} />
      );

      expect(
        screen.queryByRole("region", { name: "Tasks" })
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

    it("retries by rewinding to the last user message and sending it again", async () => {
      seedThreadError("thread-1", "Provider refused the request");
      const rewindThread = jest.fn().mockResolvedValue(undefined);
      act(() => {
        useGlobalChatStore.setState({ rewindThread });
      });

      renderWithProviders(
        <ChatView {...baseProps} threadId="thread-1" messages={conversation} />
      );

      await userEvent.click(screen.getByRole("button", { name: "Retry" }));

      // The failed turn leaves the history before it is sent again, so the
      // thread does not end up holding the same question twice.
      expect(rewindThread).toHaveBeenCalledWith("thread-1", "1");
      await waitFor(() =>
        expect(mockSendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            role: "user",
            content: [{ type: "text", text: "First ask" }]
          })
        )
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

  describe("Slash Commands", () => {
    const compacted: Message[] = [
      {
        id: "1",
        type: "message",
        role: "user",
        content: [
          { type: "text", text: "Draw a fox" },
          { type: "image_url", image: { type: "image", uri: "asset://a" } }
        ]
      },
      {
        id: "2",
        type: "message",
        role: "assistant",
        content: "Here it is"
      },
      {
        id: "3",
        type: "message",
        role: "user",
        execution_event_type: "compaction",
        content: "[Conversation so far]"
      }
    ];

    it("rewinds the last prompt, not a compaction record, and returns its text", async () => {
      const rewindThread = jest.fn().mockResolvedValue(undefined);
      act(() => {
        useGlobalChatStore.setState({ rewindThread });
      });
      renderWithProviders(
        <ChatView {...baseProps} threadId="thread-1" messages={compacted} />
      );

      let restored: string | void = undefined;
      await act(async () => {
        restored = await commandNamed("rewind").run("");
      });

      expect(rewindThread).toHaveBeenCalledWith("thread-1", "1");
      expect(restored).toBe("Draw a fox");
    });

    it("compacts the rendered thread", async () => {
      const compactThread = jest.fn().mockResolvedValue(undefined);
      act(() => {
        useGlobalChatStore.setState({ compactThread });
      });
      renderWithProviders(
        <ChatView {...baseProps} threadId="thread-1" messages={compacted} />
      );

      await act(async () => {
        await commandNamed("compact").run("");
      });

      expect(compactThread).toHaveBeenCalledWith("thread-1");
    });

    it("offers /new only when the host can start a chat", () => {
      const onNewChat = jest.fn();
      const { rerender } = renderWithProviders(
        <ChatView {...baseProps} threadId="thread-1" messages={compacted} />
      );
      expect(latestCommands.map((item) => item.name)).toEqual([
        "compact",
        "rewind"
      ]);

      rerender(
        <ThemeProvider theme={mockTheme}>
          <KeyboardProvider>
            <ChatView
              {...baseProps}
              threadId="thread-1"
              messages={compacted}
              onNewChat={onNewChat}
            />
          </KeyboardProvider>
        </ThemeProvider>
      );
      void commandNamed("new").run("");
      expect(onNewChat).toHaveBeenCalledTimes(1);
    });

    it("offers no thread command before a thread exists", () => {
      renderWithProviders(<ChatView {...baseProps} threadId={null} />);
      expect(latestCommands).toEqual([]);
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

  describe("Task Dock", () => {
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

    it.each([
      ["desktop", true],
      ["narrow", false]
    ])(
      "shows the todos on the composer beside the conversation (%s)",
      async (_viewport, wide) => {
        mockedUseMediaQuery.mockReturnValue(!wide);
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

        const dock = within(
          screen.getByTestId("chat-input-section")
        ).getByRole("region", { name: "Tasks" });
        expect(within(dock).getByRole("button")).toHaveTextContent(
          "Render the frames"
        );
        expect(screen.queryByText("Cut the edit")).not.toBeInTheDocument();
        // The list unfolds in place: the conversation stays on screen.
        await userEvent.click(within(dock).getByRole("button"));
        expect(within(dock).getByText("Cut the edit")).toBeInTheDocument();
        expect(screen.getByTestId("chat-thread-view")).toBeInTheDocument();
      }
    );

    it("renders no dock for a thread without todos", () => {
      renderWithProviders(<ChatView {...baseProps} />);

      expect(
        screen.queryByRole("region", { name: "Tasks" })
      ).not.toBeInTheDocument();
    });
  });
});
