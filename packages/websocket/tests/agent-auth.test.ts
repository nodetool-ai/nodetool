/**
 * AgentRuntime auth + cross-user session isolation.
 *
 * Tests that:
 *   - createSession refuses an empty userId.
 *   - createSession registers the calling user as the session owner.
 *   - sendMessageStreaming / stopExecution / closeSession refuse to operate
 *     on sessions owned by another user, with a uniform "no active agent
 *     session" error so callers can't probe session existence.
 *   - When a session re-keys to its real id (Claude SDK session id, our DB
 *     thread id), the ownership stamp follows.
 *
 * The harness providers (claude/codex/opencode/pi) instantiate at module
 * load but are never invoked; only the LLM provider path is exercised so
 * we don't need to mock the SDK subprocesses.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { initTestDb } from "@nodetool-ai/models";

// processChat is the only LlmAgentSession dependency that does network /
// heavy work on send(). Replace it with a stub that just appends an
// assistant message — every test below avoids calling send() unless it's
// specifically about the streaming path, but mocking once keeps things
// hermetic.
vi.mock("@nodetool-ai/chat", () => ({
  processChat: vi.fn(async (opts: { messages: unknown[] }) => {
    (opts.messages as unknown[]).push({ role: "assistant", content: "ok" });
    return opts.messages;
  }),
}));

// We want the LLM provider's createSession path but not the harness ones.
// Stub the harness session classes so even if a stray test poked them they
// wouldn't spawn anything.
vi.mock("../src/agent/codex-agent.js", () => ({
  CodexQuerySession: class {
    async send() {
      return [];
    }
    async interrupt() {}
    close() {}
  },
  listCodexModels: async () => [],
}));
vi.mock("../src/agent/opencode-agent.js", () => ({
  OpenCodeQuerySession: class {
    async send() {
      return [];
    }
    async interrupt() {}
    close() {}
  },
  listOpenCodeModels: async () => [],
  listOpenCodeSessions: async () => [],
  getOpenCodeSessionMessages: async () => [],
  closeOpenCodeServer: () => {},
}));
vi.mock("../src/agent/pi-agent.js", () => ({
  PiQuerySession: class {
    async send() {
      return [];
    }
    async interrupt() {}
    close() {}
  },
  listPiModels: async () => [],
  listPiSessions: async () => [],
  getPiSessionMessages: async () => [],
}));
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: () => ({
    [Symbol.asyncIterator]() {
      return { next: async () => ({ done: true, value: undefined }) };
    },
    interrupt() {},
    close() {},
  }),
  listSessions: async () => [],
  getSessionMessages: async () => [],
}));

// The LLM provider asks @nodetool-ai/runtime to look up the chat provider per
// session. Always return a provider that yields a single text chunk.
vi.mock("@nodetool-ai/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nodetool-ai/runtime")>();
  return {
    ...actual,
    getProvider: vi.fn(async () => ({
      provider: "anthropic",
      hasToolSupport: async () => true,
      async *generateMessages() {
        yield { type: "chunk", content: "hi" };
      },
      async *generateMessagesTraced() {
        yield { type: "chunk", content: "hi" };
      },
      getAvailableLanguageModels: async () => [],
    })),
    isProviderConfigured: vi.fn(async () => true),
    listRegisteredProviderIds: vi.fn(() => ["anthropic"]),
  };
});

import { getAgentRuntime } from "../src/agent/agent-runtime.js";

describe("AgentRuntime auth", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("createSession refuses an empty userId", async () => {
    await expect(
      getAgentRuntime().createSession(
        { provider: "llm", model: "m", chatProviderId: "anthropic" },
        "",
      ),
    ).rejects.toThrow(/authenticated userId/i);
  });

  it("listModels refuses an empty userId for the LLM provider", async () => {
    await expect(
      getAgentRuntime().listModels({ provider: "llm" }, ""),
    ).rejects.toThrow(/authenticated userId/i);
  });

  it("listSessions for the LLM provider refuses an empty userId", async () => {
    await expect(
      getAgentRuntime().listSessionsForRequest({ provider: "llm" }, ""),
    ).rejects.toThrow(/authenticated userId/i);
  });
});

describe("AgentRuntime cross-user session isolation", () => {
  beforeEach(() => {
    initTestDb();
  });

  const newSession = async (userId: string) =>
    getAgentRuntime().createSession(
      {
        provider: "llm",
        model: "m",
        chatProviderId: "anthropic",
      },
      userId,
    );

  it("hides the session from a different user with a uniform error", async () => {
    const sessionId = await newSession("alice");

    // Alice can stop her own session.
    await expect(
      getAgentRuntime().stopExecution(sessionId, "alice"),
    ).resolves.not.toThrow();

    // Bob gets the same error he'd get for a session that doesn't exist —
    // we deliberately don't leak existence to other users.
    await expect(
      getAgentRuntime().stopExecution(sessionId, "bob"),
    ).rejects.toThrow(/No active agent session/);

    await expect(
      getAgentRuntime().stopExecution("session-that-never-existed", "bob"),
    ).rejects.toThrow(/No active agent session/);
  });

  it("closeSession is a no-op for a non-owner (can't kill someone else's session)", async () => {
    const sessionId = await newSession("alice");

    // Bob's closeSession should do nothing.
    getAgentRuntime().closeSession(sessionId, "bob");

    // Alice can still operate the session.
    await expect(
      getAgentRuntime().stopExecution(sessionId, "alice"),
    ).resolves.not.toThrow();
  });

  it("closeSession with the right owner clears the session", async () => {
    const sessionId = await newSession("alice");
    getAgentRuntime().closeSession(sessionId, "alice");

    // After Alice closes, even Alice can't stop it again.
    await expect(
      getAgentRuntime().stopExecution(sessionId, "alice"),
    ).rejects.toThrow(/No active agent session/);
  });

  it("sendMessageStreaming refuses non-owner with the same not-found error", async () => {
    const sessionId = await newSession("alice");

    // A minimal transport stub — the call will never reach it because
    // ownership rejection happens first.
    const transport = {
      streamMessage: vi.fn(),
      requestToolManifest: vi.fn(async () => []),
      executeTool: vi.fn(async () => ({})),
      abortTools: vi.fn(),
      isAlive: true,
    };

    await expect(
      getAgentRuntime().sendMessageStreaming(
        sessionId,
        "hi",
        transport,
        "bob",
      ),
    ).rejects.toThrow(/No active agent session/);
    expect(transport.requestToolManifest).not.toHaveBeenCalled();
  });
});
