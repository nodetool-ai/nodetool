import { describe, expect, it, vi } from "vitest";

import { BotApi } from "../src/bot-api.js";
import type { TelegramUpdate } from "../src/bot-api.js";
import { MESSAGES } from "../src/commands.js";
import type { RenderOp } from "../src/frame-renderer.js";
import type { IdentityResolution } from "../src/identity-client.js";
import { TelegramAdapter } from "../src/telegram-adapter.js";
import type { ResolveAsset } from "../src/telegram-adapter.js";
import type { DeliveryContext, SubmitResult } from "../src/turn-router.js";
import type { TurnRouter } from "../src/turn-router.js";

interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

interface ScriptedReply {
  /** Bot API method this reply answers; asserted so a test cannot drift. */
  method?: string;
  status?: number;
  body?: unknown;
}

/**
 * A fake Bot API endpoint: records `(method, payload)` and answers either the
 * default `{ok: true}` or one scripted reply per call.
 */
function fakeBotApi(replies: ScriptedReply[] = []): {
  api: BotApi;
  calls: ApiCall[];
} {
  const calls: ApiCall[] = [];
  let messageId = 100;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = String(input).split("/").pop() ?? "";
    const payload =
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : { multipart: true };
    calls.push({ method, payload });

    messageId += 1;
    const reply = replies.shift();
    if (reply !== undefined) {
      if (reply.method !== undefined) {
        expect(method).toBe(reply.method);
      }
      if (reply.status !== undefined || reply.body !== undefined) {
        return new Response(JSON.stringify(reply.body ?? { ok: false, description: "boom" }), {
          status: reply.status ?? 400
        });
      }
    }
    return new Response(JSON.stringify({ ok: true, result: { message_id: messageId } }), {
      status: 200
    });
  }) as typeof fetch;

  return {
    api: new BotApi({ botToken: "bot-token", fetch: fetchImpl, baseUrl: "https://tg.test" }),
    calls
  };
}

interface RouterStub {
  submit: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  newThread: ReturnType<typeof vi.fn>;
  currentThreadId: ReturnType<typeof vi.fn>;
  queueDepth: ReturnType<typeof vi.fn>;
  isRunning: ReturnType<typeof vi.fn>;
}

function routerStub(submitResult: SubmitResult = { status: "started", threadId: "t-1" }): RouterStub {
  return {
    submit: vi.fn(async () => submitResult),
    stop: vi.fn(() => true),
    newThread: vi.fn(() => "telegram-55-abc-2"),
    currentThreadId: vi.fn(() => "telegram-55-abc-1"),
    queueDepth: vi.fn(() => 0),
    isRunning: vi.fn(() => false)
  };
}

function identityStub(resolution: IdentityResolution) {
  return {
    resolve: vi.fn(async () => resolution),
    linkStart: vi.fn(async () => ({ code: "abc", url: "http://server/link?code=abc", expiresAt: null })),
    completeDeepLink: vi.fn(async () => ({ ok: true as const })),
    unlink: vi.fn(async () => true)
  };
}

const LINKED: IdentityResolution = {
  unlinked: false,
  token: "tok",
  userId: "user-1",
  expiresAtMs: 10_000_000
};

const UNLINKED: IdentityResolution = {
  unlinked: true,
  reason: "not-linked",
  message: "This account is not linked to a NodeTool user"
};

