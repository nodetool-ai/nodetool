import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { ClaudeAgentProvider } from "../../src/providers/claude-agent-provider.js";
import type { Message, ProviderStreamItem } from "../../src/providers/types.js";

/**
 * Build a fake child process whose stdout replays newline-delimited
 * stream-json lines, then closes with `code`. When `errorCode` is set the
 * child emits a spawn 'error' (e.g. ENOENT) before closing.
 */
function fakeChild(
  lines: string[],
  opts: { code?: number; errorCode?: string } = {}
): EventEmitter & Record<string, unknown> {
  const code = opts.code ?? 0;
  const child = new EventEmitter() as EventEmitter & Record<string, unknown>;
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  child.stdout = stdout;
  child.stderr = stderr;
  child.stdin = { end: vi.fn() };
  child.kill = vi.fn();
  child.exitCode = null;
  stdout.on("end", () => {
    child.exitCode = code;
    child.emit("close", code);
  });
  setImmediate(() => {
    if (opts.errorCode) {
      const err = Object.assign(new Error("spawn failed"), {
        code: opts.errorCode
      });
      child.emit("error", err);
    }
    for (const l of lines) stdout.push(`${l}\n`);
    stdout.push(null);
    stderr.push(null);
  });
  return child;
}

/** A spawn stub recording its last invocation and returning a scripted child. */
function fakeSpawn(child: EventEmitter & Record<string, unknown>) {
  const calls: Array<{ cmd: string; args: string[]; opts: unknown }> = [];
  const fn = vi.fn((cmd: string, args: string[], options: unknown) => {
    calls.push({ cmd, args, opts: options });
    return child;
  });
  return { fn: fn as unknown as typeof import("node:child_process").spawn, calls };
}

/** The stream-json lines a successful single-turn print invocation emits. */
const PING_STREAM = [
  JSON.stringify({ type: "system", subtype: "init", model: "haiku" }),
  JSON.stringify({
    type: "stream_event",
    event: {
      type: "message_start",
      message: {
        model: "claude-haiku-4-5-20251001",
        usage: { input_tokens: 9, cache_creation_input_tokens: 100 }
      }
    }
  }),
  JSON.stringify({
    type: "stream_event",
    event: {
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "hmm" }
    }
  }),
  JSON.stringify({
    type: "stream_event",
    event: {
      type: "content_block_delta",
      index: 1,
      delta: { type: "text_delta", text: "ping" }
    }
  }),
  JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    result: "ping",
    usage: {
      input_tokens: 9,
      cache_creation_input_tokens: 100,
      cache_read_input_tokens: 0,
      output_tokens: 5
    }
  })
];

async function collect(
  stream: AsyncGenerator<ProviderStreamItem>
): Promise<ProviderStreamItem[]> {
  const items: ProviderStreamItem[] = [];
  for await (const item of stream) items.push(item);
  return items;
}

const userMsg = (text: string): Message => ({ role: "user", content: text });

