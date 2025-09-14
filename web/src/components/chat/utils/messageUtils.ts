export interface ParsedThought {
  thoughtContent: string;
  hasClosingTag: boolean;
  textBeforeThought: string;
  textAfterThought: string;
}

export const stripContextContent = (content: string): string => {
  const contextMatch = content.match(/<context>([\s\S]*?)(<\/context>|$)(.*)/s);
  if (!contextMatch) {
    return content;
  }
  return contextMatch[3];
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