function makeAdapter(options: {
  replies?: ScriptedReply[];
  identity?: ReturnType<typeof identityStub>;
  router?: RouterStub;
  allowUsers?: readonly string[];
  waits?: number[];
  resolveAsset?: ResolveAsset;
}) {
  const { api, calls } = fakeBotApi(options.replies ?? []);
  const identity = options.identity ?? identityStub(LINKED);
  const router = options.router ?? routerStub();
  const waits = options.waits ?? [];
  const adapter = new TelegramAdapter({
    api,
    identity,
    // SAFETY: the adapter reads only the `submit`/`stop`/`newThread`/
    // `currentThreadId`/`queueDepth`/`isRunning` members the stub provides;
    // the rest of `TurnRouter` is socket ownership it never touches.
    router: router as unknown as TurnRouter,
    config: { allowUsers: options.allowUsers ?? [], apiUrl: "http://server:7777" },
    fetch: (async () =>
      new Response(JSON.stringify({ status: "ok" }), { status: 200 })) as typeof fetch,
    wait: async (ms: number) => {
      waits.push(ms);
    },
    ...(options.resolveAsset === undefined ? {} : { resolveAsset: options.resolveAsset }),
    log: () => undefined
  });
  return { adapter, calls, identity, router, waits };
}

function privateMessage(text: string, from = 12345): TelegramUpdate {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      text,
      chat: { id: 55, type: "private" },
      from: { id: from },
      ...(text.startsWith("/")
        ? { entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0].length }] }
        : {})
    }
  };
}

function groupMessage(text: string): TelegramUpdate {
  return {
    update_id: 2,
    message: {
      message_id: 2,
      text,
      chat: { id: -100, type: "supergroup" },
      from: { id: 12345 }
    }
  };
}

const CONTEXT: DeliveryContext = {
  chatId: "55",
  telegramUserId: "12345",
  userId: "user-1",
  threadId: "telegram-55-abc-1",
  token: "tok"
};

describe("TelegramAdapter routing", () => {
  it("submits a linked user's private text as a turn", async () => {
    const { adapter, router, calls } = makeAdapter({});
    await adapter.handleUpdate(privateMessage("hello there"));

    expect(router.submit).toHaveBeenCalledWith({
      telegramUserId: "12345",
      chatId: "55",
      text: "hello there"
    });
    expect(calls).toHaveLength(0);
  });

  it("answers an unlinked user with the link prompt instead of a turn", async () => {
    const { adapter, calls } = makeAdapter({
      router: routerStub({ status: "unlinked", reason: "not-linked", message: UNLINKED.message })
    });
    await adapter.handleUpdate(privateMessage("hello"));

    expect(calls).toHaveLength(1);
    expect(calls[0].payload.text).toBe(MESSAGES.linkPrompt);
  });

  it("answers busy when the queue is full", async () => {
    const { adapter, calls } = makeAdapter({ router: routerStub({ status: "busy", depth: 3 }) });
    await adapter.handleUpdate(privateMessage("hello"));

    expect(calls[0].payload.text).toBe(MESSAGES.busy);
  });

  it("declines a group once and then ignores it", async () => {
    const { adapter, calls, router } = makeAdapter({});
    await adapter.handleUpdate(groupMessage("hello"));
    await adapter.handleUpdate(groupMessage("hello again"));
    await adapter.handleUpdate(groupMessage("/status"));

    expect(calls.map((c) => c.payload.text)).toEqual([MESSAGES.groupDecline]);
    expect(router.submit).not.toHaveBeenCalled();
  });

  it("refuses an account outside the allowlist", async () => {
    const { adapter, calls, router } = makeAdapter({ allowUsers: ["999"] });
    await adapter.handleUpdate(privateMessage("hello"));

    expect(calls[0].payload.text).toBe(MESSAGES.notAllowed);
    expect(router.submit).not.toHaveBeenCalled();
  });

  it("routes a command to the command handler, not the LLM", async () => {
    const { adapter, calls, router } = makeAdapter({});
    await adapter.handleUpdate(privateMessage("/new"));

    expect(router.submit).not.toHaveBeenCalled();
    expect(router.newThread).toHaveBeenCalledWith("55");
    expect(calls[0].payload.text).toContain("New thread: telegram-55-abc-2");
  });

  it("answers a non-text message plainly", async () => {
    const { adapter, calls } = makeAdapter({});
    await adapter.handleUpdate({
      update_id: 3,
      message: { message_id: 3, chat: { id: 55, type: "private" }, from: { id: 12345 }, photo: [{}] }
    });

    expect(calls[0].payload.text).toBe(MESSAGES.unsupportedMedia);
  });

  it("stops the turn from the inline stop button", async () => {
    const { adapter, calls, router } = makeAdapter({});
    await adapter.handleUpdate({
      update_id: 4,
      callback_query: {
        id: "cb-1",
        data: "stop",
        from: { id: 12345 },
        message: { message_id: 9, chat: { id: 55, type: "private" } }
      }
    });

    expect(router.stop).toHaveBeenCalledWith("55");
    expect(calls[0].method).toBe("answerCallbackQuery");
    expect(calls[0].payload.text).toBe(MESSAGES.stopping);
  });
});

