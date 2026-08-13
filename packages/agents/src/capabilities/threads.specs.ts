/**
 * The `threads` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `threads.ts`, so nothing the
 * implementations pull in reaches the entry graph. `threads.ts` imports these
 * back and attaches each to its implementation, so there is one spec object
 * behind both halves.
 */

import type { CapabilitySpec } from "./types.js";
import type { JsonSchema } from "@nodetool-ai/runtime";

/** Threads one `list_threads` call may return. */
export const MAX_THREADS_PER_CALL = 100;

/** Messages one `get_thread` call may return. */
export const MAX_MESSAGES_PER_CALL = 200;

/** Characters of message text `get_thread` keeps before truncating. */
export const DEFAULT_MAX_CHARS = 2000;

export const LIST_THREADS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    limit: {
      type: "number",
      description: `Max threads to return (default 20, max ${MAX_THREADS_PER_CALL}).`
    },
    workflow_id: {
      type: "string",
      description:
        "Only threads bound to this workflow (the node editor scopes its " +
        "thread list this way). Omit for every thread."
    },
    cursor: {
      type: "string",
      description: "Cursor from a previous call's `next`, to read the next page."
    },
    preview: {
      type: "boolean",
      description:
        "Include each thread's newest message as `last_message` (default " +
        "true). Set false to skip one query per thread."
    }
  }
};

export const GET_THREAD_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    thread_id: { type: "string", description: "Thread id." },
    limit: {
      type: "number",
      description: `Max messages to return (default 50, max ${MAX_MESSAGES_PER_CALL}).`
    },
    newest_first: {
      type: "boolean",
      description:
        "Return the newest messages first (default false — oldest first, " +
        "reading order). Set true with limit=1 to read the last message."
    },
    cursor: {
      type: "string",
      description: "Cursor from a previous call's `next`, to read the next page."
    },
    max_chars: {
      type: "number",
      description:
        `Characters of each message's text before truncation (default ` +
        `${DEFAULT_MAX_CHARS}). Pass 0 for no truncation.`
    }
  },
  required: ["thread_id"]
};

export const GET_MESSAGE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    message_id: { type: "string", description: "Message id." }
  },
  required: ["message_id"]
};

export const listThreadsSpec: CapabilitySpec = {
  name: "list_threads",
  description:
    "List the caller's chat threads, most recently updated first: id, title, " +
    "the workflow it is bound to, timestamps, and — unless you pass " +
    "preview=false — the newest message in each. Start here when the user " +
    "refers to a past conversation but not its id.",
  inputSchema: LIST_THREADS_SCHEMA,
  category: "read",
  userMessage: () => "Listing chat threads"
};

export const getThreadSpec: CapabilitySpec = {
  name: "get_thread",
  description:
    "Read one chat thread and a page of its messages, each with its role, " +
    "text, tool calls, provider/model, cost and timestamp. Messages come back " +
    "oldest first; pass newest_first=true (with limit=1) to read the last " +
    "message. Long text is truncated to max_chars — call get_message for the " +
    "full record.",
  inputSchema: GET_THREAD_SCHEMA,
  category: "read",
  userMessage: (params) => `Reading thread ${String(params["thread_id"])}`
};

export const getMessageSpec: CapabilitySpec = {
  name: "get_message",
  description:
    "Read one chat message in full — untruncated content, every tool call " +
    "with its arguments, input and output files, the graph it carried, and " +
    "its provider, model and cost. Use it after get_thread when a summarized " +
    "message is not enough.",
  inputSchema: GET_MESSAGE_SCHEMA,
  category: "read",
  userMessage: (params) => `Reading message ${String(params["message_id"])}`
};

/** Every spec this module declares, in declaration order. */
export const threadsSpecs: readonly CapabilitySpec[] = [
  listThreadsSpec,
  getThreadSpec,
  getMessageSpec
];
