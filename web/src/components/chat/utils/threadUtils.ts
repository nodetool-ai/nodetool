import type { Message, MessageTextContent } from "../../../stores/ApiTypes";
import { ThreadInfo } from "../types/thread.types";
import { isString } from "../../../utils/typePredicates";

/** Server-assigned title, else the opening user message, else a placeholder. */
export const threadPreview = (
  title: string | null | undefined,
  messages: Message[] | undefined
): string => {
  if (title) {
    return title;
  }
  const firstUserMessage = messages?.find((msg) => msg.role === "user");
  if (!firstUserMessage) {
    return "New conversation";
  }
  const { content } = firstUserMessage;
  let text: string;
  if (isString(content)) {
    text = content;
  } else if (Array.isArray(content) && content[0]?.type === "text") {
    // `text` can be null even on a text block — never stringify "undefined".
    text = (content[0] as MessageTextContent).text ?? "";
  } else {
    text = "[Media message]";
  }
  if (!text) {
    return "New conversation";
  }
  return text.length > 50 ? `${text.substring(0, 50)}...` : text;
};

export const sortThreadsByDate = (
  threads: Record<string, ThreadInfo>
): Array<[string, ThreadInfo]> => {
  return Object.entries(threads).sort((a, b) => {
    const aDateStr = a[1].updatedAt || "";
    const bDateStr = b[1].updatedAt || "";
    return bDateStr.localeCompare(aDateStr);
  });
};