/**
 * LlmAgentSdkProvider / LlmAgentSession — branch coverage beyond the
 * persistence happy-paths in llm-agent.test.ts.
 *
 * Focus:
 *   - createSession guards (missing chatProviderId / userId)
 *   - send() guards (closed, no transport, in-flight) and the error path
 *   - streaming callbacks (onChunk buffering + uuid, onToolCall reset)
 *   - the in-process tools passed to processChat: UiBridgeTool (success +
 *     failure) and GraphPlannerUiTool (invalid objective, unconfigured
 *     registry, and a full plan-and-apply run against a mocked GraphPlanner)
 *   - listModels aggregation + tool-support filtering
 *   - resume hydration of array-content / tool-call rows
 *   - listSessions summary fallback for non-string content
 *
 * processChat and the runtime provider layer are mocked so no network, DB
 * provider, or embedding work happens.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { initTestDb, Thread, Message } from "@nodetool-ai/models";

// ── Mocks ─────────────────────────────────────────────────────────────

const { processChatSpy, graphPlannerCtl } = vi.hoisted(() => ({
  // Default: append a user + assistant turn, like message-processor.ts.
  processChatSpy: vi.fn(
    async (opts: { messages: any[]; userInput: string }) => {
      opts.messages.push({ role: "user", content: opts.userInput });
      opts.messages.push({ role: "assistant", content: "ok" });
      return opts.messages;
    },
  ),
  graphPlannerCtl: {
    // Async-generator plan() body, reconfigurable per-test.
    plan: undefined as unknown as (
      objective: string,
      ctx: unknown,
    ) => AsyncGenerator<unknown, unknown, unknown>,
  },
}));

vi.mock("@nodetool-ai/chat", () => ({
  processChat: processChatSpy,
}));

vi.mock("../src/agent/pi-agent.js", () => ({
  PiQuerySession: class {},
  listPiModels: async () => [],
  listPiSessions: async () => [],
  getPiSessionMessages: async () => [],
}));

// Keep the real Tool base and everything else; swap GraphPlanner for a
// controllable stub and neutralize long-term memory.
vi.mock("@nodetool-ai/agents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nodetool-ai/agents")>();
  return {
    ...actual,
    createDefaultLongTermMemory: vi.fn(async () => null),
    GraphPlanner: class {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(public opts: any) {}
      plan(objective: string, ctx: unknown) {
        return graphPlannerCtl.plan(objective, ctx);
      }
    },
  };
});

const { runtimeMocks } = vi.hoisted(() => ({
  runtimeMocks: {
    getProvider: vi.fn(),
    isProviderConfigured: vi.fn(),
    listRegisteredProviderIds: vi.fn(),
  },
}));

vi.mock("@nodetool-ai/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nodetool-ai/runtime")>();
  return {
    ...actual,
    getProvider: runtimeMocks.getProvider,
    isProviderConfigured: runtimeMocks.isProviderConfigured,
    listRegisteredProviderIds: runtimeMocks.listRegisteredProviderIds,
  };
});

import {
  LlmAgentSdkProvider,
  setLlmAgentGraphPlannerRegistry,
} from "../src/agent/llm-agent.js";

// ── Helpers ───────────────────────────────────────────────────────────

const fakeProvider = {
  provider: "anthropic",
  hasToolSupport: vi.fn(async () => true),
  getAvailableLanguageModels: vi.fn(async () => []),
};

const makeTransport = (
  overrides: Partial<{ executeTool: (...a: unknown[]) => Promise<unknown> }> = {},
) => ({
  id: "r1",
  streamMessage: vi.fn(),
  requestToolManifest: vi.fn(async () => []),
  executeTool: vi.fn(overrides.executeTool ?? (async () => ({ ok: true }))),
  abortTools: vi.fn(),
  isAlive: true,
});

const uiManifestEntry = {
  name: "ui_search_nodes",
  description: "search",
  parameters: { type: "object", properties: {} },
};

const newSession = (opts: Record<string, unknown> = {}) =>
  new LlmAgentSdkProvider().createSession({
    model: "claude-sonnet-4-6",
    workspacePath: "",
    userId: "alice",
    chatProviderId: "anthropic",
    ...opts,
  });

beforeEach(() => {
  initTestDb();
  processChatSpy.mockClear();
  runtimeMocks.getProvider.mockReset();
  runtimeMocks.getProvider.mockResolvedValue(fakeProvider);
  runtimeMocks.isProviderConfigured.mockReset();
  runtimeMocks.isProviderConfigured.mockResolvedValue(true);
  runtimeMocks.listRegisteredProviderIds.mockReset();
  runtimeMocks.listRegisteredProviderIds.mockReturnValue(["anthropic"]);
  fakeProvider.hasToolSupport.mockClear();
  fakeProvider.getAvailableLanguageModels.mockReset();
  fakeProvider.getAvailableLanguageModels.mockResolvedValue([]);
});

// ── createSession guards ───────────────────────────────────────────────

describe("LlmAgentSdkProvider.createSession", () => {
  it("throws without a chatProviderId", () => {
    expect(() =>
      new LlmAgentSdkProvider().createSession({
        model: "m",
        workspacePath: "",
        userId: "alice",
      }),
    ).toThrow(/requires `chatProviderId`/);
  });

  it("throws without a userId", () => {
    expect(() =>
      new LlmAgentSdkProvider().createSession({
        model: "m",
        workspacePath: "",
        userId: "",
        chatProviderId: "anthropic",
      }),
    ).toThrow(/authenticated userId/);
  });
});

// ── send() guards + error path ─────────────────────────────────────────

describe("LlmAgentSession.send guards", () => {
  it("rejects when no transport is supplied", async () => {
    const session = newSession();
    await expect(
      session.send("hi", null as never, "sid", []),
    ).rejects.toThrow(/requires an active transport/);
  });

  it("rejects after the session is closed", async () => {
    const session = newSession();
    session.close();
    await expect(
      session.send("hi", makeTransport() as never, "sid", []),
    ).rejects.toThrow(/closed session/);
  });

  it("rejects a second concurrent send while one is in flight", async () => {
    let release: () => void = () => {};
    processChatSpy.mockImplementationOnce(
      () => new Promise<any>((r) => (release = () => r([]))),
    );
    const session = newSession();
    const transport = makeTransport();
    const first = session.send("one", transport as never, "sid", []);
    await new Promise((r) => setTimeout(r, 0));
    await expect(
      session.send("two", transport as never, "sid", []),
    ).rejects.toThrow(/already in progress/);
    release();
    await first;
  });

  it("emits an error result (does not throw) when processChat fails", async () => {
    processChatSpy.mockImplementationOnce(async () => {
      throw new Error("model exploded");
    });
    const session = newSession();
    const out = await session.send("hi", makeTransport() as never, "sid", []);
    const errors = out.filter((m) => m.is_error === true);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].errors?.[0]).toMatch(/model exploded/);
  });
});

// ── streaming callbacks ────────────────────────────────────────────────

describe("LlmAgentSession streaming callbacks", () => {
  it("buffers onChunk under a stable uuid and resets on tool calls", async () => {
    processChatSpy.mockImplementationOnce(
      async (opts: {
        messages: any[];
        userInput: string;
        callbacks: {
          onChunk: (t: string) => void;
          onToolCall: (c: { id: string; name: string; args: unknown }) => void;
        };
      }) => {
        opts.callbacks.onChunk("Hel");
        opts.callbacks.onChunk("lo");
        opts.callbacks.onToolCall({
          id: "tc1",
          name: "ui_search_nodes",
          args: { q: "x" },
        });
        opts.callbacks.onChunk("after");
        opts.messages.push({ role: "assistant", content: "Helloafter" });
        return opts.messages;
      },
    );

    const emitted: any[] = [];
    const session = newSession();
    await session.send(
      "hi",
      makeTransport() as never,
      "sid",
      [],
      (m) => emitted.push(m),
    );

    const assistantText = emitted.filter(
      (m) => m.type === "assistant" && m.text !== undefined,
    );
    // Two chunks share one uuid and the second carries the accumulated buffer.
    expect(assistantText[0].text).toBe("Hel");
    expect(assistantText[1].text).toBe("Hello");
    expect(assistantText[0].uuid).toBe(assistantText[1].uuid);
    // The chunk after the tool call starts a fresh bubble.
    expect(assistantText[2].text).toBe("after");
    expect(assistantText[2].uuid).not.toBe(assistantText[0].uuid);

    // The tool call is emitted as an assistant message keyed by the call id.
    const toolMsg = emitted.find((m) => m.tool_calls);
    expect(toolMsg.uuid).toBe("tc1");
    expect(toolMsg.tool_calls[0].function.name).toBe("ui_search_nodes");
    expect(toolMsg.tool_calls[0].function.arguments).toBe(
      JSON.stringify({ q: "x" }),
    );

    // A final success result terminates the run.
    const result = emitted.find((m) => m.type === "result");
    expect(result.is_error).toBe(false);
  });
});

// ── UiBridgeTool (captured from processChat) ───────────────────────────

describe("UiBridgeTool via processChat tools", () => {
  it("proxies a manifest tool to transport.executeTool", async () => {
    let captured: any[] = [];
    processChatSpy.mockImplementationOnce(async (opts: { tools: any[] }) => {
      captured = opts.tools;
      return [];
    });
    const transport = makeTransport();
    const session = newSession();
    await session.send("hi", transport as never, "sid", [uiManifestEntry]);

    const bridge = captured.find((t) => t.name === "ui_search_nodes");
    expect(bridge).toBeDefined();
    const res = await bridge.process({}, { q: "hello" });
    expect(res).toEqual({ ok: true });
    expect(transport.executeTool).toHaveBeenCalledWith(
      "sid",
      expect.any(String),
      "ui_search_nodes",
      { q: "hello" },
    );
  });

  it("returns an error object (never throws) when the tool fails", async () => {
    let captured: any[] = [];
    processChatSpy.mockImplementationOnce(async (opts: { tools: any[] }) => {
      captured = opts.tools;
      return [];
    });
    const transport = makeTransport({
      executeTool: async () => {
        throw new Error("renderer refused");
      },
    });
    const session = newSession();
    await session.send("hi", transport as never, "sid", [uiManifestEntry]);

    const bridge = captured.find((t) => t.name === "ui_search_nodes");
    // A huge arg forces the >500 char truncation branch in the catch handler.
    const res = await bridge.process({}, { big: "x".repeat(1000) });
    expect(res).toEqual({ isError: true, error: "renderer refused" });
  });

  it("falls back to an empty object schema when the manifest omits parameters", async () => {
    let captured: any[] = [];
    processChatSpy.mockImplementationOnce(async (opts: { tools: any[] }) => {
      captured = opts.tools;
      return [];
    });
    const session = newSession();
    await session.send("hi", makeTransport() as never, "sid", [
      { name: "ui_copy", description: "copy" } as never,
    ]);
    const bridge = captured.find((t) => t.name === "ui_copy");
    expect(bridge.inputSchema).toEqual({
      type: "object",
      properties: {},
    });
  });
});

// ── GraphPlannerUiTool ─────────────────────────────────────────────────

async function captureGraphPlanner(): Promise<any> {
  let captured: any[] = [];
  processChatSpy.mockImplementationOnce(async (opts: { tools: any[] }) => {
    captured = opts.tools;
    return [];
  });
  const session = newSession();
  await session.send("hi", makeTransport() as never, "sid", []);
  return captured.find((t) => t.name === "plan_workflow_graph");
}

describe("GraphPlannerUiTool", () => {
  it("rejects a blank objective", async () => {
    const tool = await captureGraphPlanner();
    expect(await tool.process({}, { objective: "   " })).toEqual({
      isError: true,
      error: "objective must be a non-empty string",
    });
  });

  it("errors when the graph-planner registry is not configured", async () => {
    // Registry is a module singleton; this test runs before we set it.
    const tool = await captureGraphPlanner();
    const res = await tool.process({}, { objective: "make a workflow" });
    expect(res).toMatchObject({ isError: true });
    expect((res as { error: string }).error).toMatch(/registry is not configured/);
  });

  it("plans a graph and applies it to the canvas", async () => {
    setLlmAgentGraphPlannerRegistry({} as never);
    graphPlannerCtl.plan = async function* () {
      yield { type: "planning_update", phase: "start" };
      yield { type: "planning_update", phase: "complete" }; // deferred
      return {
        nodes: [
          { id: "n1", type: "nodetool.text.Concat", name: "n1", properties: {} },
          { id: "n2", type: "nodetool.image.Blur", name: "Blur", properties: {} },
        ],
        edges: [
          {
            source: "n1",
            target: "n2",
            sourceHandle: "output",
            targetHandle: "image",
          },
        ],
      };
    };

    const transport = makeTransport();
    let captured: any[] = [];
    processChatSpy.mockImplementationOnce(async (opts: { tools: any[] }) => {
      captured = opts.tools;
      return [];
    });
    const session = newSession();
    await session.send("hi", transport as never, "sid", []);
    const tool = captured.find((t) => t.name === "plan_workflow_graph");

    const res = (await tool.process({}, {
      objective: "build it",
      apply_to_canvas: true,
    })) as Record<string, unknown>;

    expect(res.status).toBe("graph_planned");
    expect(res.nodes).toBe(2);
    expect(res.edges).toBe(1);
    expect(res.applied_to_canvas).toBe(true);
    // The graph was pushed to the canvas via the ui_graph bulk tool.
    expect(transport.executeTool).toHaveBeenCalledWith(
      "sid",
      expect.any(String),
      "ui_graph",
      expect.objectContaining({ nodes: expect.any(Array) }),
    );
  });

  it("reports an apply failure without throwing", async () => {
    setLlmAgentGraphPlannerRegistry({} as never);
    graphPlannerCtl.plan = async function* () {
      yield { type: "planning_update", phase: "start" };
      return { nodes: [{ id: "n1", type: "t", name: "n1", properties: {} }], edges: [] };
    };
    const transport = makeTransport({
      executeTool: async () => {
        throw new Error("canvas offline");
      },
    });
    let captured: any[] = [];
    processChatSpy.mockImplementationOnce(async (opts: { tools: any[] }) => {
      captured = opts.tools;
      return [];
    });
    const session = newSession();
    await session.send("hi", transport as never, "sid", []);
    const tool = captured.find((t) => t.name === "plan_workflow_graph");

    const res = (await tool.process({}, { objective: "x" })) as Record<
      string,
      unknown
    >;
    expect(res.applied_to_canvas).toBe(false);
    expect(res.apply_error).toMatch(/canvas offline/);
  });

  it("returns an error when the planner yields no graph", async () => {
    setLlmAgentGraphPlannerRegistry({} as never);
    graphPlannerCtl.plan = async function* () {
      yield { type: "planning_update", phase: "complete" };
      return undefined;
    };
    let captured: any[] = [];
    processChatSpy.mockImplementationOnce(async (opts: { tools: any[] }) => {
      captured = opts.tools;
      return [];
    });
    const session = newSession();
    await session.send("hi", makeTransport() as never, "sid", []);
    const tool = captured.find((t) => t.name === "plan_workflow_graph");
    const res = (await tool.process({}, {
      objective: "x",
      apply_to_canvas: false,
    })) as Record<string, unknown>;
    expect(res).toMatchObject({ isError: true });
    expect((res as { error: string }).error).toMatch(/failed to build a graph/);
  });

  it("userMessage summarizes the objective", async () => {
    const tool = await captureGraphPlanner();
    expect(tool.userMessage({ objective: "build me a thing" })).toMatch(
      /Planning workflow graph: build me a thing/,
    );
    expect(tool.userMessage({})).toMatch(/Planning workflow graph: workflow/);
  });
});

// ── listModels aggregation ─────────────────────────────────────────────

describe("LlmAgentSdkProvider.listModels", () => {
  it("throws without a userId", async () => {
    await expect(
      new LlmAgentSdkProvider().listModels(""),
    ).rejects.toThrow(/authenticated userId/);
  });

  it("aggregates tool-capable models, filters unsupported, and marks a default", async () => {
    runtimeMocks.listRegisteredProviderIds.mockReturnValue([
      "anthropic",
      "openai",
    ]);
    fakeProvider.getAvailableLanguageModels.mockImplementation(async () => [
      { id: "m-good", name: "Good" },
      { id: "m-bad", name: "Bad" },
    ]);
    fakeProvider.hasToolSupport.mockImplementation(async (id: string) =>
      id !== "m-bad",
    );

    const models = await new LlmAgentSdkProvider().listModels("alice");
    // Two providers × one tool-capable model each.
    expect(models).toHaveLength(2);
    expect(models.every((m) => m.id === "m-good")).toBe(true);
    expect(models[0].isDefault).toBe(true);
    expect(models[0].provider).toBe("llm");
    expect(models[0].chatProviderId).toBeDefined();
  });

  it("skips providers that are not configured", async () => {
    runtimeMocks.isProviderConfigured.mockResolvedValue(false);
    const models = await new LlmAgentSdkProvider().listModels("alice");
    expect(models).toEqual([]);
  });
});

// ── resume hydration of rich rows ──────────────────────────────────────

describe("LlmAgentSession resume hydration", () => {
  it("rehydrates array-content and tool-call rows on resume", async () => {
    const thread = await Thread.create({ user_id: "alice", title: "" });
    await Message.create({
      thread_id: thread.id,
      user_id: "alice",
      role: "user",
      content: [{ type: "text", text: "hello" }],
      agent_execution_id: "llm-agent",
    });
    await Message.create({
      thread_id: thread.id,
      user_id: "alice",
      role: "assistant",
      content: "sure",
      tool_calls: [
        { id: "t1", type: "function", function: { name: "f", arguments: "{}" } },
      ],
      tool_call_id: "t1",
      agent_execution_id: "llm-agent",
    });

    let lengthOnEntry = -1;
    let toolCallsPreserved = false;
    processChatSpy.mockImplementationOnce(
      async (opts: { messages: any[]; userInput: string }) => {
        lengthOnEntry = opts.messages.length;
        toolCallsPreserved = Array.isArray(opts.messages[1]?.toolCalls);
        opts.messages.push({ role: "user", content: opts.userInput });
        return opts.messages;
      },
    );

    const session = newSession({ resumeSessionId: thread.id });
    await session.send("next", makeTransport() as never, "sid", []);
    expect(lengthOnEntry).toBe(2);
    expect(toolCallsPreserved).toBe(true);
  });
});

// ── listSessions summary fallback ──────────────────────────────────────

describe("LlmAgentSdkProvider.listSessions summary", () => {
  it("falls back to the thread title when the first message content is not a string", async () => {
    const thread = await Thread.create({ user_id: "alice", title: "My Title" });
    await Message.create({
      thread_id: thread.id,
      user_id: "alice",
      role: "user",
      content: [{ type: "text", text: "block content" }],
      agent_execution_id: "llm-agent",
    });

    const list = await new LlmAgentSdkProvider().listSessions({}, "alice");
    expect(list).toHaveLength(1);
    expect(list[0].summary).toBe("My Title");
    // Non-string content ⇒ firstPrompt is left undefined.
    expect(list[0].firstPrompt).toBeUndefined();
  });
});

// ── getSessionMessages array-content extraction ────────────────────────

describe("LlmAgentSdkProvider.getSessionMessages array content", () => {
  it("joins text blocks from array content", async () => {
    const thread = await Thread.create({ user_id: "alice", title: "" });
    await Message.create({
      thread_id: thread.id,
      user_id: "alice",
      role: "assistant",
      content: [
        { type: "text", text: "line one" },
        { type: "image", url: "ignored" },
        { type: "text", text: "line two" },
      ],
      agent_execution_id: "llm-agent",
    });

    const msgs = await new LlmAgentSdkProvider().getSessionMessages(
      { sessionId: thread.id },
      "alice",
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0].text).toBe("line one\nline two");
  });
});
