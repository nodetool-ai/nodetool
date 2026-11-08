import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import type { Message } from "../../../stores/ApiTypes";
import type { WorkspaceTab } from "../../../stores/WorkspaceTabsStore";

jest.mock("../ChatSurface", () => ({
  __esModule: true,
  default: () => <div>Chat surface</div>
}));
jest.mock("../../create/CreateSurface", () => ({
  __esModule: true,
  default: ({ sessionId, mediaThreadKind }: { sessionId: string; mediaThreadKind?: string }) => (
    <div>
      Create surface {sessionId} {mediaThreadKind ?? "session"}
    </div>
  )
}));

import TabContent from "../TabContent";

const tab: WorkspaceTab = { id: "chat:t1", type: "chat", ref: "t1", mode: "view", title: "Thread" };

const prompt = (mode: string | null): Message =>
  ({
    id: `m-${mode}`,
    role: "user",
    content: [{ type: "text", text: "a lighthouse" }],
    ...(mode && { media_generation: { mode } })
  }) as Message;

const renderTab = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TabContent tab={tab} active />
    </ThemeProvider>
  );

describe("TabContent thread routing", () => {
  beforeEach(() => {
    useGlobalChatStore.setState({ threads: {}, messageCache: {} });
  });

  it("opens a chat as a chat", async () => {
    useGlobalChatStore.setState({ messageCache: { t1: [prompt(null)] } });
    renderTab();
    expect(await screen.findByText("Chat surface")).toBeInTheDocument();
  });

  it("opens a media thread from before Create sessions in Create", async () => {
    useGlobalChatStore.setState({ messageCache: { t1: [prompt("video"), prompt("video")] } });
    renderTab();
    expect(await screen.findByText("Create surface t1 video")).toBeInTheDocument();
  });

  it("keeps a chat that asked for one picture among questions a chat", async () => {
    useGlobalChatStore.setState({ messageCache: { t1: [prompt(null), prompt("image")] } });
    renderTab();
    expect(await screen.findByText("Chat surface")).toBeInTheDocument();
  });
});
