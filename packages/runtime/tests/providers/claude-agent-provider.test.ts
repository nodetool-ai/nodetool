import { describe, it, expect, vi } from "vitest";
import {
  ClaudeAgentProvider,
  toolResultToMcpContent,
  type ClaudeQueryFn
} from "../../src/providers/claude-agent-provider.js";
import type {
  Message,
  MessageContent,
  ProviderSession,
  ProviderStreamItem
} from "../../src/providers/types.js";
import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";

describe("toolResultToMcpContent", () => {
  it("wraps a plain string in a text block", () => {
    expect(toolResultToMcpContent("hello")).toEqual([
      { type: "text", text: "hello" }
    ]);
  });

  it("returns image parts as MCP image blocks (data: URI)", () => {
    const result: MessageContent[] = [
      { type: "text", text: "Viewing the chart" },
      {
        type: "image_url",
        image: { uri: "data:image/png;base64,QUJD", mimeType: "image/png" }
      }
    ];
    expect(toolResultToMcpContent(result)).toEqual([
      { type: "text", text: "Viewing the chart" },
      { type: "image", data: "QUJD", mimeType: "image/png" }
    ]);
  });

  it("encodes raw base64 and Uint8Array image data", () => {
    expect(
      toolResultToMcpContent([
        { type: "image_url", image: { data: "QUJD", mimeType: "image/jpeg" } }
      ])
    ).toEqual([{ type: "image", data: "QUJD", mimeType: "image/jpeg" }]);

    const bytes = new Uint8Array([1, 2, 3]);
    expect(
      toolResultToMcpContent([
        { type: "image_url", image: { data: bytes, mimeType: "image/png" } }
      ])
    ).toEqual([
      { type: "image", data: Buffer.from(bytes).toString("base64"), mimeType: "image/png" }
    ]);
  });

  it("degrades a remote-URL image to a text reference", () => {
    expect(
      toolResultToMcpContent([
        { type: "image_url", image: { uri: "https://example.com/c.png" } }
      ])
    ).toEqual([{ type: "text", text: "[image at https://example.com/c.png]" }]);
  });
});

// ---------------------------------------------------------------------------
// Scripted SDKMessage builders (minimal shapes, cast to the SDK union)
// ---------------------------------------------------------------------------

const sysInit = (sessionId: string, model = "claude-haiku-4-5"): SDKMessage =>
  ({
    type: "system",
    subtype: "init",
    session_id: sessionId,
    model,
    uuid: "u-init"
  }) as unknown as SDKMessage;

const textDelta = (text: string): SDKMessage =>
  ({
    type: "stream_event",
    session_id: "s",
    parent_tool_use_id: null,
    uuid: "u-text",
    event: {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text }
    }
  }) as unknown as SDKMessage;

const thinkingDelta = (thinking: string): SDKMessage =>
  ({
    type: "stream_event",
    session_id: "s",
    parent_tool_use_id: null,
    uuid: "u-think",
    event: {
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking }
    }
  }) as unknown as SDKMessage;

const successResult = (
  usage: Record<string, number> = {
    input_tokens: 9,
    output_tokens: 5,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 100
  }
): SDKMessage =>
  ({
    type: "result",
    subtype: "success",
    is_error: false,
    result: "ping",
    usage,
    total_cost_usd: 0.001,
    modelUsage: {},
    permission_denials: [],
    num_turns: 1,
    duration_ms: 1,
    duration_api_ms: 1,
    stop_reason: "end_turn",
    session_id: "s",
    uuid: "u-result"
  }) as unknown as SDKMessage;

const errorResult = (subtype: string, errors: string[]): SDKMessage =>
  ({
    type: "result",
    subtype,
    is_error: true,
    errors,
    usage: {},
    total_cost_usd: 0,
    modelUsage: {},
    permission_denials: [],
    num_turns: 1,
    duration_ms: 1,
    duration_api_ms: 1,
    stop_reason: null,
    session_id: "s",
    uuid: "u-result"
  }) as unknown as SDKMessage;

/** The messages a successful single-turn invocation streams. */
const PING_SCRIPT: SDKMessage[] = [
  sysInit("sess-1"),
  thinkingDelta("hmm"),
  textDelta("ping"),
  successResult()
];

