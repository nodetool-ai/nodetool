import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import WorkspaceEmptyView from "../WorkspaceEmptyView";
import mockTheme from "../../../__mocks__/themeMock";
import type { MessageContent } from "../../../stores/ApiTypes";

const openTab = jest.fn();
const createNewThread = jest.fn().mockResolvedValue("thread-1");
const sendMessage = jest.fn().mockResolvedValue(undefined);
const connect = jest.fn().mockResolvedValue(undefined);
const stopGeneration = jest.fn();
const setSelectedModel = jest.fn();

const chatState = {
  status: "connected",
  selectedModel: { type: "language_model", provider: "openai", id: "gpt-5" },
  setSelectedModel,
  stopGeneration,
  createNewThread,
  sendMessage,
  connect
};

jest.mock("../../../stores/GlobalChatStore", () => {
  const useStore = (selector: (state: unknown) => unknown) =>
    selector(chatState);
  useStore.getState = () => chatState;
  return { __esModule: true, default: useStore };
});

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  __esModule: true,
  useWorkspaceTabsStore: (selector: (state: unknown) => unknown) =>
    selector({ openTab })
}));

jest.mock("../../chat/containers/ChatInputSection", () => ({
  __esModule: true,
  default: ({
    onSendMessage
  }: {
    onSendMessage: (content: MessageContent[], prompt: string) => void;
  }) => (
    <button
      type="button"
      onClick={() => onSendMessage([{ type: "text", text: "hello" }], "hello")}
    >
      send
    </button>
  )
}));

const renderEmptyView = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <WorkspaceEmptyView />
    </ThemeProvider>
  );

describe("WorkspaceEmptyView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the composer with the empty-workspace hint", () => {
    renderEmptyView();
    expect(screen.getByText(/No tabs open/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "send" })).toBeInTheDocument();
  });

  it("opens a chat tab for the new thread and sends the message to it", async () => {
    const user = userEvent.setup();
    renderEmptyView();

    await user.click(screen.getByRole("button", { name: "send" }));

    await waitFor(() => expect(createNewThread).toHaveBeenCalled());
    expect(openTab).toHaveBeenCalledWith({
      type: "chat",
      ref: "thread-1",
      mode: "view",
      title: "New chat"
    });
    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: "user",
          thread_id: "thread-1",
          content: [{ type: "text", text: "hello" }]
        }),
        "thread-1"
      )
    );
  });
});
