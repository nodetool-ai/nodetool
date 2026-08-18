/**
 * @nodetool-ai/telegram — the Telegram bridge.
 *
 * A bridge process, not a second agent runtime: it translates Telegram updates
 * into `chat_message` commands on the NodeTool server's `/ws` chat protocol and
 * the resulting frames back into Telegram messages. The agent loop, tools,
 * permissions, thread persistence and cost tracking stay on the server.
 *
 * See `docs/telegram-bot-design.md`.
 */

export {
  loadConfig,
  TelegramConfigError,
  DEFAULT_API_URL,
  DEFAULT_CONFIG_FILE,
  DEFAULT_EDIT_THROTTLE_MS,
  DEFAULT_MAX_QUEUED_TURNS
} from "./config.js";
export type {
  TelegramBotConfig,
  TelegramBotFileConfig,
  LoadConfigOptions
} from "./config.js";

export { chunkText, splitOnce, DEFAULT_CHUNK_MAX, TELEGRAM_MESSAGE_LIMIT } from "./chunk.js";

export { markdownToTelegramHtml, escapeHtml } from "./markdown-html.js";
export type { TelegramHtmlResult } from "./markdown-html.js";

export {
  createRendererState,
  foldFrame,
  foldFrames,
  collectAssetRefs
} from "./frame-renderer.js";
export type {
  RenderOp,
  RenderTarget,
  ParseMode,
  TypingOp,
  SendOp,
  EditOp,
  FinalizeOp,
  AttachOp,
  StopNoteOp,
  AssetAttachment,
  RenderFrame,
  FrameEnvelope,
  FinalMessageFrame,
  GenerationStoppedFrame,
  RendererState,
  RendererOptions,
  FoldResult
} from "./frame-renderer.js";

export {
  IdentityClient,
  IdentityError,
  TELEGRAM_PROVIDER,
  TOKEN_EXPIRY_SLACK_MS
} from "./identity-client.js";
export type {
  IdentityClientOptions,
  IdentityResolution,
  LinkedIdentity,
  UnlinkedIdentity,
  UnlinkedReason,
  LinkStart,
  DeepLinkResult
} from "./identity-client.js";

export {
  TurnRouter,
  deriveThreadId,
  highestThreadIndex,
  userHash8
} from "./turn-router.js";
export type {
  BridgeChatSocket,
  BridgeClient,
  BridgeSendOptions,
  DeliveryContext,
  ExecuteOps,
  IdentityResolver,
  MakeBridgeClient,
  SubmitInput,
  SubmitResult,
  TurnRouterConfig,
  TurnRouterOptions
} from "./turn-router.js";

export {
  BotApi,
  BotApiError,
  TELEGRAM_API_BASE,
  TELEGRAM_UPLOAD_LIMIT_BYTES
} from "./bot-api.js";
export type {
  BotApiOptions,
  BotCommandSpec,
  TelegramCallbackQuery,
  TelegramMessage,
  TelegramUpdate
} from "./bot-api.js";

export {
  TelegramAdapter,
  POLL_TIMEOUT_SECONDS,
  STOP_CALLBACK_DATA
} from "./telegram-adapter.js";
export type {
  AdapterConfig,
  PollStopReason,
  ResolveAsset,
  ResolvedAsset,
  TelegramAdapterOptions
} from "./telegram-adapter.js";

export {
  BOT_COMMANDS,
  MESSAGES,
  PUBLIC_COMMANDS,
  handleCommand,
  isAllowedUser,
  parseCommand
} from "./commands.js";
export type {
  CommandDeps,
  CommandIdentity,
  CommandInput,
  CommandOutcome,
  CommandRouter
} from "./commands.js";

export { registerCommands } from "./register-commands.js";
export type { RegisterCommandsOptions } from "./register-commands.js";

export {
  assetIdOf,
  createAssetResolver,
  createBridgeClientFactory,
  wrapChatSocket
} from "./nodetool-client.js";

import type { TelegramBotConfig } from "./config.js";
import { BotApi } from "./bot-api.js";
import { IdentityClient } from "./identity-client.js";
import { TelegramAdapter, type PollStopReason } from "./telegram-adapter.js";
import { TurnRouter } from "./turn-router.js";
import { createAssetResolver, createBridgeClientFactory } from "./nodetool-client.js";

/** A running bridge. Returned by {@link startTelegramBot}. */
export interface TelegramBotHandle {
  /** Stop polling and close every open socket. */
  readonly stop: () => Promise<void>;
  /** Resolves when the poll loop ends, with why it ended. */
  readonly finished: Promise<PollStopReason>;
}

export interface StartTelegramBotOptions {
  /** Injected for tests; defaults to the global `fetch`. */
  readonly fetch?: typeof fetch;
  /** Bot API base URL, for tests. */
  readonly botApiBaseUrl?: string;
}

/**
 * Start the bridge against a running NodeTool server.
 *
 * Long polling only: webhook mode is M3 (design §3), and config already
 * validates the URL/secret pair, so a webhook-configured process is refused
 * here rather than silently polling.
 */
export function startTelegramBot(
  config: TelegramBotConfig,
  options: StartTelegramBotOptions = {}
): TelegramBotHandle {
  if (config.webhookUrl !== null) {
    throw new Error(
      "TELEGRAM_WEBHOOK_URL is set, but webhook mode arrives in M3. Unset it " +
        "to run the bridge in long-polling mode."
    );
  }

  const fetchImpl = options.fetch ?? fetch;
  const apiInit: { botToken: string; fetch: typeof fetch; baseUrl?: string } = {
    botToken: config.botToken,
    fetch: fetchImpl
  };
  if (options.botApiBaseUrl !== undefined) {
    apiInit.baseUrl = options.botApiBaseUrl;
  }
  const api = new BotApi(apiInit);
  const identity = new IdentityClient({
    apiUrl: config.apiUrl,
    integrationToken: config.integrationToken,
    fetch: fetchImpl
  });

  // The adapter executes the router's ops, and the router routes the adapter's
  // messages: the two are wired through a mutable slot so neither needs the
  // other at construction.
  let adapter: TelegramAdapter | null = null;
  const router = new TurnRouter({
    identity,
    makeClient: createBridgeClientFactory({ apiUrl: config.apiUrl, fetch: fetchImpl }),
    config: {
      editThrottleMs: config.editThrottleMs,
      maxQueuedTurns: config.maxQueuedTurns,
      permissionMode: "auto"
    },
    executeOps: (context, ops) => adapter?.executeOps(context, ops)
  });

  adapter = new TelegramAdapter({
    api,
    identity,
    router,
    config: { allowUsers: config.allowUsers, apiUrl: config.apiUrl },
    fetch: fetchImpl,
    resolveAsset: createAssetResolver({ apiUrl: config.apiUrl, fetch: fetchImpl })
  });

  const started = adapter;
  const finished = started.poll();
  return {
    finished,
    stop: async () => {
      started.stop();
      router.close();
      await started.flush();
    }
  };
}

/** Stop a running bridge. */
export function stopTelegramBot(handle: TelegramBotHandle): Promise<void> {
  return handle.stop();
}
