import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";

// ── Discord Nodes ───────────────────────────────────────────────────────────

export class DiscordBotTrigger extends BaseNode {
  static readonly nodeType = "messaging.discord.DiscordBotTrigger";
  static readonly title = "Discord Bot Trigger";
  static readonly description =
    "Trigger node that listens for Discord messages from a bot account.\n\n    This trigger connects to Discord using a bot token and emits events\n    for incoming messages.";
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

  static readonly isStreamingOutput = true;
  @prop({
    type: "int",
    default: 0,
    title: "Max Events",
    description: "Maximum number of events to process (0 = unlimited)",
    min: 0
  })
  declare max_events: any;

  @prop({
    type: "str",
    default: "",
    title: "Token",
    description: "Discord bot token"
  })
  declare token: any;

  @prop({
    type: "str",
    default: null,
    title: "Channel Id",
    description: "Optional channel ID to filter messages"
  })
  declare channel_id: any;

  @prop({
    type: "bool",
    default: false,
    title: "Allow Bot Messages",
    description: "Include messages authored by bots"
  })
  declare allow_bot_messages: any;

  async process(): Promise<Record<string, unknown>> {
    const secrets = this._secrets;
    const token = String(this.token ?? "") || secrets.DISCORD_BOT_TOKEN || "";
    const channelId = String(this.channel_id ?? "");
    const allowBotMessages = Boolean(this.allow_bot_messages ?? false);

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

    return {
      status: "configured",
      bot_id: botUser.id,
      bot_username: botUser.username,
      channel_id: channelId,
      allow_bot_messages: allowBotMessages
    };
  }
}

export class DiscordSendMessage extends BaseNode {
  static readonly nodeType = "messaging.discord.DiscordSendMessage";
  static readonly title = "Discord Send Message";
  static readonly description =
    "Node that sends a message to a Discord channel using a bot token.";
  static readonly metadataOutputTypes = {
    output: "dict[str, any]"
  };
  static readonly requiredSettings = ["DISCORD_BOT_TOKEN"];

  @prop({
    type: "str",
    default: "",
    title: "Token",
    description: "Discord bot token"
  })
  declare token: any;

  @prop({
    type: "str",
    default: "",
    title: "Channel Id",
    description: "Target channel ID"
  })
  declare channel_id: any;

  @prop({
    type: "str",
    default: "",
    title: "Content",
    description: "Message content"
  })
  declare content: any;

  @prop({
    type: "bool",
    default: false,
    title: "Tts",
    description: "Send as text-to-speech"
  })
  declare tts: any;

  @prop({
    type: "list[dict[str, any]]",
    default: null,
    title: "Embeds",
    description: "Embeds as Discord embed dictionaries",
    required: true
  })
  declare embeds: any;

