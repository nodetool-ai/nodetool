import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
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
import type { Options, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { generateStructured } from "../../src/providers/structured-output.js";
import { ProcessingContext } from "../../src/context.js";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";

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

  it("reports a remote-URL image that cannot be shown", () => {
    expect(
      toolResultToMcpContent([
        { type: "image_url", image: { uri: "https://example.com/c.png" } }
      ])
    ).toEqual([
      {
        type: "text",
        text: "[image could not be shown: https://example.com/c.png]"
      }
    ]);
  });

  it("reports an image result with no usable payload", () => {
    expect(toolResultToMcpContent([{ type: "image_url", image: {} }])).toEqual([
      { type: "text", text: "[image could not be shown]" }
    ]);
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
  prompt: Parameters<ClaudeQueryFn>[0]["prompt"];
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

async function structuredPrompt(call: QueryCall): Promise<SDKUserMessage[]> {
  if (typeof call.prompt === "string") throw new Error("Expected a structured SDK image prompt");
  const messages = [];
  for await (const message of call.prompt) messages.push(message);
  return messages;
}
const imageMsg = (label: string, image: Extract<MessageContent, {type: "image_url"}>["image"]): Message => ({role: "user", content: [{type: "text", text: label}, {type: "image_url", image}]});

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
    expect(models.map((m) => m.id)).toEqual([
      "fable",
      "opus",
      "sonnet",
      "haiku"
    ]);
    expect(models.every((m) => m.provider === "claude_agent_sdk")).toBe(true);
  });

  it("passes actual image blocks to the SDK instead of dropping review pixels", async () => {
    let received: unknown;
    const queryFn: ClaudeQueryFn = ({prompt}) => (async function* () {
      if (typeof prompt === "string") received = prompt;
      else {
        const messages = [];
        for await (const message of prompt) messages.push(message);
        received = messages;
      }
      for (const message of PING_SCRIPT) yield message;
    })();
    const provider = new ClaudeAgentProvider({}, {queryFn});
    await collect(provider.generateLoop({model: "sonnet", messages: [{role: "user", content: [
      {type: "text", text: "Review this actual frame"},
      {type: "image_url", image: {uri: "data:image/png;base64,QUJD"}},
      {type: "text", text: "Keep its source exact"}
    ]}]}));
    expect(received).toEqual([{type: "user", parent_tool_use_id: null, message: {role: "user", content: [
      {type: "text", text: "Review this actual frame"},
      {type: "image", source: {type: "base64", media_type: "image/png", data: "QUJD"}},
      {type: "text", text: "Keep its source exact"}
    ]}}]);
  });

  it("forwards raw bytes and base64 images through the tool-using SDK loop", async () => {
    const {fn, calls} = fakeQuery(PING_SCRIPT);
    const provider = new ClaudeAgentProvider({}, {queryFn: fn, createMcpServerFn: fakeCreateMcpServer().fn});
    await collect(provider.generateLoop({model: "sonnet", messages: [{role: "user", content: [
      {type: "text", text: "Product"},
      {type: "image_url", image: {data: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg"}},
      {type: "text", text: "Logo"},
      {type: "image_url", image: {data: "QUJD", mimeType: "image/webp"}}
    ]}], tools: [{name: "review_cut", description: "Review", inputSchema: {type: "object"}}], executeTool: async () => "ok"}));
    expect((await structuredPrompt(calls[0]))[0].message.content).toEqual([
      {type: "text", text: "Product"}, {type: "image", source: {type: "base64", media_type: "image/jpeg", data: "AQID"}},
      {type: "text", text: "Logo"}, {type: "image", source: {type: "base64", media_type: "image/webp", data: "QUJD"}}
    ]);
    expect(calls[0].options?.mcpServers).toBeDefined();
  });

  it("resumes with only new user image blocks and retains the session token", async () => {
    const {fn, calls} = fakeQuery(PING_SCRIPT);
    const provider = new ClaudeAgentProvider({}, {queryFn: fn});
    const messages = [userMsg("first"), asstMsg("prior answer"), imageMsg("New candidate", {uri: "data:image/png;base64,QUJD"})];
    await collect(provider.generateMessages({model: "sonnet", messages, providerSession: {providerId: "claude_agent_sdk", model: "sonnet", token: "sess-old", checkpoint: 2}}));
    expect(calls[0].options?.resume).toBe("sess-old");
    const content = (await structuredPrompt(calls[0]))[0].message.content;
    expect(content).toEqual([{type: "text", text: "New candidate"}, {type: "image", source: {type: "base64", media_type: "image/png", data: "QUJD"}}]);
  });

  it("keeps cold-history image labels and pixels inside the primed conversation", async () => {
    const {fn, calls} = fakeQuery(PING_SCRIPT);
    const provider = new ClaudeAgentProvider({}, {queryFn: fn});
    await collect(provider.generateMessages({model: "sonnet", messages: [imageMsg("Original reference", {uri: "data:image/png;base64,QUJD"}), asstMsg("Prior findings"), userMsg("Review again")]}));
    const content = (await structuredPrompt(calls[0]))[0].message.content;
    expect(content).toEqual([
      {type: "text", text: "<conversation_so_far>\n"},
      {type: "text", text: "User: "}, {type: "text", text: "Original reference"},
      {type: "image", source: {type: "base64", media_type: "image/png", data: "QUJD"}},
      {type: "text", text: "\n\n"},
      {type: "text", text: "Assistant: "}, {type: "text", text: "Prior findings"}, {type: "text", text: "\n\n"},
      {type: "text", text: "</conversation_so_far>\n\n"}, {type: "text", text: "Review again"}
    ]);
  });

  it.each([
    {uri: "http://127.0.0.1/private.png"}, {uri: "file:///etc/passwd"}, {uri: "asset://unresolved"}, {},
    {data: "QUJD", mimeType: "image/svg+xml"}
  ])("rejects unresolved or unsupported image input before SDK dispatch: %j", async image => {
    const {fn, calls} = fakeQuery(PING_SCRIPT);
    const provider = new ClaudeAgentProvider({}, {queryFn: fn});
    await expect(collect(provider.generateMessages({model: "sonnet", messages: [imageMsg("Inspect", image)]}))).rejects.toThrow(/inline image data|do not support/);
    expect(calls).toHaveLength(0);
  });

  it.each([
    {thinking: {type: "adaptive"} as const, expected: {type: "adaptive"}},
    {thinking: {type: "manual", budgetTokens: 2048} as const, expected: {type: "enabled", budgetTokens: 2048}},
    {thinking: {type: "disabled"} as const, expected: {type: "disabled"}}
  ])("honors caller reasoning controls: $thinking.type", async ({thinking, expected}) => {
    const {fn, calls} = fakeQuery(PING_SCRIPT);
    const provider = new ClaudeAgentProvider({}, {queryFn: fn});
    await collect(provider.generateMessages({messages: [userMsg("hi")], model: "sonnet", effort: "medium", thinking}));
    expect(calls[0].options?.effort).toBe("medium");
    expect(calls[0].options?.thinking).toEqual(expected);
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
    expect(opts.effort).toBeUndefined();
    expect(opts.thinking).toBeUndefined();
    expect(opts.maxTurns).toBe(1);
    expect(opts.allowedTools).toEqual([]);
    expect(opts.settingSources).toEqual([]);
    expect(opts.permissionMode).toBe("bypassPermissions");
    expect(opts.allowDangerouslySkipPermissions).toBe(true);
    expect(opts.includePartialMessages).toBe(true);
    expect(opts.resume).toBeUndefined();
    // Regression (#5): on the tool-free path the SDK's built-in tools must be
    // explicitly disabled, otherwise a prompt-injected tool call in untrusted
    // text would execute on the host under bypassPermissions. allowedTools:[]
    // alone does NOT disable them.
    expect(opts.disallowedTools).toEqual(
      expect.arrayContaining([
        "Bash",
        "WebFetch",
        "Read",
        "Write",
        "Edit",
        "ToolSearch"
      ])
    );
    // No built-in, connector, bundled skill or agent listing reaches the turn.
    expect(opts.tools).toEqual([]);
    expect(opts.strictMcpConfig).toBe(true);
    expect(opts.skills).toEqual([]);
    expect(opts.env?.ENABLE_CLAUDEAI_MCP_SERVERS).toBe("false");
  });

  it("returns SDK structured output through the forced schema tool contract", async () => {
    const schema = {
      type: "object",
      required: ["shots"],
      properties: { shots: { type: "array", items: { type: "object" } } }
    };
    const screenplay = { shots: [{ action: "The lighthouse goes dark" }] };
    const structuredResult = {
      ...successResult(),
      structured_output: screenplay
    } as SDKMessage;
    const { fn, calls } = fakeQuery([sysInit("sess-structured"), structuredResult]);
    const provider = new ClaudeAgentProvider({}, { queryFn: fn });

    const result = await generateStructured(provider, {
      messages: [userMsg("Write one storyboard beat")],
      model: "sonnet",
      toolName: "screenplay",
      toolDescription: "Submit the screenplay",
      schema
    });

    expect(calls[0].options?.outputFormat).toEqual({
      type: "json_schema",
      schema
    });
    // The SDK retries an answer that misses the schema, and each retry is a
    // turn: one turn turned the first miss into `error_max_turns`.
    expect(calls[0].options?.maxTurns).toBeGreaterThan(1);
    expect(result).toEqual(screenplay);
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
    // No skills handed in: no plugin, and the bundled skills stay hidden.
    expect((calls[0].options as Options).plugins).toBeUndefined();
    expect((calls[0].options as Options).skills).toEqual([]);
    const msgs = messagesOf(items);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ role: "assistant", content: "hello" });
    // Live text still streams as a chunk.
    expect(chunksOf(items).find((c) => c.content === "hello")).toBeTruthy();
  });

  it("materializes user skills into an isolated local plugin for the SDK", async () => {
    let pluginDir: string | undefined;
    let skillMd: string | undefined;
    const optionsSeen: Options[] = [];
    // A bespoke queryFn (not fakeQuery) so it can read the SKILL.md off disk
    // while the plugin dir still exists — cleanup runs in generateLoop's finally,
    // after the stream is drained.
    const fn: ClaudeQueryFn = (params) => {
      optionsSeen.push(params.options as Options);
      return (async function* () {
        const p = (
          params.options?.plugins?.[0] as { path: string } | undefined
        )?.path;
        if (p) {
          pluginDir = p;
          skillMd = await fs.readFile(
            path.join(p, "skills", "release-notes", "SKILL.md"),
            "utf8"
          );
        }
        yield sysInit("sess-skills");
        yield assistantTextMsg("done");
        yield successResult();
      })();
    };
    const provider = new ClaudeAgentProvider({}, { queryFn: fn });
    await collect(
      provider.generateLoop({
        messages: [sysMsg("Be terse."), userMsg("cut a release")],
        model: "sonnet",
        threadId: "t-skills",
        skills: [
          {
            name: "release-notes",
            // Colons and quotes must not break the YAML frontmatter.
            description: 'Release notes: with a colon and "quotes"',
            content: "Step 1. Summarize.\nStep 2. Ship."
          }
        ]
      })
    );
    const opts = optionsSeen[0];
    // Native skills ride `plugins`, never `settingSources` (kept []).
    expect(opts.settingSources).toEqual([]);
    expect(opts.skills).toEqual(["release-notes"]);
    // The native Skill tool is the one built-in the plugin needs.
    expect(opts.tools).toEqual(["Skill"]);
    expect(opts.plugins).toEqual([
      { type: "local", path: pluginDir, skipMcpDiscovery: true }
    ]);
    // Frontmatter is valid YAML (description JSON-quoted) and body is the content.
    expect(skillMd).toContain("name: release-notes");
    expect(skillMd).toContain(
      'description: "Release notes: with a colon and \\"quotes\\""'
    );
    expect(skillMd).toContain("Step 1. Summarize.");
    // The throwaway plugin dir is removed once the turn ends.
    await expect(fs.access(pluginDir as string)).rejects.toBeTruthy();
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
    // NodeTool defers no tool into the SDK, so its built-in ToolSearch always
    // answers empty — a dead end a stuck model reaches for. Disable it.
    expect(opts.disallowedTools).toEqual(["ToolSearch"]);

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

  it("returns asset-backed view_image pixels from the SDK tool callback", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const assetStorage = new InMemoryStorageAdapter();
    const storage = new InMemoryStorageAdapter();
    await assetStorage.store("u1/contact.png", bytes, "image/png");
    const storageUri = await storage.store("u1/contact.png", bytes, "image/png");
    const context = new ProcessingContext({
      jobId: "j1",
      userId: "u1",
      assetStorage,
      storage,
      fetchFn: async () => new Response("not found", { status: 404 })
    });
    const { fn } = fakeQuery([sysInit("sess-image"), successResult()]);
    const mcp = fakeCreateMcpServer();
    const provider = new ClaudeAgentProvider(
      {},
      { queryFn: fn, createMcpServerFn: mcp.fn }
    );
    let imageUri = "asset://contact.png";

    await collect(
      provider.generateLoop({
        messages: [userMsg("Read the contact sheet")],
        model: "haiku",
        tools: [{ name: "view_image" }],
        executeTool: async () => [
          { type: "text", text: "Is text legible?" },
          {
            type: "image_url",
            image: { uri: imageUri, mimeType: "image/png" }
          }
        ],
        resolveMedia: (messages) => context.resolveMessageMediaUris(messages)
      })
    );

    expect(await mcp.captured.defs[0].handler({ image_id: "contact.png" })).toEqual({
      content: [
        { type: "text", text: "Is text legible?" },
        {
          type: "image",
          data: Buffer.from(bytes).toString("base64"),
          mimeType: "image/png"
        },
        { type: "text", text: "[attached image asset://contact.png]" }
      ]
    });

    imageUri = storageUri;
    expect(await mcp.captured.defs[0].handler({ image_id: storageUri })).toEqual({
      content: [
        { type: "text", text: "Is text legible?" },
        {
          type: "image",
          data: Buffer.from(bytes).toString("base64"),
          mimeType: "image/png"
        },
        { type: "text", text: `[attached image ${storageUri}]` }
      ]
    });

    imageUri = "asset://missing.png";
    expect(await mcp.captured.defs[0].handler({ image_id: imageUri })).toEqual({
      content: [
        { type: "text", text: "Is text legible?" },
        {
          type: "text",
          text: "[attached image could not be shown: asset://missing.png]"
        }
      ]
    });
  });

  it("gives parallel calls of one tool distinct ids within one millisecond", async () => {
    const { fn } = fakeQuery([sysInit("sess-par"), assistantTextMsg("ok"), successResult()]);
    const mcp = fakeCreateMcpServer();
    const provider = new ClaudeAgentProvider(
      {},
      { queryFn: fn, createMcpServerFn: mcp.fn }
    );
    const executed: ToolCall[] = [];
    await collect(
      provider.generateLoop({
        messages: [userMsg("echo twice")],
        model: "haiku",
        threadId: "t1",
        tools: [{ name: "echo", description: "Echo the input" }],
        executeTool: async (tc: ToolCall) => {
          executed.push(tc);
          return "ok";
        }
      })
    );
    const now = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    try {
      await Promise.all([
        mcp.captured.defs[0].handler({ text: "a" }),
        mcp.captured.defs[0].handler({ text: "b" })
      ]);
    } finally {
      now.mockRestore();
    }
    expect(executed).toHaveLength(2);
    expect(executed[0].id).not.toBe(executed[1].id);
  });

  // The SDK splits one API assistant turn into a frame per content block:
  // thinking, then text, then each tool_use. A message per frame would put a
  // text-only assistant message in the middle of a tool round, which every chat
  // surface reads as the end of the turn (the composer flips back to Send and
  // hides Stop), and would persist an empty row for the thinking frame.
  it("coalesces the block-split frames of one assistant turn into one message", async () => {
    const assistantThinking = (thinking: string): SDKMessage =>
      ({
        type: "assistant",
        session_id: "s",
        parent_tool_use_id: null,
        uuid: "u-asst-think",
        message: {
          model: "claude-haiku-4-5",
          content: [{ type: "thinking", thinking }]
        }
      }) as unknown as SDKMessage;

    const { fn } = fakeQuery([
      sysInit("sess-split"),
      assistantThinking("weighing it up"),
      assistantTextMsg("Let me check."),
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
    const items = await collect(
      provider.generateLoop({
        messages: [userMsg("echo hi")],
        model: "haiku",
        threadId: "t1",
        tools: [
          {
            name: "echo",
            description: "Echo the input",
            inputSchema: { type: "object", properties: {} }
          }
        ],
        executeTool: async () => "ok"
      })
    );

    const msgs = messagesOf(items);
    // Two assistant messages, not four: the tool round, then the closing text.
    expect(msgs.filter((m) => m.role === "assistant")).toHaveLength(2);
    expect(msgs[0]).toMatchObject({
      role: "assistant",
      content: "Let me check.",
      toolCalls: [{ id: "tu_1", name: "echo" }]
    });
    // The turn that asked for the tool is emitted before its result.
    expect(msgs[1]).toMatchObject({ role: "tool", toolCallId: "tu_1" });
    expect(msgs[2]).toMatchObject({ role: "assistant", content: "all done" });
    // The closing text lands before the done chunk, so nothing after it says
    // the turn is still running.
    const last = items.at(-1);
    expect(last).toMatchObject({ type: "chunk", done: true });
  });

  it("providedToolsOnly excludes implicit web tools and skills from a supplied-tool loop", async () => {
    const { fn, calls } = fakeQuery([
      sysInit("sess-isolated"),
      assistantTextMsg("ok"),
      successResult()
    ]);
    const mcp = fakeCreateMcpServer();
    const provider = new ClaudeAgentProvider(
      {},
      { queryFn: fn, createMcpServerFn: mcp.fn }
    );
    const names = [
      "edit_timeline",
      "validate_timeline",
      "submit_finished_cut",
      "review_finished_cut"
    ];
    await collect(
      provider.generateLoop({
        messages: [sysMsg("Only edit this draft"), userMsg("Finish")],
        model: "sonnet",
        tools: names.map((name) => ({ name, description: name })),
        providedToolsOnly: true,
        skills: [
          {
            name: "release-notes",
            description: "Unrelated skill",
            content: "Run extra tools."
          }
        ],
        executeTool: async () => "ok"
      })
    );
    const options = calls[0].options as Options;
    expect(options.tools).toEqual([]);
    expect(options.allowedTools).toEqual(
      names.map((name) => `mcp__nodetool_tools__${name}`)
    );
    expect(options.disallowedTools).toEqual(
      expect.arrayContaining([
        "Bash",
        "Read",
        "Write",
        "WebSearch",
        "WebFetch",
        "Skill",
        "ToolSearch"
      ])
    );
    expect(options.skills).toEqual([]);
    expect(options.plugins).toBeUndefined();
    expect(options.strictMcpConfig).toBe(true);
  });

  it("providedToolsOnly retains supplied MCP dispatch instead of SDK native replacements", async () => {
    const { fn, calls } = fakeQuery([
      sysInit("sess-no-replacement"),
      assistantTextMsg("ok"),
      successResult()
    ]);
    const mcp = fakeCreateMcpServer();
    const provider = new ClaudeAgentProvider(
      {},
      { queryFn: fn, createMcpServerFn: mcp.fn }
    );
    const executed: string[] = [];
    await collect(
      provider.generateLoop({
        messages: [userMsg("Use exactly the supplied tools")],
        model: "sonnet",
        workspaceDir: "/tmp/workspace",
        tools: [
          { name: "read_file", description: "Scoped read" },
          { name: "web_search", description: "Scoped search" }
        ],
        providedToolsOnly: true,
        executeTool: async (call) => {
          executed.push(call.name);
          return "ok";
        }
      })
    );
    const options = calls[0].options as Options;
    expect(options.tools).toEqual([]);
    expect(options.allowedTools).toEqual([
      "mcp__nodetool_tools__read_file",
      "mcp__nodetool_tools__web_search"
    ]);
    expect(options.disallowedTools).toEqual(
      expect.arrayContaining(["Read", "WebSearch", "WebFetch", "Skill"])
    );
    expect(mcp.captured.defs).toHaveLength(2);
    await mcp.captured.defs[0].handler({ path: "timeline.json" });
    await mcp.captured.defs[1].handler({ query: "scoped search" });
    expect(executed).toEqual(["read_file", "web_search"]);
  });

  it("replaces NodeTool tools with the SDK built-ins that cover them", async () => {
    const { fn, calls } = fakeQuery([
      sysInit("sess-native"),
      assistantTextMsg("ok"),
      successResult()
    ]);
    const mcp = fakeCreateMcpServer();
    const provider = new ClaudeAgentProvider(
      {},
      { queryFn: fn, createMcpServerFn: mcp.fn }
    );
    await collect(
      provider.generateLoop({
        messages: [sysMsg("x"), userMsg("y")],
        model: "haiku",
        workspaceDir: "/tmp/ws",
        tools: [
          { name: "read_file", description: "read" },
          { name: "grep", description: "grep" },
          { name: "web_search", description: "search" },
          // No built-in covers these three, so they stay NodeTool's.
          { name: "list_directory", description: "ls" },
          { name: "run_subtask", description: "delegate" },
          { name: "echo", description: "echo" }
        ],
        executeTool: async () => "ok"
      })
    );

    const opts = calls[0].options as Options;
    expect(opts.allowedTools).toEqual([
      "mcp__nodetool_tools__list_directory",
      "mcp__nodetool_tools__run_subtask",
      "mcp__nodetool_tools__echo"
    ]);
    // The built-ins stay live, anchored to the run's workspace — only the
    // always-empty ToolSearch is taken off the table.
    expect(opts.disallowedTools).toEqual(["ToolSearch"]);
    expect(opts.cwd).toBe("/tmp/ws");
    // Only the built-ins that replace an offered tool, plus the web pair.
    expect(opts.tools).toEqual(["Read", "Grep", "WebSearch", "WebFetch"]);
    expect(opts.strictMcpConfig).toBe(true);
  });

  it("keeps the path-scoped NodeTool tools when no workspace is given", async () => {
    // The SDK's Read/Write/Glob/Grep resolve against cwd. Without a workspace
    // to point cwd at, they would read somewhere else entirely, so NodeTool's
    // workspace-contained versions must survive.
    const { fn, calls } = fakeQuery([
      sysInit("sess-nocwd"),
      assistantTextMsg("ok"),
      successResult()
    ]);
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
          { name: "read_file", description: "read" },
          { name: "web_search", description: "search" }
        ],
        executeTool: async () => "ok"
      })
    );

    const opts = calls[0].options as Options;
    // web_search is not path-scoped, so WebSearch still replaces it.
    expect(opts.allowedTools).toEqual(["mcp__nodetool_tools__read_file"]);
    expect(opts.cwd).toBeUndefined();
  });

  it("normalizes a `tools.<name>` tool-call name to the plain tool name", async () => {
    // Regression: the CodeAct prompt documents guest tools as
    // `await tools.<name>({…})`. A model emitted that member expression as the
    // tool name, the SDK answered "No such tool available", and the turn died.
    const { fn } = fakeQuery([
      sysInit("sess-prefix"),
      assistantToolUse("tu_1", "tools.echo", { text: "hi" }),
      userToolResult("tu_1", "echoed: hi"),
      assistantTextMsg("done"),
      successResult()
    ]);
    const mcp = fakeCreateMcpServer();
    const provider = new ClaudeAgentProvider(
      {},
      { queryFn: fn, createMcpServerFn: mcp.fn }
    );
    const items = await collect(
      provider.generateLoop({
        messages: [sysMsg("x"), userMsg("echo hi")],
        model: "haiku",
        tools: [{ name: "echo", description: "Echo the input" }],
        executeTool: async () => "ok"
      })
    );

    const toolCallItems = items.filter(
      (i): i is ToolCall => "name" in i && "id" in i && !("type" in i)
    );
    expect(toolCallItems[0]).toMatchObject({ id: "tu_1", name: "echo" });
    const asstWithCalls = messagesOf(items).find(
      (m) => m.role === "assistant" && m.toolCalls?.length
    );
    expect(asstWithCalls?.toolCalls?.[0]?.name).toBe("echo");
  });

  it("still strips the SDK's `mcp__nodetool_tools__` prefix", async () => {
    const { fn } = fakeQuery([
      sysInit("sess-mcp-prefix"),
      assistantToolUse("tu_1", "mcp__nodetool_tools__echo", { text: "hi" }),
      userToolResult("tu_1", "echoed: hi"),
      assistantTextMsg("done"),
      successResult()
    ]);
    const mcp = fakeCreateMcpServer();
    const provider = new ClaudeAgentProvider(
      {},
      { queryFn: fn, createMcpServerFn: mcp.fn }
    );
    const items = await collect(
      provider.generateLoop({
        messages: [sysMsg("x"), userMsg("echo hi")],
        model: "haiku",
        tools: [{ name: "echo", description: "Echo the input" }],
        executeTool: async () => "ok"
      })
    );
    const toolCallItems = items.filter(
      (i): i is ToolCall => "name" in i && "id" in i && !("type" in i)
    );
    expect(toolCallItems[0]).toMatchObject({ name: "echo" });
  });

  it("leaves the built-ins live when every offered tool was replaced", async () => {
    const { fn, calls } = fakeQuery([
      sysInit("sess-allnative"),
      assistantTextMsg("ok"),
      successResult()
    ]);
    const provider = new ClaudeAgentProvider({}, { queryFn: fn });
    await collect(
      provider.generateLoop({
        messages: [sysMsg("x"), userMsg("y")],
        model: "haiku",
        workspaceDir: "/tmp/ws",
        tools: [{ name: "grep", description: "grep" }],
        executeTool: async () => "ok"
      })
    );

    const opts = calls[0].options as Options;
    expect(opts.mcpServers).toBeUndefined();
    // The caller offered a tool, so the built-ins must not be disabled — and
    // the loop must still be allowed the turns to use them. ToolSearch is the
    // one exception: it searches deferred tools, and NodeTool defers none.
    expect(opts.disallowedTools).toEqual(["ToolSearch"]);
    expect(opts.maxTurns).toBeGreaterThan(1);
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

  it("cancels an image-bearing query without changing structured content", async () => {
    const calls: QueryCall[] = [];
    const fn: ClaudeQueryFn = params => {
      calls.push({prompt: params.prompt, options: params.options});
      return (async function* () {
        yield sysInit("image-abort");
        while (!params.options?.abortController?.signal.aborted) {
          await new Promise(resolve => setTimeout(resolve, 5));
        }
      })();
    };
    const provider = new ClaudeAgentProvider({}, {queryFn: fn});
    const controller = new AbortController();
    const result = collect(provider.generateMessages({model: "sonnet", messages: [imageMsg("Actual frame", {uri: "data:image/png;base64,QUJD"})], signal: controller.signal}));
    controller.abort();
    await result;
    expect(calls[0].options?.abortController?.signal.aborted).toBe(true);
    expect((await structuredPrompt(calls[0]))[0].message.content).toEqual([
      {type: "text", text: "Actual frame"}, {type: "image", source: {type: "base64", media_type: "image/png", data: "QUJD"}}
    ]);
  });

  it("cancels the query when the consumer stops iterating", async () => {
    // The chat runner cancels by breaking out of the `for await`, with no
    // signal. Without an abort in the generator's `finally` the SDK subprocess
    // kept running its whole agentic loop after the user pressed Stop.
    const calls: QueryCall[] = [];
    const fn: ClaudeQueryFn = (params) => {
      calls.push({ prompt: params.prompt, options: params.options });
      const ac = params.options?.abortController;
      return (async function* () {
        yield sysInit("sess-break");
        while (!ac?.signal.aborted) {
          yield assistantTextMsg("still working");
          await new Promise((r) => setTimeout(r, 5));
        }
      })();
    };
    const provider = new ClaudeAgentProvider({}, { queryFn: fn });

    for await (const _item of provider.generateMessages({
      messages: [userMsg("hi")],
      model: "haiku"
    })) {
      break;
    }

    expect(calls[0].options?.abortController?.signal.aborted).toBe(true);
  });
});
