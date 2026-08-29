/**
 * The project's agent column: it binds the project's own thread, and sends the
 * opening turn the new-project surface staged — once, after the history it
 * would otherwise be overwritten by has loaded.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const ensureThread = jest.fn(async () => ({ threadId: "t1" }));
jest.mock("../../../trpc/client", () => ({
  trpc: { projects: { thread: { useMutation: () => ({ mutateAsync: ensureThread }) } } }
}));

interface SentMessage {
  role: string;
  content: unknown[];
  system_prompt?: string;
}
const sendMessage = jest.fn(
  async (_message: SentMessage, _threadId: string) => undefined
);
const fetchThread = jest.fn(async () => null);
const loadMessages = jest.fn(async () => []);
const chatState = {
  connect: jest.fn(async () => undefined),
  fetchThread,
  loadMessages,
  sendMessage,
  stopGeneration: jest.fn(),
  messageCache: {} as Record<string, unknown[]>,
  selectedModel: { provider: "anthropic", id: "claude-sonnet-5" }
};
jest.mock("../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: <T,>(selector: (s: typeof chatState) => T) => selector(chatState),
  useThreadRuntime: () => ({ status: "idle", toolMessage: null })
}));

jest.mock("../ProjectAgentThread", () => ({
  __esModule: true,
  default: () => <div data-testid="thread" />
}));

jest.mock("../../chat/composer/ChatComposer", () => ({
  __esModule: true,
  default: () => <div data-testid="composer" />
}));

import ProjectAgentPanel from "../ProjectAgentPanel";
import { stageProjectFirstTurn } from "../projectAgent";

const renderPanel = (threadId: string | null = null) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ProjectAgentPanel projectId="p1" projectName="Aurora" threadId={threadId} />
    </ThemeProvider>
  );

beforeEach(() => jest.clearAllMocks());

describe("ProjectAgentPanel", () => {
  it("creates the project's thread on first visit and loads its history", async () => {
    renderPanel();
    await waitFor(() => expect(ensureThread).toHaveBeenCalledWith({ id: "p1" }));
    await waitFor(() => expect(loadMessages).toHaveBeenCalledWith("t1"));
    expect(await screen.findByTestId("thread")).toBeInTheDocument();
  });

  it("sends a staged opening turn once, into the project's thread", async () => {
    stageProjectFirstTurn("p1", [{ type: "text", text: "A spot for our lamp" }]);
    renderPanel("t1");

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    const [message, threadId] = sendMessage.mock.calls[0];
    expect(threadId).toBe("t1");
    expect(message.role).toBe("user");
    expect(message.content).toEqual([
      { type: "text", text: "A spot for our lamp" }
    ]);
    expect(message.system_prompt).toContain("Aurora");
    // The history load lands before the send, or the send would be wiped.
    expect(loadMessages.mock.invocationCallOrder[0]).toBeLessThan(
      sendMessage.mock.invocationCallOrder[0]
    );
  });

  it("sends nothing when no opening turn was staged", async () => {
    renderPanel("t1");
    await waitFor(() => expect(loadMessages).toHaveBeenCalled());
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