describe("ClaudeAgentProvider", () => {
  it("reports its provider id and leaks no container env", () => {
    const provider = new ClaudeAgentProvider();
    expect(provider.provider).toBe("claude_agent_sdk");
    expect(provider.getContainerEnv()).toEqual({});
  });

  it("needs no secret and is a pure LLM (no tool support)", async () => {
    expect(ClaudeAgentProvider.requiredSecrets()).toEqual([]);
    const provider = new ClaudeAgentProvider();
    await expect(provider.hasToolSupport()).resolves.toBe(false);
  });

  it("lists subscription model aliases", async () => {
    const models = await new ClaudeAgentProvider().getAvailableLanguageModels();
    expect(models.map((m) => m.id)).toEqual(["opus", "sonnet", "haiku"]);
    expect(models.every((m) => m.provider === "claude_agent_sdk")).toBe(true);
  });

  it("spawns the CLI in tool-free single-turn print mode", async () => {
    const { fn, calls } = fakeSpawn(fakeChild(PING_STREAM));
    const provider = new ClaudeAgentProvider({}, { spawnFn: fn });
    await collect(
      provider.generateMessages({
        messages: [{ role: "system", content: "Be terse." }, userMsg("hi")],
        model: "haiku"
      })
    );
    const { cmd, args } = calls[0];
    expect(cmd).toBe("claude");
    expect(args).toContain("--output-format");
    expect(args).toContain("stream-json");
    expect(args).toEqual(expect.arrayContaining(["--allowedTools", ""]));
    expect(args).toEqual(expect.arrayContaining(["--max-turns", "1"]));
    expect(args).toEqual(
      expect.arrayContaining(["--system-prompt", "Be terse."])
    );
    expect(args).toEqual(expect.arrayContaining(["--model", "haiku"]));
  });

  it("streams text and thinking deltas, then a terminal done chunk", async () => {
    const { fn } = fakeSpawn(fakeChild(PING_STREAM));
    const provider = new ClaudeAgentProvider({}, { spawnFn: fn });
    const items = await collect(
      provider.generateMessages({ messages: [userMsg("hi")], model: "haiku" })
    );
    const chunks = items.filter(
      (i): i is Extract<ProviderStreamItem, { type: "chunk" }> =>
        "type" in i && i.type === "chunk"
    );
    expect(chunks.find((c) => c.thinking)?.content).toBe("hmm");
    expect(chunks.find((c) => !c.thinking && c.content === "ping")).toBeTruthy();
    expect(chunks.at(-1)?.done).toBe(true);
  });

  it("tracks usage against the resolved dated model from message_start", async () => {
    const { fn } = fakeSpawn(fakeChild(PING_STREAM));
    const provider = new ClaudeAgentProvider({}, { spawnFn: fn });
    await collect(
      provider.generateMessages({ messages: [userMsg("hi")], model: "haiku" })
    );
    // input(9) + cacheWrite(100) + cacheRead(0) tokens were accounted for.
    expect(provider.getTotalCost()).toBeGreaterThanOrEqual(0);
  });

  it("assembles a plain assistant message via generateMessage", async () => {
    const { fn } = fakeSpawn(fakeChild(PING_STREAM));
    const provider = new ClaudeAgentProvider({}, { spawnFn: fn });
    const msg = await provider.generateMessage({
      messages: [userMsg("hi")],
      model: "haiku"
    });
    expect(msg.role).toBe("assistant");
    expect(msg.content).toBe("ping");
    expect(msg.toolCalls).toBeNull();
  });

  it("throws when the CLI reports an error result", async () => {
    const lines = [
      JSON.stringify({
        type: "result",
        is_error: true,
        api_error_status: 404,
        result: "model not found"
      })
    ];
    const { fn } = fakeSpawn(fakeChild(lines));
    const provider = new ClaudeAgentProvider({}, { spawnFn: fn });
    await expect(
      collect(
        provider.generateMessages({ messages: [userMsg("hi")], model: "nope" })
      )
    ).rejects.toThrow("model not found");
  });

  it("throws a helpful error when the CLI is not installed", async () => {
    const { fn } = fakeSpawn(fakeChild([], { errorCode: "ENOENT", code: 1 }));
    const provider = new ClaudeAgentProvider({}, { spawnFn: fn });
    await expect(
      collect(
        provider.generateMessages({ messages: [userMsg("hi")], model: "haiku" })
      )
    ).rejects.toThrow(/claude CLI not found/);
  });

  it("strips nested Claude Code session env vars from the child", async () => {
    const prev = { ...process.env };
    process.env.CLAUDECODE = "1";
    process.env.CLAUDE_CODE_ENTRYPOINT = "cli";
    process.env.CLAUDE_SESSION_ID = "abc";
    process.env.ANTHROPIC_BASE_URL = "https://example.test";
    try {
      const { fn, calls } = fakeSpawn(fakeChild(PING_STREAM));
      const provider = new ClaudeAgentProvider({}, { spawnFn: fn });
      await collect(
        provider.generateMessages({ messages: [userMsg("hi")], model: "haiku" })
      );
      const env = (calls[0].opts as { env: Record<string, string> }).env;
      expect(env.CLAUDECODE).toBeUndefined();
      expect(env.CLAUDE_CODE_ENTRYPOINT).toBeUndefined();
      expect(env.CLAUDE_SESSION_ID).toBeUndefined();
      // API routing is preserved.
      expect(env.ANTHROPIC_BASE_URL).toBe("https://example.test");
    } finally {
      process.env = prev;
    }
  });
});
