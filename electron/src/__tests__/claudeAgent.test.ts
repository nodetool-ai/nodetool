const queuedMessages: Array<Record<string, unknown>> = [];

const mockIterator = {
  next: jest.fn(async () => {
    if (queuedMessages.length === 0) {
      return { done: true, value: undefined };
    }
    return { done: false, value: queuedMessages.shift() };
  }),
};

const mockQuery = {
  close: jest.fn(),
  setMcpServers: jest.fn(async () => ({})),
  [Symbol.asyncIterator]: jest.fn(() => mockIterator),
};

jest.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: jest.fn(() => mockQuery),
  createSdkMcpServer: jest.fn(),
  tool: jest.fn(),
}));

jest.mock("electron", () => ({
  app: {
    getPath: jest.fn().mockReturnValue("/tmp/home"),
  },
}));

jest.mock("node:fs", () => ({
  existsSync: jest.fn().mockReturnValue(true),
}));

jest.mock("../logger", () => ({
  logMessage: jest.fn(),
}));

import {
  createClaudeAgentSession,
  sendClaudeAgentMessage,
  closeClaudeAgentSession,
  closeAllClaudeAgentSessions,
} from "../claudeAgent";

describe("claudeAgent session alias handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queuedMessages.length = 0;
  });

  afterEach(() => {
    closeAllClaudeAgentSessions();
  });

  it("keeps the original temp session id valid after sdk emits a canonical session id", async () => {
    const tempSessionId = await createClaudeAgentSession({
      model: "claude-sonnet-4-20250514",
      workspacePath: "/tmp/workspace-test",
    });

    queuedMessages.push(
      {
        type: "assistant",
        uuid: "m1",
        session_id: "sdk-session-1",
        message: { content: [{ type: "text", text: "hello" }] },
      },
      {
        type: "result",
        uuid: "m2",
        session_id: "sdk-session-1",
        subtype: "success",
        result: "done",
      },
    );

    await sendClaudeAgentMessage(tempSessionId, "hi");

    queuedMessages.push(
      {
        type: "assistant",
        uuid: "m3",
        session_id: "sdk-session-1",
        message: { content: [{ type: "text", text: "again" }] },
      },
      {
        type: "result",
        uuid: "m4",
        session_id: "sdk-session-1",
        subtype: "success",
        result: "done",
      },
    );

    await expect(
      sendClaudeAgentMessage(tempSessionId, "what tools can you do"),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "assistant",
          session_id: "sdk-session-1",
        }),
      ]),
    );
  });

  it("closes all aliases when closing via a temp id", async () => {
    const tempSessionId = await createClaudeAgentSession({
      model: "claude-sonnet-4-20250514",
      workspacePath: "/tmp/workspace-test",
    });

    queuedMessages.push(
      {
        type: "assistant",
        uuid: "m1",
        session_id: "sdk-session-1",
        message: { content: [{ type: "text", text: "hello" }] },
      },
      {
        type: "result",
        uuid: "m2",
        session_id: "sdk-session-1",
        subtype: "success",
        result: "done",
      },
    );

    await sendClaudeAgentMessage(tempSessionId, "hi");
    closeClaudeAgentSession(tempSessionId);

    await expect(
      sendClaudeAgentMessage("sdk-session-1", "should fail"),
    ).rejects.toThrow("No active Claude Agent session");
    expect(mockQuery.close).toHaveBeenCalledTimes(1);
  });
});
