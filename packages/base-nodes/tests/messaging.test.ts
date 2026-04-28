import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { getNodeMetadata } from "@nodetool-ai/node-sdk";
import {
  DiscordBotTrigger,
  DiscordSendMessage,
  TelegramBotTrigger,
  TelegramSendMessage,
  MESSAGING_NODES
} from "../src/nodes/messaging.js";

const originalFetch = global.fetch;
const mockFetch = vi.fn();
global.fetch = mockFetch;

function metadataDefaults(NodeCls: any) {
  const metadata = getNodeMetadata(NodeCls);
  return Object.fromEntries(
    metadata.properties
      .filter((prop) => Object.prototype.hasOwnProperty.call(prop, "default"))
      .map((prop) => [prop.name, prop.default])
  );
}

function expectMetadataDefaults(NodeCls: any) {
  expect(new NodeCls().serialize()).toEqual(metadataDefaults(NodeCls));
}

afterAll(() => {
  global.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// DiscordBotTrigger
// ---------------------------------------------------------------------------
describe("DiscordBotTrigger", () => {
  beforeEach(() => mockFetch.mockReset());

  it("has correct metadata", () => {
    expect(DiscordBotTrigger.nodeType).toBe(
      "messaging.discord.DiscordBotTrigger"
    );
    expect(DiscordBotTrigger.title).toBe("Discord Bot Trigger");
  });

  it("returns expected defaults", () => {
    expectMetadataDefaults(DiscordBotTrigger);
  });

  it("validates token via Discord API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "123", username: "TestBot" })
    });

    const node = new DiscordBotTrigger();
    node.assign({
      token: "test-token",
      channel_id: "ch-456"
    });
    const result = await node.process();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://discord.com/api/v10/users/@me");
    expect(opts.headers.Authorization).toBe("Bot test-token");

    expect(result.status).toBe("configured");
    expect(result.bot_id).toBe("123");
    expect(result.bot_username).toBe("TestBot");
    expect(result.channel_id).toBe("ch-456");
  });

  it("reads token from secrets", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "1", username: "Bot" })
    });

    const node = new DiscordBotTrigger();
    node.setDynamic("_secrets", { DISCORD_BOT_TOKEN: "secret-token" });
    await node.process();

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers.Authorization).toBe("Bot secret-token");
  });

  it("handles token validation failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized"
    });

    const node = new DiscordBotTrigger();
    node.assign({ token: "bad-token" });
    await expect(node.process()).rejects.toThrow(
      /token validation failed.*401/i
    );
  });
});

// ---------------------------------------------------------------------------
// DiscordSendMessage
// ---------------------------------------------------------------------------
describe("DiscordSendMessage", () => {
  beforeEach(() => mockFetch.mockReset());

  it("has correct metadata", () => {
    expect(DiscordSendMessage.nodeType).toBe(
      "messaging.discord.DiscordSendMessage"
    );
    expect(DiscordSendMessage.title).toBe("Discord Send Message");
  });

  it("returns expected defaults", () => {
    expectMetadataDefaults(DiscordSendMessage);
  });

  it("throws without channel_id", async () => {
    const node = new DiscordSendMessage();
    node.assign({ token: "tok", channel_id: "", content: "hi" });
    await expect(node.process()).rejects.toThrow(/channel ID is required/i);
  });

  it("sends message and returns message_id", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "msg-789" })
    });

    const node = new DiscordSendMessage();
    node.assign({
      token: "test-token",
      channel_id: "ch-123",
      content: "Hello!"
    });
    const result = await node.process();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://discord.com/api/v10/channels/ch-123/messages");
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body);
    expect(body.content).toBe("Hello!");
    expect(body.tts).toBe(false);

    expect(result.message_id).toBe("msg-789");
  });

  it("includes embeds in payload when provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "msg-1" })
    });

    const embeds = [{ title: "Test", description: "Desc" }];
    const node = new DiscordSendMessage();
    node.assign({
      token: "tok",
      channel_id: "ch",
      content: "hi",
      embeds
    });
    await node.process();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.embeds).toEqual(embeds);
  });

  it("handles send failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "Unknown Channel"
    });

    const node = new DiscordSendMessage();
    node.assign({ token: "tok", channel_id: "bad", content: "hi" });
    await expect(node.process()).rejects.toThrow(/sendMessage failed.*404/i);
  });
});

