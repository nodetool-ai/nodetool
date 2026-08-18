/**
 * Bot commands (design §7). They never reach the LLM: each one is answered
 * here, from the identity layer and the router's own state.
 *
 * The handlers are I/O-free apart from the collaborators handed to them, so
 * every command is a unit test rather than a live Telegram session.
 */

import type {
  DeepLinkResult,
  IdentityResolution,
  LinkStart
} from "./identity-client.js";
import type { BotCommandSpec } from "./bot-api.js";

/** The identity calls the commands make. A subset of `IdentityClient`. */
export interface CommandIdentity {
  resolve(externalId: string): Promise<IdentityResolution>;
  linkStart(externalId: string): Promise<LinkStart>;
  completeDeepLink(externalId: string, code: string): Promise<DeepLinkResult>;
  unlink(externalId: string): Promise<boolean>;
}

/** The router state the commands read. A subset of `TurnRouter`. */
export interface CommandRouter {
  stop(chatId: string): boolean;
  newThread(chatId: string): string | null;
  currentThreadId(chatId: string): string | null;
  queueDepth(chatId: string): number;
  isRunning(chatId: string): boolean;
}

export interface CommandDeps {
  readonly identity: CommandIdentity;
  readonly router: CommandRouter;
  /** NodeTool server base URL, for the `/status` health probe. */
  readonly apiUrl: string;
  readonly fetch: typeof fetch;
  /** Telegram ids allowed to link. Empty = anyone. */
  readonly allowUsers: readonly string[];
}

export interface CommandInput {
  /** Command name without the leading slash, lowercased, `@bot` stripped. */
  readonly command: string;
  /** Everything after the command word, trimmed. */
  readonly args: string;
  readonly chatId: string;
  readonly telegramUserId: string;
}

export interface CommandOutcome {
  /** Lines to send back, in order. Empty means the command answered silently. */
  readonly replies: readonly string[];
}

/** Commands anyone may run; the rest need a linked account (design §4). */
export const PUBLIC_COMMANDS: ReadonlySet<string> = new Set(["start", "link", "status"]);

/** What `setMyCommands` registers, so the commands autocomplete in Telegram. */
export const BOT_COMMANDS: readonly BotCommandSpec[] = [
  { command: "start", description: "Welcome and link state" },
  { command: "link", description: "Link this Telegram account to NodeTool" },
  { command: "unlink", description: "Unlink this Telegram account" },
  { command: "new", description: "Start a fresh conversation thread" },
  { command: "stop", description: "Cancel the turn that is running" },
  { command: "status", description: "Server connectivity, link state, queue depth" }
];

export const MESSAGES = {
  welcome:
    "I am NodeTool. Message me and I run the turn on your own NodeTool " +
    "account — your tools, your assets, your budget.",
  linkPrompt:
    "This Telegram account is not linked to a NodeTool user yet. Send /link " +
    "and open the URL I answer with.",
  notAllowed:
    "This bot is restricted to a configured list of Telegram accounts, and " +
    "yours is not on it.",
  groupDecline: "I work in private chat for now.",
  busy: "Still working on your previous message — send it again when I am done.",
  unknownCommand: "I do not know that command. Try /status.",
  needsLink: "That command needs a linked NodeTool account. Send /link first.",
  nothingRunning: "Nothing is running in this chat.",
  stopping: "⏹ stopping",
  unsupportedMedia:
    "I only handle text for now — photos, documents and voice notes arrive in " +
    "the next milestone."
} as const;

function linkInstructions(start: LinkStart): string {
  const expiry = start.expiresAt === null ? "" : `\nThe link expires at ${start.expiresAt}.`;
  return `Open this link while signed in to NodeTool to finish linking:\n${start.url}${expiry}`;
}

function describeIdentity(resolution: IdentityResolution): string {
  if (!resolution.unlinked) {
    return `Linked to NodeTool user ${resolution.userId}.`;
  }
  return resolution.reason === "local-mode"
    ? `This server is single-user; you are already in. (${resolution.message})`
    : "Not linked.";
}

async function probeHealth(deps: CommandDeps): Promise<string> {
  try {
    const response = await deps.fetch(`${deps.apiUrl}/health`, { method: "GET" });
    if (!response.ok) {
      return `unreachable (HTTP ${response.status})`;
    }
    const body: unknown = await response.json().catch(() => null);
    const status =
      typeof body === "object" && body !== null && "status" in body
        ? String((body as { status: unknown }).status)
        : "ok";
    return `${status} at ${deps.apiUrl}`;
  } catch (err) {
    return `unreachable (${(err as Error).message})`;
  }
}

/**
 * Whether this Telegram user is allowed to use the bot at all. An empty
 * allowlist means anyone may link (design §4).
 */
