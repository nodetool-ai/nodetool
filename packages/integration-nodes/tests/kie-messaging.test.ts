import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { getNodeMetadata } from "@nodetool-ai/node-sdk";
import {
  DiscordBotTrigger,
  TelegramBotTrigger
} from "@nodetool-ai/integration-nodes";

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

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

// ── DiscordBotTrigger ──────────────────────────────────────────────────────

describe("DiscordBotTrigger", () => {
  it("returns configured status with bot info", async () => {
    const node = new DiscordBotTrigger();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "123", username: "TestBot" })
    );

    node.assign({
      token: "bot-token",
      channel_id: "456"
    });

    const result = await node.process();
    expect(result.status).toBe("configured");
    expect(result.bot_id).toBe("123");
    expect(result.bot_username).toBe("TestBot");
    expect(result.channel_id).toBe("456");
    expect(result.allow_bot_messages).toBe(false);
  });

  it("uses token from _secrets", async () => {
    const node = new DiscordBotTrigger();
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "1", username: "Bot" }));
    node.setDynamic("_secrets", { DISCORD_BOT_TOKEN: "secret-token" });
    const result = await node.process();
    expect(result.status).toBe("configured");
    const headers = mockFetch.mock.calls[0][1]?.headers ?? {};
    // The fetch is called with just the URL and headers object
    expect(mockFetch.mock.calls[0][0]).toContain("discord.com");
  });

  it("throws when no token", async () => {
    const node = new DiscordBotTrigger();
    node.assign({});
    await expect(node.process()).rejects.toThrow(
      "Discord bot token is required"
    );
  });

  it("throws on API validation failure", async () => {
    const node = new DiscordBotTrigger();
    mockFetch.mockResolvedValueOnce(jsonResponse("Unauthorized", 401));

    node.assign({
      token: "bad-token"
    });

    await expect(node.process()).rejects.toThrow(
      "Discord token validation failed (401)"
    );
  });
});

// ── TelegramBotTrigger ─────────────────────────────────────────────────────

describe("TelegramBotTrigger", () => {
  it("returns configured status with bot info", async () => {
    const node = new TelegramBotTrigger();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        result: { id: 789, username: "test_bot" }
      })
    );

    node.assign({
      token: "tg-token",
      chat_id: 12345
    });

    const result = await node.process();
    expect(result.status).toBe("configured");
    expect(result.bot_id).toBe(789);
    expect(result.bot_username).toBe("test_bot");
    expect(result.chat_id).toBe(12345);
  });

  it("returns null chat_id when 0", async () => {
    const node = new TelegramBotTrigger();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        result: { id: 1, username: "bot" }
      })
    );

    node.assign({
      token: "tok"
    });

    const result = await node.process();
    expect(result.chat_id).toBeNull();
  });

  it("uses token from _secrets", async () => {
    const node = new TelegramBotTrigger();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        result: { id: 1, username: "bot" }
      })
    );
    node.setDynamic("_secrets", { TELEGRAM_BOT_TOKEN: "secret-tg" });
    await node.process();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("botsecret-tg");
  });

  it("throws when no token", async () => {
    const node = new TelegramBotTrigger();
    node.assign({});
    await expect(node.process()).rejects.toThrow(
      "Telegram bot token is required"
    );
  });

  it("throws on HTTP validation failure", async () => {
    const node = new TelegramBotTrigger();
    mockFetch.mockResolvedValueOnce(jsonResponse("bad token", 401));

    node.assign({
      token: "bad"
    });

    await expect(node.process()).rejects.toThrow(
      "Telegram token validation failed (401)"
    );
  });

  it("throws when getMe returns ok: false", async () => {
    const node = new TelegramBotTrigger();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ ok: false, description: "Not found" })
    );

    node.assign({
      token: "tok"
    });

    await expect(node.process()).rejects.toThrow("Telegram getMe failed");
  });
});

// ── Defaults coverage ────────────────────────────────────────────────────

describe("Node defaults coverage", () => {
  it("DiscordBotTrigger defaults", () => {
    expectMetadataDefaults(DiscordBotTrigger);
  });

  it("TelegramBotTrigger defaults", () => {
    expectMetadataDefaults(TelegramBotTrigger);
  });
});
