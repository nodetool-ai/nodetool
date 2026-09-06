import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";

import ChatListPanel, { CreateChatButton } from "../ChatListPanel";
import mockTheme from "../../../__mocks__/themeMock";

const openTab = jest.fn();
const createNewThread = jest.fn().mockResolvedValue("thread-new");
const deleteThread = jest.fn().mockResolvedValue(undefined);
const setVisibility = jest.fn();

const chatState = {
  threads: {
    "thread-1": {
      id: "thread-1",
      title: "Fixing the encoder",
      updated_at: "2026-07-02T10:00:00Z"
    },
    "thread-2": {
      id: "thread-2",
      title: "Storyboard ideas",
      updated_at: "2026-07-01T10:00:00Z"
    }
  },
  messageCache: {},
  isLoadingThreads: false,
  error: null,
  createNewThread,
  deleteThread
};

jest.mock("../../../stores/GlobalChatStore", () => {
  const useStore = <T,>(selector: (state: typeof chatState) => T) =>
    selector(chatState);
  useStore.getState = () => chatState;
  return {
    __esModule: true,
    default: useStore
  };
});

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  __esModule: true,
  useWorkspaceTabsStore: <T,>(
    selector: (state: { openTab: jest.Mock; activeTabId: string }) => T
  ) => selector({ openTab, activeTabId: "chat:thread-2" })
}));

jest.mock("../../../stores/PanelStore", () => ({
  __esModule: true,
  usePanelStore: <T,>(selector: (state: { setVisibility: jest.Mock }) => T) =>
    selector({ setVisibility })
}));

const renderPanel = (ui: React.ReactElement) =>
  render(
    <MemoryRouter initialEntries={["/workspace"]}>
      <ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>
    </MemoryRouter>
  );

describe("ChatListPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("lists the threads", () => {
    renderPanel(<ChatListPanel />);
    expect(screen.getByText("Fixing the encoder")).toBeInTheDocument();
    expect(screen.getByText("Storyboard ideas")).toBeInTheDocument();
  });

  it("opens the selected thread as a chat tab", async () => {
    const user = userEvent.setup();
    renderPanel(<ChatListPanel />);

    await user.click(screen.getByText("Fixing the encoder"));

    expect(openTab).toHaveBeenCalledWith({
      type: "chat",
      ref: "thread-1",
      mode: "view",
      title: "Fixing the encoder"
    });
  });

  it("filters threads by the search term", async () => {
    const user = userEvent.setup();
    renderPanel(<ChatListPanel />);

    await user.type(
      screen.getByPlaceholderText("Search conversations..."),
      "storyboard"
    );

    expect(screen.queryByText("Fixing the encoder")).not.toBeInTheDocument();
    expect(screen.getByText("Storyboard ideas")).toBeInTheDocument();
  });

  it("opens a tab for a freshly created thread", async () => {
    const user = userEvent.setup();
    renderPanel(<CreateChatButton />);

    await user.click(screen.getByRole("button", { name: "New chat" }));

    await waitFor(() => expect(createNewThread).toHaveBeenCalled());
    expect(openTab).toHaveBeenCalledWith({
      type: "chat",
      ref: "thread-new",
      mode: "view",
      title: "New chat"
    });
  });
});
