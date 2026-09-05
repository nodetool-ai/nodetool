import {
  formatClockTime24,
  formatDayMonth
} from "../../../utils/formatUtils";

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
