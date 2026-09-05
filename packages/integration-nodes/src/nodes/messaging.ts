import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { InputMode, OutputCorrelation } from "@nodetool-ai/protocol";
import { tagAsServer } from "@nodetool-ai/nodes-utils";

export class DiscordBotTrigger extends BaseNode {
  static readonly nodeType = "messaging.discord.DiscordBotTrigger";
  static readonly title = "Discord Bot Trigger";
  static readonly inlineFields = [];
  static readonly inputFields = [];
  static readonly description =
    "Listen for Discord messages from a bot account and emit them as events.\n    discord, trigger, bot, messages, chat, events, listen";
  static readonly metadataOutputTypes = {
    message_id: "int",
    content: "str",
    author: "dict[str, any]",
    channel: "dict[str, any]",
    guild: "dict[str, any]",
    attachments: "list[dict[str, any]]",
    timestamp: "str",
    source: "str",
    event_type: "str"
  };
  static readonly requiredSettings = ["DISCORD_BOT_TOKEN"];

  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation = {
    message_id: { kind: "iteration", source: "__execution__", group: "messages" },
    content: { kind: "iteration", source: "__execution__", group: "messages" },
    author: { kind: "iteration", source: "__execution__", group: "messages" },
    channel: { kind: "iteration", source: "__execution__", group: "messages" },
    guild: { kind: "iteration", source: "__execution__", group: "messages" },
    attachments: { kind: "iteration", source: "__execution__", group: "messages" },
    timestamp: { kind: "iteration", source: "__execution__", group: "messages" },
    source: { kind: "iteration", source: "__execution__", group: "messages" },
    event_type: { kind: "iteration", source: "__execution__", group: "messages" }
  } satisfies Record<string, OutputCorrelation>;

  @prop({
    type: "int",
    default: 0,
    title: "Max Events",
    description: "Maximum number of events to process (0 = unlimited)",
    min: 0
  })
  declare max_events: number;

  @prop({
    type: "str",
    default: "",
    title: "Token",
    description: "Discord bot token"
  })
  declare token: string;

  @prop({
    type: "str",
    default: null,
    title: "Channel Id",
    description: "Optional channel ID to filter messages"
  })
  declare channel_id: string | null;

  @prop({
    type: "bool",
    default: false,
    title: "Allow Bot Messages",
    description: "Include messages authored by bots"
  })
  declare allow_bot_messages: boolean;

