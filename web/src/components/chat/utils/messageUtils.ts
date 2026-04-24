export interface ParsedThought {
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
