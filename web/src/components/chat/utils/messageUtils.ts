import type { Message } from "../../../stores/ApiTypes";
import {
  formatClockTime24,
  formatDayMonth
} from "../../../utils/formatUtils";
import { isObjectLike, isString } from "../../../utils/typePredicates";

interface ParsedThought {
  thoughtContent: string;
  hasClosingTag: boolean;
  textBeforeThought: string;
  textAfterThought: string;
}

const REDACTED_THINKING_CLOSE = "<" + "/redacted_thinking>";
/** Legacy / mistaken model closing tag (paired with `<think>` open). */
const LEGACY_THINK_CLOSE = "<" + "/think>";

export const stripContextContent = (content: string): string => {
  // Strip <editor_context>...</editor_context> (may appear without closing tag)
  let result = content.replace(/<editor_context>[\s\S]*?(<\/editor_context>|(?=\n\n|$))/s, "").trimStart();
  // Strip legacy <context>...</context>
  const contextMatch = result.match(/<context>([\s\S]*?)(<\/context>|$)(.*)/s);
  if (contextMatch) {
    result = contextMatch[3];
  }
  return result;
};

export const parseThoughtContent = (content: string): ParsedThought | null => {
  const thoughtMatch = content.match(
    /<think>([\s\S]*?)(<\/redacted_thinking>|<\/think>|$)/s
  );

  if (!thoughtMatch) {
    return null;
  }

  const close = thoughtMatch[2];
  const hasClosingTag =
    close === REDACTED_THINKING_CLOSE || close === LEGACY_THINK_CLOSE;
  const textBeforeThought = content.split("<think>")[0];
  const textAfterThought = hasClosingTag
    ? content.slice(thoughtMatch.index! + thoughtMatch[0].length)
    : "";

  return {
    thoughtContent: thoughtMatch[1],
    hasClosingTag,
    textBeforeThought,
    textAfterThought
  };
};

export const getMessageClass = (role: string): string => {
  let messageClass = "chat-message";
  if (role === "user") {
    messageClass += " user";
  } else if (role === "assistant") {
    messageClass += " assistant";
  }
  return messageClass;
};

/**
 * Timestamp for a chat message: the clock alone for messages sent today, the
 * day in front of it for anything older, so a three-day-old message does not
 * read as one from this afternoon.
 *
 * @param dateStr ISO timestamp; missing or unparseable returns null.
 * @param now Reference "today" — injectable so tests do not depend on the clock.
 */
export const formatMessageTimestamp = (
  dateStr?: string | null,
  now: Date = new Date()
): string | null => {
  if (!dateStr) {
    return null;
  }
  const date = new Date(dateStr);
  const time = formatClockTime24(date);
  if (!time) {
    return null;
  }
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (isToday) {
    return time;
  }
  const day = formatDayMonth(date);
  return day ? `${day} ${time}` : time;
};

/**
 * Whether a message has something of its own to show besides tool calls:
 * non-blank text or any non-text block (an image, a file). A message that only
 * carries tool calls renders as timeline rows and gets no action row.
 */
export const hasVisibleContent = (message: Message): boolean => {
  const { content } = message;
  if (isString(content)) {
    return content.trim().length > 0;
  }
  if (!Array.isArray(content)) {
    return false;
  }
  return content.some((block) => {
    if (!block || !isObjectLike(block)) {
      return false;
    }
    if (block.type === "text") {
      return isString(block.text) && block.text.trim().length > 0;
    }
    return true;
  });
};

/** The text blocks of a message joined by newlines; what Copy puts on the clipboard. */
export const messageText = (message: Message): string => {
  const { content } = message;
  if (isString(content)) {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .filter(
      (block): block is { type: "text"; text: string } =>
        !!block &&
        isObjectLike(block) &&
        block.type === "text" &&
        isString(block.text)
    )
    .map((block) => block.text)
    .join("\n");
};

/**
 * Where each assistant reply ends, mapped to the text of the whole reply.
 *
 * An agent reply is often several assistant messages: text, tool rows, more
 * text. Only its last message with visible content gets an action row, and its
 * Copy copies every text segment of the reply, as ChatGPT and Claude do. The
 * segments before it get no action row, so they read as one answer instead of
 * several with gaps between them.
 */
export const replyEnds = (messages: Message[]): Map<number, string> => {
  const ends = new Map<number, string>();
  let lastIndex = -1;
  let parts: string[] = [];
  const close = (): void => {
    if (lastIndex >= 0) {
      ends.set(lastIndex, parts.join("\n\n"));
    }
    lastIndex = -1;
    parts = [];
  };
  messages.forEach((message, index) => {
    if (message.role === "user") {
      close();
      return;
    }
    if (message.role !== "assistant" || !hasVisibleContent(message)) {
      return;
    }
    lastIndex = index;
    const text = messageText(message).trim();
    if (text) {
      parts.push(text);
    }
  });
  close();
  return ends;
};
