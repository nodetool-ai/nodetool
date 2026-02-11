import { EventEmitter } from "node:events";

const mockSpawn = jest.fn();
const mockSpawnSync = jest.fn(() => ({ status: 0, stdout: "/usr/bin/claude\n" }));

jest.mock("node:child_process", () => ({
  spawn: mockSpawn,
  spawnSync: mockSpawnSync,
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

function makeMockClaudeProcess(lines: Record<string, unknown>[]) {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const processEmitter = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { write: jest.Mock; end: jest.Mock };
  };

  processEmitter.stdout = stdout;
  processEmitter.stderr = stderr;
  processEmitter.stdin = {
    write: jest.fn((payload: string) => {
      const parsed = JSON.parse(payload.trim()) as { type?: string };
      if (parsed.type === "user") {
        setImmediate(() => {
          const ndjson = `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;
          stdout.emit("data", Buffer.from(ndjson, "utf8"));
          processEmitter.emit("close", 0);
        });
      }
      return true;
    }),
    end: jest.fn(),
  };

  return processEmitter;
}

describe("claudeAgent session alias handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    closeAllClaudeAgentSessions();
  });

  it("keeps the original temp session id valid after claude emits a canonical session id", async () => {
    mockSpawn
      .mockReturnValueOnce(
        makeMockClaudeProcess([
          { type: "init", sessionId: "sdk-session-1" },
          { type: "message", content: "hello" },
          { type: "result", status: "success", result: "done" },
        ]),
      )
      .mockReturnValueOnce(
        makeMockClaudeProcess([
          { type: "init", sessionId: "sdk-session-1" },
          { type: "message", content: "again" },
          { type: "result", status: "success", result: "done" },
        ]),
      );

    const tempSessionId = await createClaudeAgentSession({
      model: "claude-sonnet-4-20250514",
      workspacePath: "/tmp/workspace-test",
    });

    await sendClaudeAgentMessage(tempSessionId, "hi");

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
    mockSpawn.mockReturnValue(
      makeMockClaudeProcess([
        { type: "init", sessionId: "sdk-session-1" },
        { type: "message", content: "hello" },
        { type: "result", status: "success", result: "done" },
      ]),
    );

    const tempSessionId = await createClaudeAgentSession({
      model: "claude-sonnet-4-20250514",
      workspacePath: "/tmp/workspace-test",
    });

    await sendClaudeAgentMessage(tempSessionId, "hi");
    closeClaudeAgentSession(tempSessionId);

    await expect(
      sendClaudeAgentMessage("sdk-session-1", "should fail"),
    ).rejects.toThrow("No active Claude Agent session");
  });

  it("spawns claude with verbose when using stream-json output", async () => {
    mockSpawn.mockReturnValue(
      makeMockClaudeProcess([
        { type: "init", sessionId: "sdk-session-1" },
        { type: "message", content: "hello" },
        { type: "result", status: "success", result: "done" },
      ]),
    );

    const tempSessionId = await createClaudeAgentSession({
      model: "claude-sonnet-4-20250514",
      workspacePath: "/tmp/workspace-test",
    });

    await sendClaudeAgentMessage(tempSessionId, "hi");

    expect(mockSpawn).toHaveBeenCalled();
    const [, args] = mockSpawn.mock.calls[0] as [string, string[]];
    expect(args).toContain("--output-format");
    expect(args).toContain("stream-json");
    expect(args).toContain("--verbose");
  });

  it("writes user stream-json payloads to stdin", async () => {
    mockSpawn.mockReturnValue(
      makeMockClaudeProcess([
        { type: "init", sessionId: "sdk-session-1" },
        { type: "message", content: "hello" },
        { type: "result", status: "success", result: "done" },
      ]),
    );

    const tempSessionId = await createClaudeAgentSession({
      model: "claude-sonnet-4-20250514",
      workspacePath: "/tmp/workspace-test",
    });

    await sendClaudeAgentMessage(tempSessionId, "hi");

    const spawnedProcess = mockSpawn.mock.results[0]?.value as {
      stdin: { write: jest.Mock };
    };
    const firstWritePayload = JSON.parse(
      String(spawnedProcess.stdin.write.mock.calls[0][0]).trim(),
    ) as {
      type: string;
      message?: { role?: string; content?: Array<Record<string, unknown>> };
    };

    expect(firstWritePayload.type).toBe("user");
    expect(firstWritePayload.message?.role).toBe("user");
    expect(firstWritePayload.message?.content?.[0]).toEqual({
      type: "text",
      text: "hi",
    });
  });

  it("parses modern system/assistant/result stream-json events", async () => {
    mockSpawn.mockReturnValue(
      makeMockClaudeProcess([
        {
          type: "system",
          subtype: "init",
          session_id: "modern-session-1",
        },
        {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Hi! How can I help you today?" }],
          },
          session_id: "modern-session-1",
        },
        {
          type: "result",
          subtype: "success",
          is_error: false,
          result: "Hi! How can I help you today?",
          session_id: "modern-session-1",
        },
      ]),
    );

    const tempSessionId = await createClaudeAgentSession({
      model: "claude-sonnet-4-20250514",
      workspacePath: "/tmp/workspace-test",
    });

    await expect(sendClaudeAgentMessage(tempSessionId, "hi")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "assistant",
          session_id: "modern-session-1",
          content: [{ type: "text", text: "Hi! How can I help you today?" }],
        }),
      ]),
    );
  });

  it("does not inject tool_result errors for non-frontend tool_use events", async () => {
    mockSpawn.mockReturnValue(
      makeMockClaudeProcess([
        {
          type: "system",
          subtype: "init",
          session_id: "modern-session-2",
        },
        {
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                id: "call_1",
                name: "mcp__nodetool__search_nodes",
                input: { query: ["image"] },
              },
              { type: "text", text: "Working on it..." },
            ],
          },
          session_id: "modern-session-2",
        },
        {
          type: "result",
          subtype: "success",
          is_error: false,
          result: "done",
          session_id: "modern-session-2",
        },
      ]),
    );

    const tempSessionId = await createClaudeAgentSession({
      model: "claude-sonnet-4-20250514",
      workspacePath: "/tmp/workspace-test",
    });

    const messages = await sendClaudeAgentMessage(tempSessionId, "hi");
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "assistant",
          session_id: "modern-session-2",
          content: [{ type: "text", text: "Working on it..." }],
        }),
      ]),
    );

    const spawnedProcess = mockSpawn.mock.results[0]?.value as {
      stdin: { write: jest.Mock };
    };
    // Initial user message only; no synthetic tool_result should be written
    // for non-frontend MCP tools.
    expect(spawnedProcess.stdin.write).toHaveBeenCalledTimes(1);
  });
});
