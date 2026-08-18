/**
 * Bridge configuration: environment variables plus an optional
 * `telegram-bot.json`, validated at the boundary (design §11).
 *
 * Everything the bridge needs to reach Telegram and the NodeTool server is an
 * env var; the JSON file carries only the tuning knobs an operator changes
 * without redeploying. Both are parsed with zod so a bad value fails at
 * startup naming the field, not on the first message.
 */

import { readFileSync } from "node:fs";
import { trimTrailingSlashes } from "./strings.js";
import { z } from "zod";

/** Fully resolved bridge configuration. */
export interface TelegramBotConfig {
  /** Bot token from @BotFather. */
  readonly botToken: string;
  /** Base URL of the NodeTool server, no trailing slash. */
  readonly apiUrl: string;
  /** Service token the server recognizes as the messaging integration. */
  readonly integrationToken: string;
  /** Set = webhook mode; unset = long polling. */
  readonly webhookUrl: string | null;
  /** Verified against `X-Telegram-Bot-Api-Secret-Token`; set iff webhook mode. */
  readonly webhookSecret: string | null;
  /** Telegram user ids allowed to link. Empty = anyone. */
  readonly allowUsers: readonly string[];
  /** Minimum gap between `editMessageText` calls on one conversation. */
  readonly editThrottleMs: number;
  /** Messages queued behind an in-flight turn before the bot answers busy. */
  readonly maxQueuedTurns: number;
}

/** Thrown when env or file config is missing or malformed. */
export class TelegramConfigError extends Error {
  /** Field names that failed, in the order reported. */
  readonly fields: readonly string[];

  constructor(message: string, fields: readonly string[]) {
    super(message);
    this.name = "TelegramConfigError";
    this.fields = fields;
  }
}

export const DEFAULT_API_URL = "http://127.0.0.1:7777";
export const DEFAULT_EDIT_THROTTLE_MS = 1500;
export const DEFAULT_MAX_QUEUED_TURNS = 3;
export const DEFAULT_CONFIG_FILE = "telegram-bot.json";

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const required = (field: string) =>
  z
    .string({ error: `${field} is required` })
    .trim()
    .min(1, { error: `${field} is required` });

const optional = z
  .string()
  .trim()
  .min(1)
  .nullish()
  .transform((v) => v ?? null);

const envSchema = z
  .object({
    TELEGRAM_BOT_TOKEN: required("TELEGRAM_BOT_TOKEN"),
    NODETOOL_API_URL: z
      .string()
      .trim()
      .min(1)
      .nullish()
      .transform((v) => (v == null || v === "" ? DEFAULT_API_URL : v))
      .refine(isHttpUrl, { error: "must be an absolute http(s) URL" }),
    NODETOOL_INTEGRATION_TOKEN: required("NODETOOL_INTEGRATION_TOKEN"),
    TELEGRAM_WEBHOOK_URL: optional.refine((v) => v === null || isHttpUrl(v), {
      error: "must be an absolute http(s) URL"
    }),
    TELEGRAM_WEBHOOK_SECRET: optional
  })
  .superRefine((value, ctx) => {
    if (value.TELEGRAM_WEBHOOK_URL !== null && value.TELEGRAM_WEBHOOK_SECRET === null) {
      ctx.addIssue({
        code: "custom",
        path: ["TELEGRAM_WEBHOOK_SECRET"],
        message: "is required when TELEGRAM_WEBHOOK_URL is set (webhook mode)"
      });
    }
  });

const fileSchema = z.object({
  allowUsers: z.array(z.string().trim().min(1)).default([]),
  editThrottleMs: z.number().int().positive().default(DEFAULT_EDIT_THROTTLE_MS),
  maxQueuedTurns: z.number().int().positive().default(DEFAULT_MAX_QUEUED_TURNS)
});

/** The `telegram-bot.json` shape, all keys optional. */
export type TelegramBotFileConfig = z.infer<typeof fileSchema>;

export interface LoadConfigOptions {
  /** Environment to read. Defaults to `process.env`. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /**
   * Path to `telegram-bot.json`. A missing file at the default path is not an
   * error; a missing file at an explicitly requested path is.
   */
  readonly configPath?: string;
  /** Already-parsed file config, for callers that hold it in memory. */
  readonly fileConfig?: unknown;
}

function fail(prefix: string, error: z.ZodError): never {
  const issues = error.issues.map((issue) => {
    const field = issue.path.join(".");
    return field.length > 0 ? `${field}: ${issue.message}` : issue.message;
  });
  const fields = error.issues.map((issue) => issue.path.join("."));
  throw new TelegramConfigError(`${prefix}\n  ${issues.join("\n  ")}`, fields);
}

function readFileConfig(options: LoadConfigOptions): unknown {
  if (options.fileConfig !== undefined) {
    return options.fileConfig;
  }
  const path = options.configPath ?? DEFAULT_CONFIG_FILE;
  const explicit = options.configPath !== undefined;
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if (!explicit && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw new TelegramConfigError(
      `Cannot read ${path}: ${(err as Error).message}`,
      [path]
    );
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (err) {
    throw new TelegramConfigError(
      `${path} is not valid JSON: ${(err as Error).message}`,
      [path]
    );
  }
}

/**
 * Read and validate the bridge configuration.
 *
 * @throws {TelegramConfigError} naming every offending field.
 */
export function loadConfig(options: LoadConfigOptions = {}): TelegramBotConfig {
  const env = options.env ?? process.env;
  const fileParsed = fileSchema.safeParse(readFileConfig(options));
  if (!fileParsed.success) {
    fail("Invalid telegram-bot.json:", fileParsed.error);
  }

  const envParsed = envSchema.safeParse({
    TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
    NODETOOL_API_URL: env.NODETOOL_API_URL,
    NODETOOL_INTEGRATION_TOKEN: env.NODETOOL_INTEGRATION_TOKEN,
    TELEGRAM_WEBHOOK_URL: env.TELEGRAM_WEBHOOK_URL,
    TELEGRAM_WEBHOOK_SECRET: env.TELEGRAM_WEBHOOK_SECRET
  });
  if (!envParsed.success) {
    fail("Invalid Telegram bridge environment:", envParsed.error);
  }

  return {
    botToken: envParsed.data.TELEGRAM_BOT_TOKEN,
    apiUrl: trimTrailingSlashes(envParsed.data.NODETOOL_API_URL),
    integrationToken: envParsed.data.NODETOOL_INTEGRATION_TOKEN,
    webhookUrl: envParsed.data.TELEGRAM_WEBHOOK_URL,
    webhookSecret: envParsed.data.TELEGRAM_WEBHOOK_SECRET,
    allowUsers: fileParsed.data.allowUsers,
    editThrottleMs: fileParsed.data.editThrottleMs,
    maxQueuedTurns: fileParsed.data.maxQueuedTurns
  };
}
