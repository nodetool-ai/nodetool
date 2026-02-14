import { EventEmitter } from "node:events";

const mockSpawn = jest.fn();
const mockSpawnSync = jest.fn(() => ({ status: 0, stdout: "/usr/bin/claude\n" }));

jest.mock("node:child_process", () => ({
  spawn: mockSpawn,
  spawnSync: mockSpawnSync,
}));

jest.mock("electron", () => {
  const { EventEmitter } = require("node:events") as typeof import("node:events");
  return {
    app: {
      getPath: jest.fn().mockReturnValue("/tmp/home"),
    },
    ipcMain: new EventEmitter(),
  };
});

jest.mock("../types.d", () => ({
  IpcChannels: {
    AGENT_STREAM_MESSAGE: "agent-stream-message",
    FRONTEND_TOOLS_GET_MANIFEST_REQUEST: "frontend-tools-get-manifest-request",
    FRONTEND_TOOLS_GET_MANIFEST_RESPONSE: "frontend-tools-get-manifest-response",
    FRONTEND_TOOLS_CALL_REQUEST: "frontend-tools-call-request",
    FRONTEND_TOOLS_CALL_RESPONSE: "frontend-tools-call-response",
  },
}));

jest.mock("node:fs", () => ({
  existsSync: jest.fn().mockReturnValue(true),
}));

jest.mock("../logger", () => ({
  logMessage: jest.fn(),
}));

import {
  createAgentSession,
  sendAgentMessage,
  sendAgentMessageStreaming,
  closeAgentSession,
  closeAllAgentSessions,
} from "../agent";
import { IpcChannels } from "../types.d";
import { ipcMain } from "electron";