// ---------------------------------------------------------------------------
// Fake query: records each invocation and replays a scripted message stream.
// ---------------------------------------------------------------------------

interface QueryCall {
  prompt: string;
  options?: Options;
}

function fakeQuery(
  script: SDKMessage[] | (() => AsyncGenerator<SDKMessage>)
): { fn: ClaudeQueryFn; calls: QueryCall[] } {
  const calls: QueryCall[] = [];
  const fn: ClaudeQueryFn = (params) => {
    calls.push({ prompt: params.prompt, options: params.options });
    if (typeof script === "function") return script();
    return (async function* () {
      for (const m of script) yield m;
    })();
  };
  return { fn, calls };
}

async function collect(
  stream: AsyncGenerator<ProviderStreamItem>
): Promise<ProviderStreamItem[]> {
  const items: ProviderStreamItem[] = [];
  for await (const item of stream) items.push(item);
  return items;
}

type ChunkItem = Extract<ProviderStreamItem, { type: "chunk" }>;
type SessionItem = Extract<ProviderStreamItem, { type: "session" }>;

const chunksOf = (items: ProviderStreamItem[]): ChunkItem[] =>
  items.filter((i): i is ChunkItem => "type" in i && i.type === "chunk");
const sessionOf = (items: ProviderStreamItem[]): SessionItem | undefined =>
  items.find((i): i is SessionItem => "type" in i && i.type === "session");

const userMsg = (text: string): Message => ({ role: "user", content: text });
const asstMsg = (text: string): Message => ({
  role: "assistant",
  content: text
});
const sysMsg = (text: string): Message => ({ role: "system", content: text });

