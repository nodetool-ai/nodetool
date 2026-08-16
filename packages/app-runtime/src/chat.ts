/**
 * Conversation semantics for the chat widgets.
 *
 * A thread and a composer exist on three surfaces (web, mobile, the headless
 * `app debug` harness), and all three have to agree on what a bound value means
 * as a conversation — otherwise an app that reads correctly in the builder
 * renders as one long assistant turn on a phone.
 */

import { isRecord, isString } from "./predicates.js";

/** One turn of a conversation. `content` is text, or a list of content parts. */
export interface ChatMessage {
  role: string;
  content: unknown;
}

/** What a composer writes to its bound input when the user sends. */
export type ComposerValueFormat = "text" | "message" | "history";

/**
 * Read a bound value as a conversation. A list of `{role, content}` objects is
 * the canonical form; anything else — a streamed string, a media ref, a list of
 * results — reads as one assistant turn, so a thread bound straight to an LLM
 * output still renders.
 */
export const messagesFrom = (value: unknown): ChatMessage[] => {
  if (value == null || value === "") return [];
  const items = Array.isArray(value) ? value : [value];
  const messages: ChatMessage[] = [];
  // A streaming output accumulates one item per chunk. Those chunks are one
  // reply, so consecutive text joins into the turn in progress rather than
  // giving the thread a bubble per token.
  let streaming = false;
  for (const item of items) {
    if (item == null || item === "") continue;
    if (isRecord(item) && isString(item.role)) {
      messages.push({ role: item.role, content: item.content ?? "" });
      streaming = false;
      continue;
    }
    const chunk = isString(item) ? item : null;
    const last = messages[messages.length - 1];
    if (chunk !== null && streaming && last) {
      last.content = `${last.content as string}${chunk}`;
      continue;
    }
    messages.push({ role: "assistant", content: item });
    streaming = chunk !== null;
  }
  return messages;
};

/**
 * The message a composer sends: plain text when there is nothing attached, and
 * the protocol's content-part list when there is — the shape a MessageInput
 * node and every provider already accept.
 */
export const composeUserMessage = (
  text: string,
  imageUris: ReadonlyArray<string> = []
): ChatMessage & { type: "message" } => {
  if (imageUris.length === 0) {
    return { type: "message", role: "user", content: text };
  }
  return {
    type: "message",
    role: "user",
    content: [
      ...(text ? [{ type: "text", text }] : []),
      ...imageUris.map((uri) => ({
        type: "image_url",
        image: { type: "image", uri }
      }))
    ]
  };
};

/** The plain text of a message's content, ignoring media parts. */
export const messageText = (content: unknown): string => {
  if (isString(content)) return content;
  if (!Array.isArray(content)) return content == null ? "" : String(content);
  return content
    .filter((part): part is Record<string, unknown> => isRecord(part))
    .filter((part) => part.type === "text" && isString(part.text))
    .map((part) => part.text as string)
    .join("\n");
};
