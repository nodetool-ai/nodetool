import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_API_URL,
  DEFAULT_EDIT_THROTTLE_MS,
  DEFAULT_MAX_QUEUED_TURNS,
  TelegramConfigError,
  loadConfig
} from "../src/config.js";

const validEnv = {
  TELEGRAM_BOT_TOKEN: "123:abc",
  NODETOOL_INTEGRATION_TOKEN: "service-token"
};

function writeConfig(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "nodetool-telegram-"));
  const path = join(dir, "telegram-bot.json");
  writeFileSync(path, contents, "utf8");
  return path;
}

describe("loadConfig", () => {
  it("applies the documented defaults", () => {
    const config = loadConfig({ env: validEnv, fileConfig: {} });
    expect(config).toEqual({
      botToken: "123:abc",
      apiUrl: DEFAULT_API_URL,
      integrationToken: "service-token",
      webhookUrl: null,
      webhookSecret: null,
      allowUsers: [],
      editThrottleMs: DEFAULT_EDIT_THROTTLE_MS,
      maxQueuedTurns: DEFAULT_MAX_QUEUED_TURNS
    });
    expect(DEFAULT_EDIT_THROTTLE_MS).toBe(1500);
    expect(DEFAULT_MAX_QUEUED_TURNS).toBe(3);
  });

  it("names the missing field", () => {
    expect(() => loadConfig({ env: {}, fileConfig: {} })).toThrow(TelegramConfigError);
    try {
      loadConfig({ env: {}, fileConfig: {} });
    } catch (err) {
      const error = err as TelegramConfigError;
      expect(error.fields).toContain("TELEGRAM_BOT_TOKEN");
      expect(error.fields).toContain("NODETOOL_INTEGRATION_TOKEN");
      expect(error.message).toContain("TELEGRAM_BOT_TOKEN is required");
    }
  });

  it("treats an empty string as missing", () => {
    expect(() => loadConfig({ env: { ...validEnv, TELEGRAM_BOT_TOKEN: "  " }, fileConfig: {} })).toThrow(
      /TELEGRAM_BOT_TOKEN is required/
    );
  });

  it("rejects a non-URL api url", () => {
    expect(() =>
      loadConfig({ env: { ...validEnv, NODETOOL_API_URL: "localhost:7777" }, fileConfig: {} })
    ).toThrow(/NODETOOL_API_URL: must be an absolute http\(s\) URL/);
  });

  it("strips a trailing slash from the api url", () => {
    const config = loadConfig({
      env: { ...validEnv, NODETOOL_API_URL: "https://api.nodetool.ai/" },
      fileConfig: {}
    });
    expect(config.apiUrl).toBe("https://api.nodetool.ai");
  });

  it("requires the webhook secret only in webhook mode", () => {
    expect(() =>
      loadConfig({
        env: { ...validEnv, TELEGRAM_WEBHOOK_URL: "https://bot.test/hook" },
        fileConfig: {}
      })
    ).toThrow(/TELEGRAM_WEBHOOK_SECRET: is required when TELEGRAM_WEBHOOK_URL is set/);

    const config = loadConfig({
      env: {
        ...validEnv,
        TELEGRAM_WEBHOOK_URL: "https://bot.test/hook",
        TELEGRAM_WEBHOOK_SECRET: "s3cret"
      },
      fileConfig: {}
    });
    expect(config.webhookUrl).toBe("https://bot.test/hook");
    expect(config.webhookSecret).toBe("s3cret");
  });

  it("reads overrides from telegram-bot.json", () => {
    const path = writeConfig(
      JSON.stringify({ allowUsers: ["12345"], editThrottleMs: 800, maxQueuedTurns: 1 })
    );
    const config = loadConfig({ env: validEnv, configPath: path });
    expect(config.allowUsers).toEqual(["12345"]);
    expect(config.editThrottleMs).toBe(800);
    expect(config.maxQueuedTurns).toBe(1);
  });

  it("names the offending field in the json file", () => {
    const path = writeConfig(JSON.stringify({ editThrottleMs: -5 }));
    try {
      loadConfig({ env: validEnv, configPath: path });
      throw new Error("expected loadConfig to throw");
    } catch (err) {
      const error = err as TelegramConfigError;
      expect(error).toBeInstanceOf(TelegramConfigError);
      expect(error.fields).toContain("editThrottleMs");
    }
  });

  it("reports malformed json without a stack of zod noise", () => {
    const path = writeConfig("{ not json");
    expect(() => loadConfig({ env: validEnv, configPath: path })).toThrow(/is not valid JSON/);
  });

  it("fails when an explicitly named config file is missing", () => {
    expect(() =>
      loadConfig({ env: validEnv, configPath: join(tmpdir(), "definitely-absent.json") })
    ).toThrow(/Cannot read/);
  });

  it("tolerates a missing config file at the default path", () => {
    const config = loadConfig({ env: validEnv });
    expect(config.maxQueuedTurns).toBe(DEFAULT_MAX_QUEUED_TURNS);
  });
});
