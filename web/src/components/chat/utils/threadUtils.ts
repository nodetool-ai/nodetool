import type { Message } from "../../../stores/ApiTypes";
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
    text = content[0].text ?? "";
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

/** Server's title length cap, `deriveThreadTitle` in the threads router. */
const DERIVED_TITLE_MAX_LEN = 60;
/** The client's first title, before the server's (`chatProtocol`). */
const CLIENT_TITLE_MAX_LEN = 50;

/** The title the server derives from a thread's opening question. */
export const titleFromQuestion = (text: string): string => {
  const flat = text.trim().replace(/\s+/g, " ");
  return flat.length > DERIVED_TITLE_MAX_LEN
    ? `${flat.slice(0, DERIVED_TITLE_MAX_LEN - 3)}...`
    : flat;
};

/**
 * Whether a title was derived from this question rather than chosen by the
 * person, by either the server's or the client's derivation.
 */
export const isTitleFromQuestion = (title: string, text: string): boolean => {
  if (title === titleFromQuestion(text)) {
    return true;
  }
  return (
    title ===
    (text.length > CLIENT_TITLE_MAX_LEN
      ? `${text.substring(0, CLIENT_TITLE_MAX_LEN)}...`
      : text)
  );
};