describe("TelegramAdapter op execution", () => {
  it("sends the status message with a stop button, then edits it in place", async () => {
    const { adapter, calls } = makeAdapter({});
    const ops: RenderOp[] = [
      { kind: "send", target: "status", text: "🔧 web_search", parseMode: "html" },
      { kind: "edit", target: "status", text: "✅ web_search", parseMode: "html" }
    ];
    adapter.executeOps(CONTEXT, ops);
    await adapter.flush();

    expect(calls[0].method).toBe("sendMessage");
    expect(calls[0].payload.parse_mode).toBe("HTML");
    expect(calls[0].payload.reply_markup).toEqual({
      inline_keyboard: [[{ text: "⏹ Stop", callback_data: "stop" }]]
    });
    expect(calls[1].method).toBe("editMessageText");
    expect(calls[1].payload.message_id).toBe(101);
  });

  it("resends without a parse mode when Telegram rejects the entities", async () => {
    const { adapter, calls } = makeAdapter({
      replies: [
        {
          method: "sendMessage",
          status: 400,
          body: { ok: false, description: "Bad Request: can't parse entities" }
        }
      ]
    });
    adapter.executeOps(CONTEXT, [
      { kind: "send", target: "stream", text: "<b>broken", parseMode: "html" }
    ]);
    await adapter.flush();

    expect(calls).toHaveLength(2);
    expect(calls[0].payload.parse_mode).toBe("HTML");
    expect(calls[1].payload.parse_mode).toBeUndefined();
    expect(calls[1].payload.text).toBe("<b>broken");
  });

  it("swallows an unmodified-message edit", async () => {
    const { adapter, calls } = makeAdapter({
      replies: [
        {},
        {
          method: "editMessageText",
          status: 400,
          body: { ok: false, description: "Bad Request: message is not modified" }
        }
      ]
    });
    adapter.executeOps(CONTEXT, [
      { kind: "send", target: "stream", text: "same", parseMode: "none" },
      { kind: "edit", target: "stream", text: "same", parseMode: "none" }
    ]);
    await adapter.flush();

    expect(calls).toHaveLength(2);
  });

  it("honors 429 retry_after and drops the edits it supersedes", async () => {
    const waits: number[] = [];
    const { api, calls } = fakeBotApi([
      { method: "sendMessage" },
      {
        method: "editMessageText",
        status: 429,
        body: { ok: false, description: "Too Many Requests", parameters: { retry_after: 7 } }
      }
    ]);
    let adapter: TelegramAdapter;
    adapter = new TelegramAdapter({
      api,
      identity: identityStub(LINKED),
      // SAFETY: see makeAdapter — the stub covers every member used here.
      router: routerStub() as unknown as TurnRouter,
      config: { allowUsers: [], apiUrl: "http://server:7777" },
      fetch: (async () => new Response("{}", { status: 200 })) as typeof fetch,
      wait: async (ms: number) => {
        waits.push(ms);
        // Two more edits land while the backoff holds the queue: the one that
        // was rate-limited and the one behind it are both stale now.
        adapter.executeOps(CONTEXT, [
          { kind: "edit", target: "stream", text: "one two three", parseMode: "none" },
          { kind: "edit", target: "stream", text: "one two three four", parseMode: "none" }
        ]);
      },
      log: () => undefined
    });

    adapter.executeOps(CONTEXT, [
      { kind: "send", target: "stream", text: "one", parseMode: "none" },
      { kind: "edit", target: "stream", text: "one two", parseMode: "none" },
      { kind: "edit", target: "stream", text: "one two (rate limited)", parseMode: "none" }
    ]);
    await adapter.flush();

    expect(waits).toEqual([7000]);
    const edits = calls.filter((c) => c.method === "editMessageText");
    // The rate-limited edit is retried, finds a newer edit queued behind it,
    // and is dropped: only the newest text ever reaches Telegram.
    expect(edits.map((c) => c.payload.text)).toEqual([
      "one two (rate limited)",
      "one two three four"
    ]);
  });

  it("creates a new message when a finalize op says nothing exists yet", async () => {
    const { adapter, calls } = makeAdapter({});
    adapter.executeOps(CONTEXT, [
      { kind: "finalize", target: "stream", text: "done", parseMode: "none", create: true }
    ]);
    await adapter.flush();

    expect(calls[0].method).toBe("sendMessage");
  });

  it("uploads an attachment as a photo or a document by content type", async () => {
    const { adapter, calls } = makeAdapter({
      resolveAsset: async (asset) => ({
        bytes: new Uint8Array([1, 2, 3]),
        filename: asset.name ?? "file.bin",
        contentType: asset.contentType
      })
    });
    adapter.executeOps(CONTEXT, [
      { kind: "attach", asset: { uri: "asset://1", name: "a.png", contentType: "image/png" } },
      { kind: "attach", asset: { uri: "asset://2", name: "b.pdf", contentType: "application/pdf" } }
    ]);
    await adapter.flush();

    expect(calls.map((c) => c.method)).toEqual(["sendPhoto", "sendDocument"]);
  });

  it("sends a typing action and the stop note", async () => {
    const { adapter, calls } = makeAdapter({});
    adapter.executeOps(CONTEXT, [
      { kind: "typing" },
      { kind: "stop-note", text: "⏹ stopped" }
    ]);
    await adapter.flush();

    expect(calls[0].method).toBe("sendChatAction");
    expect(calls[0].payload.action).toBe("typing");
    expect(calls[1].payload.text).toBe("⏹ stopped");
  });
});