// ---------------------------------------------------------------------------
// TelegramBotTrigger
// ---------------------------------------------------------------------------
describe("TelegramBotTrigger", () => {
  beforeEach(() => mockFetch.mockReset());

  it("has correct metadata", () => {
    expect(TelegramBotTrigger.nodeType).toBe(
      "messaging.telegram.TelegramBotTrigger"
    );
    expect(TelegramBotTrigger.title).toBe("Telegram Bot Trigger");
  });

  it("returns expected defaults", () => {
    expectMetadataDefaults(TelegramBotTrigger);
  });

  it("validates token via getMe", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        result: { id: 111, username: "TestBot" }
      })
    });

    const node = new TelegramBotTrigger();
    node.assign({
      token: "tg-token",
      chat_id: 42
    });
    const result = await node.process();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bottg-token/getMe");

    expect(result.status).toBe("configured");
    expect(result.bot_id).toBe(111);
    expect(result.bot_username).toBe("TestBot");
    expect(result.chat_id).toBe(42);
  });

  it("reads token from secrets", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        result: { id: 1, username: "B" }
      })
    });

    const node = new TelegramBotTrigger();
    node.setDynamic("_secrets", { TELEGRAM_BOT_TOKEN: "secret-tg" });
    await node.process();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("botsecret-tg");
  });

  it("handles getMe failure (HTTP error)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized"
    });

    const node = new TelegramBotTrigger();
    node.assign({ token: "bad" });
    await expect(node.process()).rejects.toThrow(
      /token validation failed.*401/i
    );
  });

  it("handles getMe failure (ok: false in response)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: false, description: "Invalid token" })
    });

    const node = new TelegramBotTrigger();
    node.assign({ token: "bad" });
    await expect(node.process()).rejects.toThrow(/getMe failed/i);
  });
});

// ---------------------------------------------------------------------------
// TelegramSendMessage
// ---------------------------------------------------------------------------
describe("TelegramSendMessage", () => {
  beforeEach(() => mockFetch.mockReset());

  it("has correct metadata", () => {
    expect(TelegramSendMessage.nodeType).toBe(
      "messaging.telegram.TelegramSendMessage"
    );
    expect(TelegramSendMessage.title).toBe("Telegram Send Message");
  });

  it("returns expected defaults", () => {
    expectMetadataDefaults(TelegramSendMessage);
  });

  it("throws without chat_id", async () => {
    const node = new TelegramSendMessage();
    node.assign({ token: "tok", chat_id: 0, text: "hi" });
    await expect(node.process()).rejects.toThrow(/chat ID is required/i);
  });

  it("sends message and returns result", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, // HTTP ok
      json: async () => ({
        ok: true, // Telegram ok
        result: {
          message_id: 99,
          date: 1700000000,
          chat: { id: 42 }
        }
      })
    });

    const node = new TelegramSendMessage();
    node.assign({
      token: "tg-token",
      chat_id: 42,
      text: "Hello Telegram!"
    });
    const result = await node.process();

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bottg-token/sendMessage");
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body);
    expect(body.chat_id).toBe(42);
    expect(body.text).toBe("Hello Telegram!");

    expect(result.message_id).toBe(99);
    expect(result.chat_id).toBe(42);
  });

  it("includes parse_mode and reply_to_message_id when set", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        result: { message_id: 1, date: 0, chat: { id: 1 } }
      })
    });

    const node = new TelegramSendMessage();
    node.assign({
      token: "tok",
      chat_id: 1,
      text: "hi",
      parse_mode: "HTML",
      reply_to_message_id: 55
    });
    await node.process();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.parse_mode).toBe("HTML");
    expect(body.reply_to_message_id).toBe(55);
  });

  it("handles sendMessage failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: false,
        description: "Chat not found"
      })
    });

    const node = new TelegramSendMessage();
    node.assign({ token: "tok", chat_id: 999, text: "hi" });
    await expect(node.process()).rejects.toThrow(/sendMessage failed/i);
  });
});

// ---------------------------------------------------------------------------
// MESSAGING_NODES export
// ---------------------------------------------------------------------------
describe("MESSAGING_NODES", () => {
  it("exports all 4 nodes", () => {
    expect(MESSAGING_NODES).toHaveLength(4);
    const types = MESSAGING_NODES.map((n) => n.nodeType);
    expect(types).toContain("messaging.discord.DiscordBotTrigger");
    expect(types).toContain("messaging.discord.DiscordSendMessage");
    expect(types).toContain("messaging.telegram.TelegramBotTrigger");
    expect(types).toContain("messaging.telegram.TelegramSendMessage");
  });
});
