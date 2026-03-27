export interface ParsedThought {
  thoughtContent: string;
  hasClosingTag: boolean;
  textBeforeThought: string;
  textAfterThought: string;
}

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
  const thoughtMatch = content.match(/<think>([\s\S]*?)(<\/think>|$)/s);

  if (!thoughtMatch) {
    return null;
  }

  const hasClosingTag = thoughtMatch[2] === "</think>";
  const textBeforeThought = content.split("<think>")[0];
  const textAfterThought = hasClosingTag
    ? content.split("</think>").pop() || ""
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