describe("TelegramAdapter polling", () => {
  it("ends the loop when another consumer holds the bot token", async () => {
    const { adapter } = makeAdapter({
      replies: [
        {
          method: "getUpdates",
          status: 409,
          body: { ok: false, description: "Conflict: terminated by other getUpdates request" }
        }
      ]
    });

    await expect(adapter.poll()).resolves.toBe("conflict");
  });

  it("stops cleanly and advances the offset past handled updates", async () => {
    const offsets: number[] = [];
    let adapter: TelegramAdapter;
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = String(input).split("/").pop() ?? "";
      const payload = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      if (method === "getUpdates") {
        offsets.push(payload.offset as number);
        if (offsets.length === 1) {
          return new Response(JSON.stringify({ ok: true, result: [privateMessage("hi")] }), {
            status: 200
          });
        }
        adapter.stop();
        return new Response(JSON.stringify({ ok: true, result: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    }) as typeof fetch;

    adapter = new TelegramAdapter({
      api: new BotApi({ botToken: "bot-token", fetch: fetchImpl, baseUrl: "https://tg.test" }),
      identity: identityStub(UNLINKED),
      // SAFETY: see makeAdapter — the stub covers every member used here.
      router: routerStub({
        status: "unlinked",
        reason: "not-linked",
        message: UNLINKED.message
      }) as unknown as TurnRouter,
      config: { allowUsers: [], apiUrl: "http://server:7777" },
      fetch: fetchImpl,
      wait: async () => undefined,
      log: () => undefined
    });

    await expect(adapter.poll()).resolves.toBe("stopped");
    expect(offsets).toEqual([0, 2]);
  });
});
