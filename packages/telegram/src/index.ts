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

import type { TelegramBotConfig } from "./config.js";

/** A running bridge. Returned by {@link startTelegramBot}. */
export interface TelegramBotHandle {
  /** Stop polling (or the webhook server) and close every open socket. */
  readonly stop: () => Promise<void>;
}

/**
 * Start the bridge against a running NodeTool server.
 *
 * Not implemented yet — the adapter, identity client and turn router land in
 * M2 tasks T2.5–T2.9. The pure core above (config, chunker, markdown, frame
 * renderer) is complete and exported for them to build on.
 */
export function startTelegramBot(_config: TelegramBotConfig): Promise<TelegramBotHandle> {
  throw new Error(
    "startTelegramBot is not implemented yet (M2 T2.5–T2.9: identity client, turn router, adapter)"
  );
}

/** Stop a running bridge. Not implemented yet — see {@link startTelegramBot}. */
export function stopTelegramBot(_handle: TelegramBotHandle): Promise<void> {
  throw new Error(
    "stopTelegramBot is not implemented yet (M2 T2.5–T2.9: identity client, turn router, adapter)"
  );
}
