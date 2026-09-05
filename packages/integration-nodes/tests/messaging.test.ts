import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { getNodeMetadata } from "@nodetool-ai/node-sdk";
import {
  DiscordBotTrigger,
  TelegramBotTrigger,
  MESSAGING_NODES
} from "@nodetool-ai/integration-nodes";

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
// MESSAGING_NODES export
// ---------------------------------------------------------------------------
describe("MESSAGING_NODES", () => {
  it("exports both trigger nodes", () => {
    expect(MESSAGING_NODES).toHaveLength(2);
    const types = MESSAGING_NODES.map((n) => n.nodeType);
    expect(types).toContain("messaging.discord.DiscordBotTrigger");
    expect(types).toContain("messaging.telegram.TelegramBotTrigger");
  });
});


// ---------------------------------------------------------------------------
// Declared props must be wired
// ---------------------------------------------------------------------------
describe("trigger props the stub never reads", () => {
  const propNames = (NodeCls: any): string[] =>
    getNodeMetadata(NodeCls).properties.map((p) => p.name);

  it("DiscordBotTrigger declares no max_events", () => {
    expect(propNames(DiscordBotTrigger)).not.toContain("max_events");
  });

  it("TelegramBotTrigger declares no polling knobs", () => {
    const names = propNames(TelegramBotTrigger);
    expect(names).not.toContain("max_events");
    expect(names).not.toContain("poll_timeout_seconds");
    expect(names).not.toContain("poll_interval_seconds");
  });

  it("keeps the props process() actually reads", () => {
    expect(propNames(DiscordBotTrigger)).toEqual(
      expect.arrayContaining(["token", "channel_id", "allow_bot_messages"])
    );
    expect(propNames(TelegramBotTrigger)).toEqual(
      expect.arrayContaining([
        "token",
        "chat_id",
        "allow_bot_messages",
        "include_edited_messages"
      ])
    );
  });
});
