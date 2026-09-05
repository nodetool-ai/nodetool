import "@testing-library/jest-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import mockTheme from "../../../../__mocks__/themeMock";
import ChatPanelHeader from "../ChatPanelHeader";
import useGlobalChatStore from "../../../../stores/GlobalChatStore";
import { useNotificationStore } from "../../../../stores/NotificationStore";

const thread = (id: string, title: string, updatedAt: string) => ({
  id,
  user_id: "user-1",
  title,
  created_at: updatedAt,
  updated_at: updatedAt
});

const DAY_MS = 24 * 60 * 60 * 1000;

const renderHeader = (props: Partial<React.ComponentProps<typeof ChatPanelHeader>> = {}) => {
  const onNewChat = jest.fn();
  const onSelectThread = jest.fn();
  render(
    <MemoryRouter initialEntries={["/workspace"]}>
      <ThemeProvider theme={mockTheme}>
        <ChatPanelHeader
          onNewChat={onNewChat}
          onSelectThread={onSelectThread}
          threadId="thread-1"
          {...props}
        />
      </ThemeProvider>
    </MemoryRouter>
  );
  return { onNewChat, onSelectThread };
};

describe("ChatPanelHeader", () => {
  beforeEach(() => {
    const now = Date.now();
    useGlobalChatStore.setState({
      threads: {
        "thread-1": thread(
          "thread-1",
          "Fixing the encoder",
          new Date(now).toISOString()
        ),
        "thread-2": thread(
          "thread-2",
          "Storyboard ideas",
          new Date(now - DAY_MS).toISOString()
        )
      },
      messageCache: {},
      currentThreadId: "thread-1",
      deleteThread: jest.fn().mockResolvedValue(undefined)
    });
    useNotificationStore.setState({ notifications: [] });
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("names every action in the strip", () => {
    renderHeader();

    expect(screen.getByRole("button", { name: "New chat" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Conversations" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open in a workspace tab" })
    ).toBeInTheDocument();
  });

  it("starts a new chat", async () => {
    const user = userEvent.setup();
    const { onNewChat } = renderHeader();

    await user.click(screen.getByRole("button", { name: "New chat" }));

    expect(onNewChat).toHaveBeenCalled();
  });

  it("lists the store's conversations and selects one", async () => {
    const user = userEvent.setup();
    const { onSelectThread } = renderHeader();

    await user.click(screen.getByRole("button", { name: "Conversations" }));

    expect(screen.getByText("Storyboard ideas")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Fixing the encoder/ })
    );

    expect(onSelectThread).toHaveBeenCalledWith("thread-1");
  });

  it("reports a failed deletion", async () => {
    useGlobalChatStore.setState({
      deleteThread: jest.fn().mockRejectedValue(new Error("network down"))
    });
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole("button", { name: "Conversations" }));
    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" })
    );

    await waitFor(() => {
      expect(useNotificationStore.getState().notifications).toEqual([
        expect.objectContaining({
          type: "error",
          content: "Could not delete the conversation. Please try again."
        })
      ]);
    });
  });
});
