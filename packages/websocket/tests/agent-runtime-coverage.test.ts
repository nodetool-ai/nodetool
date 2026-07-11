/**
 * AgentRuntime — in-process agent session manager. Drives session lifecycle
 * (create / send / stop / close), ownership gating, session-id re-keying,
 * frontend-tool manifest validation, and the provider fan-out for
 * models/sessions/messages.
 *
 * The two concrete providers (`pi`, `llm`) are stubbed so the runtime's own
 * branching is exercised without touching pi-agent, the LLM provider, the DB,
 * or the MCP server.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { uiToolSchemas } from "@nodetool-ai/protocol";

// ── Mocks ─────────────────────────────────────────────────────────────

// A fake session whose behaviour each test can inspect / reconfigure.
const { fakeLlm, mcpMocks } = vi.hoisted(() => {
  return {
    fakeLlm: {
      // Filled in by the mock factory below.
      createSession: undefined as unknown as (opts: unknown) => unknown,
      listModels: undefined as unknown as (...a: unknown[]) => unknown,
      listSessions: undefined as unknown as (...a: unknown[]) => unknown,
      getSessionMessages: undefined as unknown as (...a: unknown[]) => unknown,
    },
    mcpMocks: {
      setActiveMcpFrontendRenderer: vi.fn(),
      getLocalMcpServerUrl: vi.fn(() => "http://localhost:9/mcp"),
      stopMcpToolServer: vi.fn(),
    },
  };
});

vi.mock("../src/agent/pi-agent.js", () => ({
  PiQuerySession: class {
    close() {}
    async interrupt() {}
    async send() {
      return [];
    }
  },
  listPiModels: vi.fn(async () => [{ id: "pi-model", provider: "pi" }]),
  listPiSessions: vi.fn(async () => [{ sessionId: "pi-s", summary: "pi" }]),
  getPiSessionMessages: vi.fn(async () => []),
}));

vi.mock("../src/agent/mcp-tool-server.js", () => ({
  stopMcpToolServer: mcpMocks.stopMcpToolServer,
}));

vi.mock("../src/mcp-server.js", () => ({
  setActiveMcpFrontendRenderer: mcpMocks.setActiveMcpFrontendRenderer,
  getLocalMcpServerUrl: mcpMocks.getLocalMcpServerUrl,
}));

// LlmAgentSdkProvider is the default provider. Replace it with a fake whose
// createSession returns a controllable session object.
vi.mock("../src/agent/llm-agent.js", () => {
  class FakeLlmProvider {
    readonly name = "llm";
    createSession(opts: unknown) {
      return fakeLlm.createSession(opts);
    }
    async listModels(...a: unknown[]) {
      return fakeLlm.listModels(...a);
    }
    async listSessions(...a: unknown[]) {
      return fakeLlm.listSessions(...a);
    }
    async getSessionMessages(...a: unknown[]) {
      return fakeLlm.getSessionMessages(...a);
    }
  }
  return { LlmAgentSdkProvider: FakeLlmProvider };
});

import { getAgentRuntime } from "../src/agent/agent-runtime.js";

// ── Helpers ───────────────────────────────────────────────────────────

// A manifest that names every ui_* tool the runtime insists on.
const fullManifest = Object.keys(uiToolSchemas).map((name) => ({
  name,
  description: name,
  parameters: { type: "object", properties: {} },
}));

const makeTransport = (
  overrides: Partial<{
    requestToolManifest: () => Promise<unknown[]>;
  }> = {},
) => ({
  id: "renderer-1",
  streamMessage: vi.fn(),
  requestToolManifest: vi.fn(
    overrides.requestToolManifest ?? (async () => fullManifest),
  ),
  executeTool: vi.fn(async () => ({})),
  abortTools: vi.fn(),
  isAlive: true,
});

const makeSession = () => ({
  send: vi.fn(
    async (
      _msg: string,
      _t: unknown,
      _sid: string,
      _manifest: unknown,
      onMessage?: (m: { session_id?: string }) => void,
    ) => {
      onMessage?.({ session_id: "real-thread-id" });
    },
  ),
  interrupt: vi.fn(async () => {}),
  close: vi.fn(),
});

let currentSession: ReturnType<typeof makeSession>;

beforeEach(() => {
  // The runtime is a process singleton — flush any sessions leaked by an
  // earlier test before resetting mock call counts.
  try {
    getAgentRuntime().closeAllSessions();
  } catch {
    // best effort
  }
  vi.clearAllMocks();
  currentSession = makeSession();
  fakeLlm.createSession = vi.fn(() => currentSession);
  fakeLlm.listModels = vi.fn(async () => [
    { id: "llm-model", provider: "llm" },
  ]);
  fakeLlm.listSessions = vi.fn(async () => [
    { sessionId: "llm-s", summary: "llm" },
  ]);
  fakeLlm.getSessionMessages = vi.fn(async () => []);
});

// ── Tests ─────────────────────────────────────────────────────────────

describe("getAgentRuntime", () => {
  it("returns a stable singleton", () => {
    expect(getAgentRuntime()).toBe(getAgentRuntime());
  });
});

describe("AgentRuntime.createSession", () => {
  it("rejects an unauthenticated userId", async () => {
    await expect(
      getAgentRuntime().createSession({ model: "m", provider: "llm" } as never, ""),
    ).rejects.toThrow(/authenticated userId/);
  });

  it("creates an llm session without a workspace", async () => {
    const id = await getAgentRuntime().createSession(
      { model: "m", provider: "llm", chatProviderId: "anthropic" } as never,
      "alice",
    );
    expect(id).toMatch(/^llm-session-\d+$/);
    expect(fakeLlm.createSession).toHaveBeenCalledTimes(1);
  });

  it("requires a workspacePath for non-llm providers when creating fresh", async () => {
    await expect(
      getAgentRuntime().createSession(
        { model: "m", provider: "pi" } as never,
        "alice",
      ),
    ).rejects.toThrow(/workspacePath is required when creating/);
  });

  it("still requires a workspacePath for a resumed non-llm session", async () => {
    await expect(
      getAgentRuntime().createSession(
        { model: "m", provider: "pi", resumeSessionId: "s1" } as never,
        "alice",
      ),
    ).rejects.toThrow(/workspacePath is required/);
  });

  it("creates a pi session when a workspacePath is provided", async () => {
    const id = await getAgentRuntime().createSession(
      { model: "m", provider: "pi", workspacePath: "/tmp/ws" } as never,
      "alice",
    );
    expect(id).toMatch(/^pi-session-\d+$/);
  });

  it("falls back to the llm provider for an unknown provider name", async () => {
    // Unknown provider resolves to llm, but options.provider !== 'llm' so a
    // workspace is still demanded.
    await expect(
      getAgentRuntime().createSession(
        { model: "m", provider: "does-not-exist" } as never,
        "alice",
      ),
    ).rejects.toThrow(/workspacePath is required/);
  });
});

describe("AgentRuntime.sendMessageStreaming", () => {
  it("streams messages, re-keys to the real session id, and ends with a system message", async () => {
    const rt = getAgentRuntime();
    const id = await rt.createSession(
      { model: "m", provider: "llm", chatProviderId: "anthropic" } as never,
      "alice",
    );
    const transport = makeTransport();

    await rt.sendMessageStreaming(id, "hi", transport as never, "alice");

    expect(mcpMocks.setActiveMcpFrontendRenderer).toHaveBeenCalledWith(transport);
    expect(currentSession.send).toHaveBeenCalledTimes(1);
    // Final done=true system message.
    const lastCall = transport.streamMessage.mock.calls.at(-1);
    expect(lastCall?.[1]).toMatchObject({ type: "system" });
    expect(lastCall?.[2]).toBe(true);

    // The onMessage callback re-keyed the session under 'real-thread-id',
    // owned by alice — a stop targeting that id must succeed.
    await expect(
      rt.stopExecution("real-thread-id", "alice"),
    ).resolves.toBeUndefined();
    expect(currentSession.interrupt).toHaveBeenCalled();
  });

  it("throws when the frontend manifest is incomplete", async () => {
    const rt = getAgentRuntime();
    const id = await rt.createSession(
      { model: "m", provider: "llm", chatProviderId: "anthropic" } as never,
      "alice",
    );
    const transport = makeTransport({
      requestToolManifest: async () => [
        { name: "ui_search_nodes", description: "", parameters: {} },
      ],
    });
    await expect(
      rt.sendMessageStreaming(id, "hi", transport as never, "alice"),
    ).rejects.toThrow(/manifest is incomplete/);
    expect(currentSession.send).not.toHaveBeenCalled();
  });

  it("propagates a manifest request failure", async () => {
    const rt = getAgentRuntime();
    const id = await rt.createSession(
      { model: "m", provider: "llm", chatProviderId: "anthropic" } as never,
      "alice",
    );
    const transport = makeTransport({
      requestToolManifest: async () => {
        throw new Error("transport dead");
      },
    });
    await expect(
      rt.sendMessageStreaming(id, "hi", transport as never, "alice"),
    ).rejects.toThrow(/transport dead/);
  });

  it("refuses to send to a session the caller does not own", async () => {
    const rt = getAgentRuntime();
    const id = await rt.createSession(
      { model: "m", provider: "llm", chatProviderId: "anthropic" } as never,
      "alice",
    );
    await expect(
      rt.sendMessageStreaming(id, "hi", makeTransport() as never, "mallory"),
    ).rejects.toThrow(/No active agent session/);
  });
});

describe("AgentRuntime session lifecycle", () => {
  it("stopExecution rejects for a non-owner", async () => {
    const rt = getAgentRuntime();
    const id = await rt.createSession(
      { model: "m", provider: "llm", chatProviderId: "anthropic" } as never,
      "alice",
    );
    await expect(rt.stopExecution(id, "bob")).rejects.toThrow(
      /No active agent session/,
    );
  });

  it("setMemoryEnabled calls the setter when the session supports it", async () => {
    const setMemoryEnabled = vi.fn();
    currentSession = { ...makeSession(), setMemoryEnabled } as never;
    fakeLlm.createSession = vi.fn(() => currentSession);

    const rt = getAgentRuntime();
    const id = await rt.createSession(
      { model: "m", provider: "llm", chatProviderId: "anthropic" } as never,
      "alice",
    );
    rt.setMemoryEnabled(id, "alice", true);
    expect(setMemoryEnabled).toHaveBeenCalledWith(true);
  });

  it("setMemoryEnabled is a no-op for sessions without the setter", async () => {
    const rt = getAgentRuntime();
    const id = await rt.createSession(
      { model: "m", provider: "llm", chatProviderId: "anthropic" } as never,
      "alice",
    );
    // currentSession has no setMemoryEnabled — must not throw.
    expect(() => rt.setMemoryEnabled(id, "alice", false)).not.toThrow();
  });

  it("closeSession closes an owned session and forgets it", async () => {
    const rt = getAgentRuntime();
    const id = await rt.createSession(
      { model: "m", provider: "llm", chatProviderId: "anthropic" } as never,
      "alice",
    );
    rt.closeSession(id, "alice");
    expect(currentSession.close).toHaveBeenCalledTimes(1);
    // Session is gone now → a follow-up stop reports no session.
    await expect(rt.stopExecution(id, "alice")).rejects.toThrow(
      /No active agent session/,
    );
  });

  it("closeSession ignores a non-owner", async () => {
    const rt = getAgentRuntime();
    const id = await rt.createSession(
      { model: "m", provider: "llm", chatProviderId: "anthropic" } as never,
      "alice",
    );
    rt.closeSession(id, "bob");
    expect(currentSession.close).not.toHaveBeenCalled();
  });

  it("closeAllSessions closes every unique session and stops the MCP server", async () => {
    const rt = getAgentRuntime();
    await rt.createSession(
      { model: "m", provider: "llm", chatProviderId: "anthropic" } as never,
      "alice",
    );
    const first = currentSession;
    currentSession = makeSession();
    fakeLlm.createSession = vi.fn(() => currentSession);
    await rt.createSession(
      { model: "m", provider: "llm", chatProviderId: "anthropic" } as never,
      "bob",
    );

    rt.closeAllSessions();
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(currentSession.close).toHaveBeenCalledTimes(1);
    expect(mcpMocks.stopMcpToolServer).toHaveBeenCalledTimes(1);
  });
});

describe("AgentRuntime provider fan-out", () => {
  it("listModels delegates to the named provider", async () => {
    const rt = getAgentRuntime();
    const models = await rt.listModels({ provider: "llm" } as never, "alice");
    expect(models).toEqual([{ id: "llm-model", provider: "llm" }]);
    expect(fakeLlm.listModels).toHaveBeenCalledWith("alice", undefined);
  });

  it("listSessionsForRequest scopes to one provider when named", async () => {
    const rt = getAgentRuntime();
    const list = await rt.listSessionsForRequest(
      { provider: "llm" } as never,
      "alice",
    );
    expect(list).toEqual([{ sessionId: "llm-s", summary: "llm" }]);
  });

  it("listSessionsForRequest aggregates across providers when none named", async () => {
    const rt = getAgentRuntime();
    const list = await rt.listSessionsForRequest({} as never, "alice");
    // pi + llm sessions flattened together.
    const ids = list.map((e) => e.sessionId).sort();
    expect(ids).toEqual(["llm-s", "pi-s"]);
  });

  it("getSessionMessagesForRequest returns the first non-empty provider result", async () => {
    fakeLlm.getSessionMessages = vi.fn(async () => [
      { type: "user", uuid: "u1", session_id: "s", text: "hi" },
    ]);
    const rt = getAgentRuntime();
    const msgs = await rt.getSessionMessagesForRequest(
      { sessionId: "s" } as never,
      "alice",
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0].text).toBe("hi");
  });

  it("getSessionMessagesForRequest returns [] when every provider is empty", async () => {
    const rt = getAgentRuntime();
    const msgs = await rt.getSessionMessagesForRequest(
      { sessionId: "s" } as never,
      "alice",
    );
    expect(msgs).toEqual([]);
  });
});
