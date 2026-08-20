/**
 * Wording for the terminal state of a step that never produced a result.
 *
 * A step can end for reasons that need different answers from whoever reads
 * the error: the provider threw, the iteration budget ran out, or the model
 * simply stopped talking without calling the finishing tool. Reporting them
 * all as "exceeded N iterations" sent debuggers after an iteration budget that
 * was never touched, so the last case carries what the model actually said
 * instead.
 */

import type { Message } from "@nodetool-ai/runtime";
import { isString } from "./type-guards.js";

/** How much of the model's last message rides along in a failure message. */
export const PROSE_HINT_MAX_CHARS = 200;

/** The plain text of an assistant message, across both content shapes. */
function messageText(message: Message | null): string {
  if (!message) return "";
  const content = message.content;
  if (isString(content)) return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("")
      .trim();
  }
  return "";
}

/**
 * A short quote of the model's last message, ready to append to a failure
 * message. Empty when the model said nothing quotable, so the caller can
 * concatenate it unconditionally.
 */
export function lastProseHint(message: Message | null): string {
  const text = messageText(message);
  if (text === "") return "";
  const quote =
    text.length > PROSE_HINT_MAX_CHARS
      ? `${text.slice(0, PROSE_HINT_MAX_CHARS)}…`
      : text;
  return ` Last message: "${quote}"`;
}