  async process(): Promise<Record<string, unknown>> {
    const secrets = this._secrets;
    const token = String(this.token ?? "") || secrets.DISCORD_BOT_TOKEN || "";
    const channelId = String(this.channel_id ?? "");
    const content = String(this.content ?? "");
    const tts = Boolean(this.tts ?? false);
    const embeds = (this.embeds ?? []) as unknown[];

    if (!token) {
      throw new Error("Discord bot token is required");
    }
    if (!channelId) {
      throw new Error("Discord channel ID is required");
    }

    const payload: Record<string, unknown> = {
      content,
      tts
    };
    if (Array.isArray(embeds) && embeds.length > 0) {
      payload.embeds = embeds;
    }

    const resp = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Discord sendMessage failed (${resp.status}): ${body}`);
    }

    const msg = (await resp.json()) as Record<string, unknown>;
    return {
      message_id: msg.id
    };
  }
}

// ── Telegram Nodes ──────────────────────────────────────────────────────────

export class TelegramBotTrigger extends BaseNode {
  static readonly nodeType = "messaging.telegram.TelegramBotTrigger";
  static readonly title = "Telegram Bot Trigger";
  static readonly description =
    "Trigger node that listens for Telegram messages using long polling.\n\n    This trigger connects to Telegram using a bot token and emits events\n    for incoming messages.";
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

  static readonly isStreamingOutput = true;
  @prop({
    type: "int",
    default: 0,
    title: "Max Events",
    description: "Maximum number of events to process (0 = unlimited)",
    min: 0
  })
  declare max_events: any;

  @prop({
    type: "str",
    default: "",
    title: "Token",
    description: "Telegram bot token"
  })
  declare token: any;

  @prop({
    type: "int",
    default: null,
    title: "Chat Id",
    description: "Optional chat ID to filter messages"
  })
  declare chat_id: any;

  @prop({
    type: "bool",
    default: false,
    title: "Allow Bot Messages",
    description: "Include messages authored by bots"
  })
  declare allow_bot_messages: any;

  @prop({
    type: "bool",
    default: false,
    title: "Include Edited Messages",
    description: "Include edited messages"
  })
  declare include_edited_messages: any;

  @prop({
    type: "int",
    default: 30,
    title: "Poll Timeout Seconds",
    description: "Long polling timeout in seconds",
    min: 1,
    max: 60
  })
  declare poll_timeout_seconds: any;

  @prop({
    type: "float",
    default: 0.2,
    title: "Poll Interval Seconds",
    description: "Delay between polling requests",
    min: 0
  })
  declare poll_interval_seconds: any;

  async process(): Promise<Record<string, unknown>> {
    const secrets = this._secrets;
    const token = String(this.token ?? "") || secrets.TELEGRAM_BOT_TOKEN || "";
    const chatId = Number(this.chat_id ?? 0);
    const allowBotMessages = Boolean(this.allow_bot_messages ?? false);
    const includeEditedMessages = Boolean(
      this.include_edited_messages ?? false
    );

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

export class TelegramSendMessage extends BaseNode {
  static readonly nodeType = "messaging.telegram.TelegramSendMessage";
  static readonly title = "Telegram Send Message";
  static readonly description =
    "Node that sends a message to a Telegram chat using a bot token.";
  static readonly metadataOutputTypes = {
    output: "dict[str, any]"
  };
  static readonly requiredSettings = ["TELEGRAM_BOT_TOKEN"];

  @prop({
    type: "str",
    default: "",
    title: "Token",
    description: "Telegram bot token"
  })
  declare token: any;

  @prop({
    type: "int",
    default: 0,
    title: "Chat Id",
    description: "Target chat ID",
    min: 1
  })
  declare chat_id: any;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "Message text"
  })
  declare text: any;

  @prop({
    type: "str",
    default: "",
    title: "Parse Mode",
    description: "Optional parse mode (MarkdownV2 or HTML)"
  })
  declare parse_mode: any;

  @prop({
    type: "bool",
    default: false,
    title: "Disable Web Page Preview",
    description: "Disable link previews"
  })
  declare disable_web_page_preview: any;

  @prop({
    type: "bool",
    default: false,
    title: "Disable Notification",
    description: "Send silently"
  })
  declare disable_notification: any;

  @prop({
    type: "int",
    default: null,
    title: "Reply To Message Id",
    description: "Reply to a specific message ID",
    min: 1
  })
  declare reply_to_message_id: any;

  async process(): Promise<Record<string, unknown>> {
    const secrets = this._secrets;
    const token = String(this.token ?? "") || secrets.TELEGRAM_BOT_TOKEN || "";
    const chatId = Number(this.chat_id ?? 0);
    const text = String(this.text ?? "");
    const parseMode = String(this.parse_mode ?? "");
    const disableWebPagePreview = Boolean(
      this.disable_web_page_preview ?? false
    );
    const disableNotification = Boolean(this.disable_notification ?? false);
    const replyToMessageId = Number(this.reply_to_message_id ?? 0);

    if (!token) {
      throw new Error("Telegram bot token is required");
    }
    if (!chatId) {
      throw new Error("Telegram chat ID is required");
    }

    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text,
      disable_web_page_preview: disableWebPagePreview,
      disable_notification: disableNotification
    };

    if (parseMode) {
      payload.parse_mode = parseMode;
    }
    if (replyToMessageId) {
      payload.reply_to_message_id = replyToMessageId;
    }

    const resp = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );

    const data = (await resp.json()) as Record<string, unknown>;

    if (!data.ok) {
      throw new Error(`Telegram sendMessage failed: ${JSON.stringify(data)}`);
    }

    const result = data.result as Record<string, unknown>;
    const chat = (result.chat as Record<string, unknown>) ?? {};

    return {
      message_id: result.message_id,
      date: result.date,
      chat_id: chat.id
    };
  }
}

// ── Export ───────────────────────────────────────────────────────────────────

export const MESSAGING_NODES: readonly NodeClass[] = [
  DiscordBotTrigger,
  DiscordSendMessage,
  TelegramBotTrigger,
  TelegramSendMessage
];