export function isAllowedUser(allowUsers: readonly string[], telegramUserId: string): boolean {
  return allowUsers.length === 0 || allowUsers.includes(telegramUserId);
}

/** Parse a `/command@bot args` message into its parts, or null when it is not one. */
export function parseCommand(
  text: string,
  entities?: readonly { type: string; offset: number; length: number }[]
): { command: string; args: string } | null {
  const isCommand =
    entities?.some((entity) => entity.type === "bot_command" && entity.offset === 0) === true ||
    text.startsWith("/");
  if (!isCommand) {
    return null;
  }
  const match = /^\/([A-Za-z0-9_]+)(?:@[A-Za-z0-9_]+)?\s*([\s\S]*)$/.exec(text.trim());
  if (!match) {
    return null;
  }
  return { command: match[1].toLowerCase(), args: match[2].trim() };
}

async function handleStart(deps: CommandDeps, input: CommandInput): Promise<CommandOutcome> {
  if (input.args.length === 0) {
    const resolution = await deps.identity.resolve(input.telegramUserId);
    return { replies: [`${MESSAGES.welcome}\n\n${describeIdentity(resolution)}`] };
  }

  const result = await deps.identity.completeDeepLink(input.telegramUserId, input.args);
  if (result.ok) {
    return { replies: ["Linked. Send me a message and I will run it on your account."] };
  }
  if (result.reason === "expired") {
    return { replies: [`${result.message}\nSend /link to start again.`] };
  }
  if (result.reason === "mismatch") {
    return { replies: [result.message] };
  }
  // The deep-link direction the server cannot express yet: fall back to the
  // bot-initiated flow rather than leaving the user with a dead code.
  const start = await deps.identity.linkStart(input.telegramUserId);
  return {
    replies: [
      `${MESSAGES.welcome}\n\nThat start link could not be completed from here.\n` +
        linkInstructions(start)
    ]
  };
}

async function handleLink(deps: CommandDeps, input: CommandInput): Promise<CommandOutcome> {
  const resolution = await deps.identity.resolve(input.telegramUserId);
  if (!resolution.unlinked) {
    return { replies: [`Already linked to NodeTool user ${resolution.userId}.`] };
  }
  if (resolution.reason === "local-mode") {
    return { replies: [describeIdentity(resolution)] };
  }
  const start = await deps.identity.linkStart(input.telegramUserId);
  return { replies: [linkInstructions(start)] };
}

async function handleUnlink(deps: CommandDeps, input: CommandInput): Promise<CommandOutcome> {
  const unlinked = await deps.identity.unlink(input.telegramUserId);
  return {
    replies: [unlinked ? "Unlinked. Send /link to connect again." : "This account was not linked."]
  };
}

async function handleStatus(deps: CommandDeps, input: CommandInput): Promise<CommandOutcome> {
  const health = await probeHealth(deps);
  let link: string;
  try {
    link = describeIdentity(await deps.identity.resolve(input.telegramUserId));
  } catch (err) {
    link = `unknown (${(err as Error).message})`;
  }
  const thread = deps.router.currentThreadId(input.chatId) ?? "none yet";
  const lines = [
    `Server: ${health}`,
    `Account: ${link}`,
    `Thread: ${thread}`,
    `Turn: ${deps.router.isRunning(input.chatId) ? "running" : "idle"}`,
    `Queued: ${deps.router.queueDepth(input.chatId)}`
  ];
  return { replies: [lines.join("\n")] };
}

/**
 * Run one command.
 *
 * @returns the replies to send. Commands that need an account are refused
 * before any work when the account is not linked.
 */
export async function handleCommand(
  deps: CommandDeps,
  input: CommandInput
): Promise<CommandOutcome> {
  if (!isAllowedUser(deps.allowUsers, input.telegramUserId)) {
    return { replies: [MESSAGES.notAllowed] };
  }

  switch (input.command) {
    case "start":
      return handleStart(deps, input);
    case "link":
      return handleLink(deps, input);
    case "status":
      return handleStatus(deps, input);
    case "unlink":
    case "new":
    case "stop":
      break;
    default:
      return { replies: [MESSAGES.unknownCommand] };
  }

  const resolution = await deps.identity.resolve(input.telegramUserId);
  if (resolution.unlinked && resolution.reason === "not-linked") {
    return { replies: [MESSAGES.needsLink] };
  }

  switch (input.command) {
    case "unlink":
      return handleUnlink(deps, input);
    case "new": {
      const threadId = deps.router.newThread(input.chatId);
      return {
        replies: [
          threadId === null
            ? "No conversation here yet — your next message starts a fresh thread."
            : `New thread: ${threadId}`
        ]
      };
    }
    default:
      return {
        replies: [deps.router.stop(input.chatId) ? MESSAGES.stopping : MESSAGES.nothingRunning]
      };
  }
}