function makeMockClaudeProcess(lines: Record<string, unknown>[]) {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  let emitted = false;
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
      if (parsed.type === "user" && !emitted) {
        emitted = true;
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

describe("agent session alias handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    closeAllAgentSessions();
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

    const tempSessionId = await createAgentSession({
      model: "claude-sonnet-4-20250514",
      workspacePath: "/tmp/workspace-test",
    });

    await sendAgentMessage(tempSessionId, "hi");

    await expect(
      sendAgentMessage(tempSessionId, "what tools can you do"),
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

    const tempSessionId = await createAgentSession({
      model: "claude-sonnet-4-20250514",
      workspacePath: "/tmp/workspace-test",
    });

    await sendAgentMessage(tempSessionId, "hi");
    closeAgentSession(tempSessionId);

    await expect(
      sendAgentMessage("sdk-session-1", "should fail"),
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

    const tempSessionId = await createAgentSession({
      model: "claude-sonnet-4-20250514",
      workspacePath: "/tmp/workspace-test",
    });

    await sendAgentMessage(tempSessionId, "hi");

    expect(mockSpawn).toHaveBeenCalled();
    const [, args] = mockSpawn.mock.calls[0] as [string, string[]];
    expect(args).toContain("--output-format");
    expect(args).toContain("stream-json");
    expect(args).toContain("--verbose");
    expect(args).toContain("--permission-mode");
    expect(args).toContain("bypassPermissions");
    expect(args).not.toContain("--mcp-config");
  });

  it("writes user stream-json payloads to stdin", async () => {
    mockSpawn.mockReturnValue(
      makeMockClaudeProcess([
        { type: "init", sessionId: "sdk-session-1" },
        { type: "message", content: "hello" },
        { type: "result", status: "success", result: "done" },
      ]),
    );

    const tempSessionId = await createAgentSession({
      model: "claude-sonnet-4-20250514",
      workspacePath: "/tmp/workspace-test",
    });

    await sendAgentMessage(tempSessionId, "hi");

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

    const tempSessionId = await createAgentSession({
      model: "claude-sonnet-4-20250514",
      workspacePath: "/tmp/workspace-test",
    });

    await expect(sendAgentMessage(tempSessionId, "hi")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "assistant",
          session_id: "modern-session-1",
          content: [{ type: "text", text: "Hi! How can I help you today?" }],
        }),
      ]),
    );
  });

  it("does not inject tool_result payloads for non-frontend tool_use events", async () => {
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

    const tempSessionId = await createAgentSession({
      model: "claude-sonnet-4-20250514",
      workspacePath: "/tmp/workspace-test",
    });

    const messages = await sendAgentMessage(tempSessionId, "hi");
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "assistant",
          session_id: "modern-session-2",
          tool_calls: [
            expect.objectContaining({
              id: "call_1",
              function: expect.objectContaining({
                name: "mcp__nodetool__search_nodes",
              }),
            }),
          ],
        }),
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
    // Initial user message + one corrective text note for mcp tools.
    expect(spawnedProcess.stdin.write.mock.calls.length).toBeGreaterThanOrEqual(2);
    const writes = spawnedProcess.stdin.write.mock.calls.map((call) =>
      String(call[0]),
    );
    // No synthetic tool_result payload should be written for non-frontend MCP tools.
    expect(writes.some((payload) => payload.includes("\"tool_result\""))).toBe(false);
  });

  it("injects a corrective note when assistant calls mcp tools", async () => {
    mockSpawn.mockReturnValue(
      makeMockClaudeProcess([
        {
          type: "system",
          subtype: "init",
          session_id: "modern-session-mcp",
        },
        {
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                id: "call_mcp_1",
                name: "mcp__nodetool__search_nodes",
                input: { query: "string" },
              },
            ],
          },
          session_id: "modern-session-mcp",
        },
        {
          type: "result",
          subtype: "success",
          is_error: false,
          result: "done",
          session_id: "modern-session-mcp",
        },
      ]),
    );

    const tempSessionId = await createAgentSession({
      model: "claude-sonnet-4-20250514",
      workspacePath: "/tmp/workspace-test",
    });

    await sendAgentMessage(tempSessionId, "hi");

    const spawnedProcess = mockSpawn.mock.results[0]?.value as {
      stdin: { write: jest.Mock };
    };

    // Initial user message + one corrective note.
    expect(spawnedProcess.stdin.write.mock.calls.length).toBeGreaterThanOrEqual(2);
    const writes = spawnedProcess.stdin.write.mock.calls.map((call) =>
      String(call[0]),
    );
    expect(
      writes.some((payload) =>
        payload.includes("only UI manifest tools are available"),
      ),
    ).toBe(
      true,
    );
  });

  it("does not send stale frontend tool_result after non-runtime tool_result already exists", async () => {
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
        const parsed = JSON.parse(payload.trim()) as {
          type?: string;
          message?: { content?: Array<{ type?: string }> };
        };
        if (
          parsed.type === "user" &&
          parsed.message?.content?.[0]?.type === "text"
        ) {
          setImmediate(() => {
            const ndjson = [
              { type: "system", subtype: "init", session_id: "modern-session-3" },
              {
                type: "assistant",
                message: {
                  content: [
                    {
                      type: "tool_use",
                      id: "call_1",
                      name: "ui_add_node",
                      input: { id: "n1", type: "nodetool.constant.String" },
                    },
                  ],
                },
                session_id: "modern-session-3",
              },
              {
                type: "user",
                message: {
                  role: "user",
                  content: [
                    {
                      type: "tool_result",
                      tool_use_id: "call_1",
                      content: "<tool_use_error>Error: Validation failed</tool_use_error>",
                      is_error: true,
                    },
                  ],
                },
                session_id: "modern-session-3",
              },
            ]
              .map((line) => JSON.stringify(line))
              .join("\n");
            stdout.emit("data", Buffer.from(`${ndjson}\n`, "utf8"));
            setTimeout(() => {
              processEmitter.emit("close", 0);
            }, 50);
          });
        }
        return true;
      }),
      end: jest.fn(),
    };

    mockSpawn.mockReturnValue(processEmitter);

    const tempSessionId = await createAgentSession({
      model: "claude-sonnet-4-20250514",
      workspacePath: "/tmp/workspace-test",
    });

    const webContents = {
      send: jest.fn((channel: string, payload: { requestId?: string }) => {
        if (channel === IpcChannels.FRONTEND_TOOLS_GET_MANIFEST_REQUEST) {
          setImmediate(() => {
            (ipcMain as unknown as EventEmitter).emit(
              IpcChannels.FRONTEND_TOOLS_GET_MANIFEST_RESPONSE,
              { sender: webContents },
              {
                requestId: payload.requestId,
                manifest: [
                  {
                    name: "ui_add_node",
                    description: "Add a node to the workflow graph",
                    parameters: { type: "object", properties: {}, required: [] },
                  },
                ],
              },
            );
          });
          return;
        }

        if (channel === IpcChannels.FRONTEND_TOOLS_CALL_REQUEST) {
          setTimeout(() => {
            (ipcMain as unknown as EventEmitter).emit(
              IpcChannels.FRONTEND_TOOLS_CALL_RESPONSE,
              { sender: webContents },
              {
                requestId: payload.requestId,
                result: {
                  result: { ok: true },
                  isError: false,
                },
              },
            );
          }, 10);
        }
      }),
    };

    await sendAgentMessageStreaming(
      tempSessionId,
      "add a String constant node",
      webContents as unknown as import("electron").WebContents,
    );

    // Only the initial user message should be written to Claude stdin.
    // The delayed successful frontend result for call_1 must be ignored as stale.
    expect(processEmitter.stdin.write).toHaveBeenCalledTimes(1);
  });

  it("overrides runtime unknown-tool tool_result with frontend tool_result", async () => {
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
        const parsed = JSON.parse(payload.trim()) as {
          type?: string;
          message?: { content?: Array<{ type?: string }> };
        };
        if (
          parsed.type === "user" &&
          parsed.message?.content?.[0]?.type === "text"
        ) {
          setImmediate(() => {
            const ndjson = [
              { type: "system", subtype: "init", session_id: "modern-session-4" },
              {
                type: "assistant",
                message: {
                  content: [
                    {
                      type: "tool_use",
                      id: "call_2",
                      name: "ui_search_nodes",
                      input: { query: "string" },
                    },
                  ],
                },
                session_id: "modern-session-4",
              },
              {
                type: "user",
                message: {
                  role: "user",
                  content: [
                    {
                      type: "tool_result",
                      tool_use_id: "call_2",
                      content:
                        "<tool_use_error>Error: No such tool available: ui_search_nodes</tool_use_error>",
                      is_error: true,
                    },
                  ],
                },
                session_id: "modern-session-4",
              },
            ]
              .map((line) => JSON.stringify(line))
              .join("\n");
            stdout.emit("data", Buffer.from(`${ndjson}\n`, "utf8"));
            setTimeout(() => {
              processEmitter.emit("close", 0);
            }, 50);
          });
        }
        return true;
      }),
      end: jest.fn(),
    };

    mockSpawn.mockReturnValue(processEmitter);

    const tempSessionId = await createAgentSession({
      model: "claude-sonnet-4-20250514",
      workspacePath: "/tmp/workspace-test",
    });

    const webContents = {
      send: jest.fn((channel: string, payload: { requestId?: string }) => {
        if (channel === IpcChannels.FRONTEND_TOOLS_GET_MANIFEST_REQUEST) {
          setImmediate(() => {
            (ipcMain as unknown as EventEmitter).emit(
              IpcChannels.FRONTEND_TOOLS_GET_MANIFEST_RESPONSE,
              { sender: webContents },
              {
                requestId: payload.requestId,
                manifest: [
                  {
                    name: "ui_search_nodes",
                    description: "Search nodes in the workflow graph",
                    parameters: { type: "object", properties: {}, required: [] },
                  },
                ],
              },
            );
          });
          return;
        }

        if (channel === IpcChannels.FRONTEND_TOOLS_CALL_REQUEST) {
          setTimeout(() => {
            (ipcMain as unknown as EventEmitter).emit(
              IpcChannels.FRONTEND_TOOLS_CALL_RESPONSE,
              { sender: webContents },
              {
                requestId: payload.requestId,
                result: {
                  result: { ok: true, result: [] },
                  isError: false,
                },
              },
            );
          }, 10);
        }
      }),
    };

    await sendAgentMessageStreaming(
      tempSessionId,
      "add a String node",
      webContents as unknown as import("electron").WebContents,
    );

    // First write is initial user text; a corrective note may be injected, and
    // the final write is bridged tool_result overriding runtime unknown-tool error.
    expect(processEmitter.stdin.write.mock.calls.length).toBeGreaterThanOrEqual(2);
    const lastPayload = JSON.parse(
      String(
        processEmitter.stdin.write.mock.calls[
          processEmitter.stdin.write.mock.calls.length - 1
        ][0],
      ).trim(),
    ) as {
      message?: { content?: Array<{ type?: string; tool_use_id?: string; is_error?: boolean }> };
    };
    expect(lastPayload.message?.content?.[0]?.type).toBe("tool_result");
    expect(lastPayload.message?.content?.[0]?.tool_use_id).toBe("call_2");
    expect(lastPayload.message?.content?.[0]?.is_error).toBe(false);
  });

  it("caches repeated ui_search_nodes calls within a single turn", async () => {
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
        const parsed = JSON.parse(payload.trim()) as {
          type?: string;
          message?: { content?: Array<{ type?: string }> };
        };
        if (
          parsed.type === "user" &&
          parsed.message?.content?.[0]?.type === "text"
        ) {
          setImmediate(() => {
            const ndjson = [
              { type: "system", subtype: "init", session_id: "modern-session-cache" },
              {
                type: "assistant",
                message: {
                  content: [
                    {
                      type: "tool_use",
                      id: "call_cache_1",
                      name: "ui_search_nodes",
                      input: { query: "string", include_outputs: true },
                    },
                    {
                      type: "tool_use",
                      id: "call_cache_2",
                      name: "ui_search_nodes",
                      input: { query: "string", include_outputs: true },
                    },
                  ],
                },
                session_id: "modern-session-cache",
              },
              {
                type: "result",
                subtype: "success",
                is_error: false,
                result: "done",
                session_id: "modern-session-cache",
              },
            ]
              .map((line) => JSON.stringify(line))
              .join("\n");
            stdout.emit("data", Buffer.from(`${ndjson}\n`, "utf8"));
            setTimeout(() => {
              processEmitter.emit("close", 0);
            }, 50);
          });
        }
        return true;
      }),
      end: jest.fn(),
    };

    mockSpawn.mockReturnValue(processEmitter);

    const tempSessionId = await createAgentSession({
      model: "claude-sonnet-4-20250514",
      workspacePath: "/tmp/workspace-test",
    });

    const webContents = {
      send: jest.fn((channel: string, payload: { requestId?: string }) => {
        if (channel === IpcChannels.FRONTEND_TOOLS_GET_MANIFEST_REQUEST) {
          setImmediate(() => {
            (ipcMain as unknown as EventEmitter).emit(
              IpcChannels.FRONTEND_TOOLS_GET_MANIFEST_RESPONSE,
              { sender: webContents },
              {
                requestId: payload.requestId,
                manifest: [
                  {
                    name: "ui_search_nodes",
                    description: "Search nodes",
                    parameters: { type: "object", properties: {}, required: [] },
                  },
                ],
              },
            );
          });
          return;
        }
        if (channel === IpcChannels.FRONTEND_TOOLS_CALL_REQUEST) {
          setImmediate(() => {
            (ipcMain as unknown as EventEmitter).emit(
              IpcChannels.FRONTEND_TOOLS_CALL_RESPONSE,
              { sender: webContents },
              {
                requestId: payload.requestId,
                result: {
                  result: { ok: true, results: [{ node_type: "nodetool.input.StringInput" }] },
                  isError: false,
                },
              },
            );
          });
        }
      }),
    };

    await sendAgentMessageStreaming(
      tempSessionId,
      "add string node",
      webContents as unknown as import("electron").WebContents,
    );

    const frontendCallRequests = webContents.send.mock.calls.filter(
      (call) => call[0] === IpcChannels.FRONTEND_TOOLS_CALL_REQUEST,
    );
    expect(frontendCallRequests).toHaveLength(1);
  });
});
