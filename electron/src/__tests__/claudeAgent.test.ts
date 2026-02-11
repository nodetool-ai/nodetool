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
      if (parsed.type === "message") {
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
});