describe("ClaudeAgentProvider", () => {
  it("reports its provider id and leaks no container env", () => {
    const provider = new ClaudeAgentProvider();
    expect(provider.provider).toBe("claude_agent_sdk");
    expect(provider.getContainerEnv()).toEqual({});
  });

  it("needs no secret and supports tools (via the SDK agent loop)", async () => {
    expect(ClaudeAgentProvider.requiredSecrets()).toEqual([]);
    const provider = new ClaudeAgentProvider();
    await expect(provider.hasToolSupport()).resolves.toBe(true);
  });

  it("lists subscription model aliases", async () => {
    const models = await new ClaudeAgentProvider().getAvailableLanguageModels();
    expect(models.map((m) => m.id)).toEqual(["opus", "sonnet", "haiku"]);
    expect(models.every((m) => m.provider === "claude_agent_sdk")).toBe(true);
  });

  it("runs a tool-free, single-turn, settings-free query", async () => {
    const { fn, calls } = fakeQuery(PING_SCRIPT);
    const provider = new ClaudeAgentProvider({}, { queryFn: fn });
    await collect(
      provider.generateMessages({
        messages: [sysMsg("Be terse."), userMsg("hi")],
        model: "haiku"
      })
    );
    const opts = calls[0].options as Options;
    expect(calls[0].prompt).toBe("hi");
    expect(opts.systemPrompt).toBe("Be terse.");
    expect(opts.model).toBe("haiku");
    expect(opts.maxTurns).toBe(1);
    expect(opts.allowedTools).toEqual([]);
    expect(opts.settingSources).toEqual([]);
    expect(opts.permissionMode).toBe("bypassPermissions");
    expect(opts.allowDangerouslySkipPermissions).toBe(true);
    expect(opts.includePartialMessages).toBe(true);
    expect(opts.resume).toBeUndefined();
  });

  it("streams text and thinking as SEPARATE chunks, never merged", async () => {
    const { fn } = fakeQuery(PING_SCRIPT);
    const provider = new ClaudeAgentProvider({}, { queryFn: fn });
    const items = await collect(
      provider.generateMessages({ messages: [userMsg("hi")], model: "haiku" })
    );
    const chunks = chunksOf(items);
    const thinking = chunks.find((c) => c.thinking);
    const text = chunks.find((c) => !c.thinking && c.content === "ping");
    expect(thinking?.content).toBe("hmm");
    expect(text).toBeTruthy();
    // The thinking text never bleeds into the visible text chunk.
    expect(text?.content).toBe("ping");
    expect(chunks.at(-1)?.done).toBe(true);
  });

  it("falls back to final-message blocks when no partials stream", async () => {
    const finalAssistant = {
      type: "assistant",
      session_id: "s",
      parent_tool_use_id: null,
      uuid: "u-asst",
      message: {
        model: "claude-haiku-4-5",
        content: [
          { type: "thinking", thinking: "considering" },
          { type: "text", text: "answer" }
        ]
      }
    } as unknown as SDKMessage;
    const { fn } = fakeQuery([sysInit("sess-x"), finalAssistant, successResult()]);
    const provider = new ClaudeAgentProvider({}, { queryFn: fn });
    const chunks = chunksOf(
      await collect(
        provider.generateMessages({ messages: [userMsg("hi")], model: "haiku" })
      )
    );
    expect(chunks.find((c) => c.thinking)?.content).toBe("considering");
    expect(chunks.find((c) => !c.thinking && c.content === "answer")).toBeTruthy();
  });

  it("surfaces usage/cost via trackUsage from the result message", async () => {
    const { fn } = fakeQuery(PING_SCRIPT);
    const provider = new ClaudeAgentProvider({}, { queryFn: fn });
    const spy = vi.spyOn(provider, "trackUsage");
    await collect(
      provider.generateMessages({ messages: [userMsg("hi")], model: "haiku" })
    );
    expect(spy).toHaveBeenCalledWith(
      "claude-haiku-4-5",
      expect.objectContaining({
        // input(9) + cacheRead(0) + cacheWrite(100)
        inputTokens: 109,
        outputTokens: 5,
        cachedTokens: 0,
        cacheWriteTokens: 100
      })
    );
    expect(provider.getTotalCost()).toBeGreaterThanOrEqual(0);
  });

  it("assembles a plain assistant message via generateMessage", async () => {
    const { fn } = fakeQuery(PING_SCRIPT);
    const provider = new ClaudeAgentProvider({}, { queryFn: fn });
    const msg = await provider.generateMessage({
      messages: [userMsg("hi")],
      model: "haiku"
    });
    expect(msg.role).toBe("assistant");
    // Thinking ("hmm") is excluded from the assembled content.
    expect(msg.content).toBe("ping");
    expect(msg.toolCalls).toBeNull();
  });

  it("surfaces the result error subtype and detail (not a generic string)", async () => {
    const { fn } = fakeQuery([
      sysInit("sess-e"),
      errorResult("error_during_execution", ["model exploded"])
    ]);
    const provider = new ClaudeAgentProvider({}, { queryFn: fn });
    await expect(
      collect(
        provider.generateMessages({ messages: [userMsg("hi")], model: "haiku" })
      )
    ).rejects.toThrow(/error_during_execution.*model exploded/);
  });

  it("surfaces exceptions thrown by the query generator", async () => {
    const { fn } = fakeQuery(async function* () {
      yield sysInit("sess-t");
      throw new Error("auth failed");
    });
    const provider = new ClaudeAgentProvider({}, { queryFn: fn });
    await expect(
      collect(
        provider.generateMessages({ messages: [userMsg("hi")], model: "haiku" })
      )
    ).rejects.toThrow("auth failed");
  });

  it("cold start: fresh string prompt + session update at messages.length", async () => {
    const { fn, calls } = fakeQuery(PING_SCRIPT);
    const provider = new ClaudeAgentProvider({}, { queryFn: fn });
    const items = await collect(
      provider.generateMessages({
        messages: [sysMsg("Be terse."), userMsg("hi")],
        model: "haiku",
        threadId: "t1"
      })
    );
    expect(calls[0].prompt).toBe("hi");
    expect(calls[0].options?.resume).toBeUndefined();
    const session = sessionOf(items)?.session;
    expect(session).toMatchObject({
      providerId: "claude_agent_sdk",
      model: "haiku",
      token: "sess-1",
      checkpoint: 2 // [system, user]
    });
  });

  it("resume: sends ONLY the new user delta and passes the resume token", async () => {
    // Turn 1 (cold) captures the session token.
    const turn1 = fakeQuery([sysInit("sess-1"), textDelta("a"), successResult()]);
    const p1 = new ClaudeAgentProvider({}, { queryFn: turn1.fn });
    const items1 = await collect(
      p1.generateMessages({
        messages: [sysMsg("Be terse."), userMsg("first")],
        model: "haiku",
        threadId: "t1"
      })
    );
    const session = sessionOf(items1)!.session;

    // Turn 2 on a FRESH provider instance (no in-memory cache) — the durable
    // token is the only thing carrying continuity.
    const turn2 = fakeQuery([sysInit("sess-1"), textDelta("b"), successResult()]);
    const p2 = new ClaudeAgentProvider({}, { queryFn: turn2.fn });
    const messages2 = [
      sysMsg("Be terse."),
      userMsg("first"),
      asstMsg("a"),
      userMsg("second")
    ];
    const items2 = await collect(
      p2.generateMessages({
        messages: messages2,
        model: "haiku",
        threadId: "t1",
        providerSession: session
      })
    );
    // Only the new user turn is sent — not the prior history or assistant reply.
    expect(turn2.calls[0].prompt).toBe("second");
    expect(turn2.calls[0].prompt).not.toContain("first");
    expect(turn2.calls[0].prompt).not.toContain("a");
    expect(turn2.calls[0].options?.resume).toBe("sess-1");
    // The refreshed session advances the checkpoint to the full message count.
    expect(sessionOf(items2)?.session.checkpoint).toBe(messages2.length);
  });

  it("model change forces a FRESH primed prompt (no Human:/Assistant: blob)", async () => {
    const { fn, calls } = fakeQuery(PING_SCRIPT);
    const provider = new ClaudeAgentProvider({}, { queryFn: fn });
    const stale: ProviderSession = {
      providerId: "claude_agent_sdk",
      model: "haiku",
      token: "sess-old",
      checkpoint: 2
    };
    await collect(
      provider.generateMessages({
        messages: [
          sysMsg("Be terse."),
          userMsg("first"),
          asstMsg("answer-one"),
          userMsg("second")
        ],
        model: "sonnet", // different model → cannot resume
        threadId: "t1",
        providerSession: stale
      })
    );
    const prompt = calls[0].prompt;
    expect(calls[0].options?.resume).toBeUndefined();
    expect(prompt).toContain("<conversation_so_far>");
    expect(prompt).toContain("second");
    // Not the legacy transcript blob, and no thinking leaked into the context.
    expect(prompt).not.toMatch(/Human:/);
  });

  it("treats an out-of-range checkpoint as FRESH (edited/branched history)", async () => {
    const { fn, calls } = fakeQuery(PING_SCRIPT);
    const provider = new ClaudeAgentProvider({}, { queryFn: fn });
    const stale: ProviderSession = {
      providerId: "claude_agent_sdk",
      model: "haiku",
      token: "sess-old",
      checkpoint: 10 // > messages.length → branch/edit
    };
    await collect(
      provider.generateMessages({
        messages: [sysMsg("Be terse."), userMsg("first"), asstMsg("a"), userMsg("second")],
        model: "haiku",
        threadId: "t1",
        providerSession: stale
      })
    );
    expect(calls[0].options?.resume).toBeUndefined();
    expect(calls[0].prompt).toContain("<conversation_so_far>");
  });

  it("falls back to a fresh session when the resume query fails", async () => {
    let call = 0;
    const calls: QueryCall[] = [];
    const fn: ClaudeQueryFn = (params) => {
      calls.push({ prompt: params.prompt, options: params.options });
      call += 1;
      if (call === 1) {
        return (async function* () {
          // Session file gone — fail before any content streams.
          throw new Error("session not found");
          // eslint-disable-next-line no-unreachable
          yield sysInit("dead");
        })();
      }
      return (async function* () {
        yield sysInit("sess-new");
        yield textDelta("recovered");
        yield successResult();
      })();
    };
    const provider = new ClaudeAgentProvider({}, { queryFn: fn });
    const stale: ProviderSession = {
      providerId: "claude_agent_sdk",
      model: "haiku",
      token: "sess-old",
      checkpoint: 2
    };
    const items = await collect(
      provider.generateMessages({
        messages: [sysMsg("Be terse."), userMsg("first"), asstMsg("a"), userMsg("second")],
        model: "haiku",
        threadId: "t1",
        providerSession: stale
      })
    );
    expect(calls).toHaveLength(2);
    expect(calls[0].options?.resume).toBe("sess-old"); // resume attempt
    expect(calls[1].options?.resume).toBeUndefined(); // fresh fallback
    expect(chunksOf(items).find((c) => c.content === "recovered")).toBeTruthy();
    expect(sessionOf(items)?.session.token).toBe("sess-new");
  });

  it("does NOT load full history on a successful resume", async () => {
    const { fn, calls } = fakeQuery([
      sysInit("sess-1"),
      textDelta("ok"),
      successResult()
    ]);
    const provider = new ClaudeAgentProvider({}, { queryFn: fn });
    let loadCalled = 0;
    await collect(
      provider.generateMessages({
        messages: [sysMsg("Be terse."), userMsg("second")],
        model: "haiku",
        threadId: "t1",
        providerSession: {
          providerId: "claude_agent_sdk",
          model: "haiku",
          token: "sess-1",
          checkpoint: 1 // relative: only the trimmed delta is sent
        },
        loadFullHistory: async () => {
          loadCalled += 1;
          return [];
        }
      })
    );
    expect(calls[0].options?.resume).toBe("sess-1");
    expect(calls[0].prompt).toBe("second");
    expect(loadCalled).toBe(0); // the SDK already holds the history
  });

  it("primes from loadFullHistory when a trimmed resume fails", async () => {
    let call = 0;
    const calls: QueryCall[] = [];
    const fn: ClaudeQueryFn = (params) => {
      calls.push({ prompt: params.prompt, options: params.options });
      call += 1;
      if (call === 1) {
        return (async function* () {
          throw new Error("session not found");
        })();
      }
      return (async function* () {
        yield sysInit("sess-new");
        yield textDelta("recovered");
        yield successResult();
      })();
    };
    const provider = new ClaudeAgentProvider({}, { queryFn: fn });
    const full = [
      sysMsg("Be terse."),
      userMsg("first"),
      asstMsg("first-answer"),
      userMsg("second")
    ];
    let loadCalled = 0;
    const items = await collect(
      provider.generateMessages({
        // Only the delta is handed in; the full thread is behind the loader.
        messages: [sysMsg("Be terse."), userMsg("second")],
        model: "haiku",
        threadId: "t1",
        providerSession: {
          providerId: "claude_agent_sdk",
          model: "haiku",
          token: "sess-old",
          checkpoint: 1
        },
        loadFullHistory: async () => {
          loadCalled += 1;
          return full;
        }
      })
    );
    expect(calls).toHaveLength(2);
    expect(calls[0].options?.resume).toBe("sess-old");
    expect(calls[0].prompt).toBe("second"); // resume attempt sent the delta
    expect(loadCalled).toBe(1);
    // The fresh fallback primed from the FULL history, not just the delta.
    expect(calls[1].options?.resume).toBeUndefined();
    expect(calls[1].prompt).toContain("<conversation_so_far>");
    expect(calls[1].prompt).toContain("first");
    expect(chunksOf(items).find((c) => c.content === "recovered")).toBeTruthy();
  });

  it("primes from loadFullHistory when the system prompt changed", async () => {
    const { fn, calls } = fakeQuery([
      sysInit("sess-new"),
      textDelta("ok"),
      successResult()
    ]);
    const provider = new ClaudeAgentProvider({}, { queryFn: fn });
    const full = [
      sysMsg("Be terse."),
      userMsg("first"),
      asstMsg("first-answer"),
      userMsg("second")
    ];
    let loadCalled = 0;
    await collect(
      provider.generateMessages({
        messages: [sysMsg("Be terse."), userMsg("second")],
        model: "haiku",
        threadId: "t1",
        providerSession: {
          providerId: "claude_agent_sdk",
          model: "haiku",
          token: "sess-old",
          checkpoint: 1,
          systemHash: "stale-hash" // no longer matches → cannot resume
        },
        loadFullHistory: async () => {
          loadCalled += 1;
          return full;
        }
      })
    );
    // No resume attempt at all — straight to a fresh, fully-primed turn.
    expect(calls).toHaveLength(1);
    expect(calls[0].options?.resume).toBeUndefined();
    expect(loadCalled).toBe(1);
    expect(calls[0].prompt).toContain("first");
  });

  it("strips nested-session env vars from the SDK subprocess env", async () => {
    const prev = { ...process.env };
    process.env.CLAUDECODE = "1";
    process.env.CLAUDE_CODE_ENTRYPOINT = "cli";
    process.env.CLAUDE_SESSION_ID = "abc";
    process.env.ANTHROPIC_BASE_URL = "https://example.test";
    try {
      const { fn, calls } = fakeQuery(PING_SCRIPT);
      const provider = new ClaudeAgentProvider({}, { queryFn: fn });
      await collect(
        provider.generateMessages({ messages: [userMsg("hi")], model: "haiku" })
      );
      const env = calls[0].options?.env as Record<string, string>;
      expect(env.CLAUDECODE).toBeUndefined();
      expect(env.CLAUDE_CODE_ENTRYPOINT).toBeUndefined();
      expect(env.CLAUDE_SESSION_ID).toBeUndefined();
      // API routing is preserved.
      expect(env.ANTHROPIC_BASE_URL).toBe("https://example.test");
    } finally {
      process.env = prev;
    }
  });

  // -------------------------------------------------------------------------
  // generateLoop (agent loop) + tool calling
  // -------------------------------------------------------------------------

  const assistantTextMsg = (text: string): SDKMessage =>
    ({
      type: "assistant",
      session_id: "s",
      parent_tool_use_id: null,
      uuid: "u-asst",
      message: { model: "claude-haiku-4-5", content: [{ type: "text", text }] }
    }) as unknown as SDKMessage;

  const assistantToolUse = (
    id: string,
    name: string,
    input: Record<string, unknown>
  ): SDKMessage =>
    ({
      type: "assistant",
      session_id: "s",
      parent_tool_use_id: null,
      uuid: "u-asst-tool",
      message: {
        model: "claude-haiku-4-5",
        content: [{ type: "tool_use", id, name, input }]
      }
    }) as unknown as SDKMessage;

  const userToolResult = (toolUseId: string, text: string): SDKMessage =>
    ({
      type: "user",
      session_id: "s",
      parent_tool_use_id: null,
      uuid: "u-user",
      message: {
        content: [{ type: "tool_result", tool_use_id: toolUseId, content: text }]
      }
    }) as unknown as SDKMessage;

  type MsgItem = Extract<ProviderStreamItem, { type: "message" }>;
  const messagesOf = (items: ProviderStreamItem[]): MsgItem["message"][] =>
    items
      .filter((i): i is MsgItem => "type" in i && i.type === "message")
      .map((i) => i.message);

  function fakeCreateMcpServer() {
    const captured: { defs: Array<{ handler: (a: unknown) => Promise<unknown> }> } =
      { defs: [] };
    const fn = ((opts: { name: string; tools: typeof captured.defs }) => {
      captured.defs = opts.tools;
      return { type: "sdk", name: opts.name, instance: {} };
    }) as unknown as ConstructorParameters<
      typeof ClaudeAgentProvider
    >[1]["createMcpServerFn"];
    return { fn, captured };
  }

  it("generateLoop without tools emits one assistant message + live chunks", async () => {
    const { fn, calls } = fakeQuery([
      sysInit("sess-loop"),
      textDelta("hello"),
      assistantTextMsg("hello"),
      successResult()
    ]);
    const provider = new ClaudeAgentProvider({}, { queryFn: fn });
    const items = await collect(
      provider.generateLoop({
        messages: [sysMsg("Be terse."), userMsg("hi")],
        model: "haiku",
        threadId: "t1"
      })
    );
    expect((calls[0].options as Options).maxTurns).toBe(1);
    expect((calls[0].options as Options).mcpServers).toBeUndefined();
    const msgs = messagesOf(items);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ role: "assistant", content: "hello" });
    // Live text still streams as a chunk.
    expect(chunksOf(items).find((c) => c.content === "hello")).toBeTruthy();
  });

  it("generateLoop runs tools through the SDK loop, bridging to executeTool", async () => {
    const { fn, calls } = fakeQuery([
      sysInit("sess-tool"),
      assistantToolUse("tu_1", "mcp__nodetool_tools__echo", { text: "hi" }),
      userToolResult("tu_1", "echoed: hi"),
      assistantTextMsg("all done"),
      successResult()
    ]);
    const mcp = fakeCreateMcpServer();
    const provider = new ClaudeAgentProvider(
      {},
      { queryFn: fn, createMcpServerFn: mcp.fn }
    );
    const executed: ToolCall[] = [];
    const executeTool = async (tc: ToolCall): Promise<string> => {
      executed.push(tc);
      return `result-for-${tc.name}`;
    };
    const items = await collect(
      provider.generateLoop({
        messages: [sysMsg("Be terse."), userMsg("echo hi")],
        model: "haiku",
        threadId: "t1",
        tools: [
          {
            name: "echo",
            description: "Echo the input",
            inputSchema: {
              type: "object",
              properties: { text: { type: "string" } },
              required: ["text"]
            }
          }
        ],
        executeTool
      })
    );

    // Tools were registered with the SDK and the loop was allowed to iterate.
    const opts = calls[0].options as Options;
    expect(opts.allowedTools).toContain("mcp__nodetool_tools__echo");
    expect(opts.maxTurns).toBeGreaterThan(1);
    expect(opts.mcpServers).toBeTruthy();

    // The tool_use surfaced as a ToolCall (name stripped of the MCP prefix).
    const toolCallItems = items.filter(
      (i): i is ToolCall => "name" in i && "id" in i && !("type" in i)
    );
    expect(toolCallItems[0]).toMatchObject({
      id: "tu_1",
      name: "echo",
      args: { text: "hi" }
    });

    // Persistable messages: assistant(with tool calls), tool result, final text.
    const msgs = messagesOf(items);
    const asstWithCalls = msgs.find(
      (m) => m.role === "assistant" && m.toolCalls?.length
    );
    expect(asstWithCalls?.toolCalls?.[0]).toMatchObject({ name: "echo" });
    const toolMsg = msgs.find((m) => m.role === "tool");
    expect(toolMsg).toMatchObject({ toolCallId: "tu_1", content: "echoed: hi" });
    expect(msgs.filter((m) => m.role === "assistant").at(-1)?.content).toBe(
      "all done"
    );

    // The MCP handler bridges to executeTool and wraps the result for the SDK.
    const handlerResult = await mcp.captured.defs[0].handler({ text: "hi" });
    expect(handlerResult).toEqual({
      content: [{ type: "text", text: "result-for-echo" }]
    });
    expect(executed[0]).toMatchObject({ name: "echo", args: { text: "hi" } });
  });

  it("preserves keys of a free-form object param (no z.object({}) stripping)", async () => {
    // Regression: a tool param declared as a free-form object (e.g. add_node's
    // `node_properties`) was converted to z.object({}), which strips every
    // nested key — silently dropping all node configuration on the SDK bridge.
    const { fn } = fakeQuery([sysInit("sess-ff"), assistantTextMsg("ok"), successResult()]);
    const mcp = fakeCreateMcpServer();
    const provider = new ClaudeAgentProvider(
      {},
      { queryFn: fn, createMcpServerFn: mcp.fn }
    );
    await collect(
      provider.generateLoop({
        messages: [sysMsg("x"), userMsg("y")],
        model: "haiku",
        tools: [
          {
            name: "add_node",
            description: "add",
            inputSchema: {
              type: "object",
              properties: { node_properties: { type: "object" } },
              required: []
            }
          }
        ],
        executeTool: async () => "ok"
      })
    );
    const shape = (mcp.captured.defs[0] as unknown as {
      inputSchema: Record<string, { parse: (v: unknown) => unknown }>;
    }).inputSchema;
    const parsed = shape.node_properties.parse({ prompt: "a red fox", bits: 2 });
    expect(parsed).toEqual({ prompt: "a red fox", bits: 2 });
  });

  it("cancels the query when the abort signal fires", async () => {
    const calls: QueryCall[] = [];
    const fn: ClaudeQueryFn = (params) => {
      calls.push({ prompt: params.prompt, options: params.options });
      const ac = params.options?.abortController;
      return (async function* () {
        yield sysInit("sess-abort");
        // Idle until cancelled, then stop — simulating the SDK honoring abort.
        while (!ac?.signal.aborted) {
          await new Promise((r) => setTimeout(r, 5));
        }
      })();
    };
    const provider = new ClaudeAgentProvider({}, { queryFn: fn });
    const controller = new AbortController();
    const run = collect(
      provider.generateMessages({
        messages: [userMsg("hi")],
        model: "haiku",
        signal: controller.signal
      })
    );
    controller.abort();
    await run;
    expect(calls[0].options?.abortController?.signal.aborted).toBe(true);
  });
});