  async process(): Promise<Record<string, unknown>> {
    const secrets = this._secrets;
    const token = this.token || secrets.DISCORD_BOT_TOKEN || "";
    const channelId = this.channel_id ?? "";
    const allowBotMessages = this.allow_bot_messages;

    if (!token) {
      throw new Error("Discord bot token is required");
    }

    // Validate the bot token by fetching the bot user info
    const resp = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${token}` }
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(
        `Discord token validation failed (${resp.status}): ${body}`
      );
    }

    const botUser = (await resp.json()) as Record<string, unknown>;

    // NOTE: Real-time message listening requires a Discord Gateway WebSocket
    // connection (wss://gateway.discord.gg), which is not implemented here.
    // A full implementation would need:
    // 1. WebSocket connection to the Gateway with heartbeat
    // 2. Identify/resume handshake with intents (MESSAGE_CONTENT)
    // 3. Long-lived connection for dispatched MESSAGE_CREATE events
    // As a simpler alternative, the Discord REST API supports fetching
    // channel message history via GET /channels/{id}/messages, which could
    // be used for polling-based triggers.
    // For now, this node only validates the token and returns bot info.

    return {
      status: "configured",
      bot_id: botUser.id,
      bot_username: botUser.username,
      channel_id: channelId,
      allow_bot_messages: allowBotMessages
    };
  }
}

export class TelegramBotTrigger extends BaseNode {
  static readonly nodeType = "messaging.telegram.TelegramBotTrigger";
  static readonly title = "Telegram Bot Trigger";
  static readonly inlineFields = [];
  static readonly inputFields = [];
  static readonly description =
    "Listen for Telegram messages using long polling and emit them as events.\n    telegram, trigger, bot, messages, chat, events, listen";
  static readonly metadataOutputTypes = {
    update_id: "int",
    update_type: "str",
    message_id: "int",
    text: "str",
    caption: "str",
    entities: "list[dict[str, any]]",
    chat: "dict[str, any]",
    from_user: "dict[str, any]",
    attachments: "list[dict[str, any]]",
    timestamp: "str",
    source: "str",
    event_type: "str"
  };
  static readonly requiredSettings = ["TELEGRAM_BOT_TOKEN"];

  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation = {
    update_id: { kind: "iteration", source: "__execution__", group: "messages" },
    update_type: { kind: "iteration", source: "__execution__", group: "messages" },
    message_id: { kind: "iteration", source: "__execution__", group: "messages" },
    text: { kind: "iteration", source: "__execution__", group: "messages" },
    caption: { kind: "iteration", source: "__execution__", group: "messages" },
    entities: { kind: "iteration", source: "__execution__", group: "messages" },
    chat: { kind: "iteration", source: "__execution__", group: "messages" },
    from_user: { kind: "iteration", source: "__execution__", group: "messages" },
    attachments: { kind: "iteration", source: "__execution__", group: "messages" },
    timestamp: { kind: "iteration", source: "__execution__", group: "messages" },
    source: { kind: "iteration", source: "__execution__", group: "messages" },
    event_type: { kind: "iteration", source: "__execution__", group: "messages" }
  } satisfies Record<string, OutputCorrelation>;

  @prop({
    type: "int",
    default: 0,
    title: "Max Events",
    description: "Maximum number of events to process (0 = unlimited)",
    min: 0
  })
  declare max_events: number;

  @prop({
    type: "str",
    default: "",
    title: "Token",
    description: "Telegram bot token"
  })
  declare token: string;

  @prop({
    type: "int",
    default: null,
    title: "Chat Id",
    description: "Optional chat ID to filter messages"
  })
  declare chat_id: number | null;

  @prop({
    type: "bool",
    default: false,
    title: "Allow Bot Messages",
    description: "Include messages authored by bots"
  })
  declare allow_bot_messages: boolean;

  @prop({
    type: "bool",
    default: false,
    title: "Include Edited Messages",
    description: "Include edited messages"
  })
  declare include_edited_messages: boolean;

  @prop({
    type: "int",
    default: 30,
    title: "Poll Timeout Seconds",
    description: "Long polling timeout in seconds",
    min: 1,
    max: 60
  })
  declare poll_timeout_seconds: number;

  @prop({
    type: "float",
    default: 0.2,
    title: "Poll Interval Seconds",
    description: "Delay between polling requests",
    min: 0
  })
  declare poll_interval_seconds: number;

  async process(): Promise<Record<string, unknown>> {
    const secrets = this._secrets;
    const token = this.token || secrets.TELEGRAM_BOT_TOKEN || "";
    const chatId = this.chat_id;
    const allowBotMessages = this.allow_bot_messages;
    const includeEditedMessages = this.include_edited_messages;

    if (!token) {
      throw new Error("Telegram bot token is required");
    }

    // Validate the bot token by calling getMe
    const resp = await fetch(`https://api.telegram.org/bot${token}/getMe`);

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(
        `Telegram token validation failed (${resp.status}): ${body}`
      );
    }

    const data = (await resp.json()) as Record<string, unknown>;
    if (!data.ok) {
      throw new Error(`Telegram getMe failed: ${JSON.stringify(data)}`);
    }

    const result = data.result as Record<string, unknown>;

    // NOTE: Real-time message listening requires Telegram long polling via
    // the getUpdates API (https://api.telegram.org/bot<token>/getUpdates)
    // or a webhook. A full implementation would:
    // 1. Call getUpdates with offset tracking to receive new messages
    // 2. Loop with configurable poll_timeout_seconds for long polling
    // 3. Filter by chat_id, bot messages, edited messages as configured
    // For now, this node only validates the token and returns bot info.

    return {
      status: "configured",
      bot_id: result.id,
      bot_username: result.username,
      chat_id: chatId || null,
      allow_bot_messages: allowBotMessages,
      include_edited_messages: includeEditedMessages
    };
  }
}

export const MESSAGING_NODES = tagAsServer([
  DiscordBotTrigger,
  TelegramBotTrigger
]);
