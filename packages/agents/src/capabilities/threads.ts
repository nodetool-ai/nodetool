/**
 * The `threads` capability module — the chat history, read-only.
 *
 * Every other surface an agent can inspect headlessly (workflows, jobs,
 * scripts, timelines, sketches) had a capability; the conversations themselves
 * had none, so "what did we say last time" was unanswerable without opening the
 * database by hand. These three read `Thread` and `Message` from
 * `@nodetool-ai/models` in-process — no server, no HTTP.
 *
 * Read-only on purpose. Chat history is written by the runners that own a turn
 * (the websocket chat runner, the CLI turn); a tool that let an agent rewrite
 * what was said would make the transcript untrustworthy as evidence.
 *
 * Ownership is the same rule the REST routes apply: a thread or message
 * belonging to someone else reads as missing rather than as forbidden.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { Message, Thread } from "@nodetool-ai/models";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  listThreadsSpec,
  getThreadSpec,
  getMessageSpec,
  MAX_THREADS_PER_CALL,
  MAX_MESSAGES_PER_CALL,
  DEFAULT_MAX_CHARS
} from "./threads.specs.js";
import { isObjectLike, isString } from "../utils/type-guards.js";

type ToolError = { error: string };

/** Threads whose previews are fetched at once. */
const PREVIEW_CONCURRENCY = 8;

function userOf(run: CapabilityRun): string | ToolError {
  const userId = (run.context as ProcessingContext).userId;
  if (!userId) return { error: "No user is bound to this session." };
  return userId;
}

const isError = (value: unknown): value is ToolError =>
  !!value &&
  typeof value === "object" &&
  typeof (value as ToolError).error === "string";

function clamp(value: unknown, fallback: number, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

/**
 * The readable text of a message's content.
 *
 * `content` is a string on the older rows and an array of typed parts on the
 * rest, where only `text` and `thought` parts carry words — an image or audio
 * part is a ref. Non-text parts are named rather than dropped, so a message
 * that is only an image does not read as an empty one.
 */
function messageText(content: unknown): string {
  if (isString(content)) return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (isString(part)) return part;
        if (!isObjectLike(part)) return "";
        const typed = part as { type?: string; text?: string };
        if (isString(typed.text)) return typed.text;
        return typed.type ? `[${typed.type}]` : "";
      })
      .filter((piece) => piece !== "")
      .join("\n");
  }
  if (isObjectLike(content)) return JSON.stringify(content);
  return "";
}

function truncate(text: string, maxChars: number): [string, boolean] {
  if (maxChars <= 0 || text.length <= maxChars) return [text, false];
  return [text.slice(0, maxChars), true];
}

/** Tool calls without their arguments — `get_message` carries the full ones. */
function toolCallNames(
  toolCalls: unknown[] | null
): { id: string; name: string }[] {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls.map((call) => {
    const typed = (call ?? {}) as { id?: unknown; name?: unknown };
    return {
      id: isString(typed.id) ? typed.id : "",
      name: isString(typed.name) ? typed.name : ""
    };
  });
}

/** One message, summarized: everything but the payloads a caller must ask for. */
function summarizeMessage(message: Message, maxChars: number) {
  const [text, truncated] = truncate(messageText(message.content), maxChars);
  const calls = toolCallNames(message.tool_calls);
  return {
    id: message.id,
    role: message.role,
    name: message.name ?? undefined,
    created_at: message.created_at,
    text,
    truncated,
    tool_calls: calls.length > 0 ? calls : undefined,
    tool_call_id: message.tool_call_id ?? undefined,
    provider: message.provider ?? undefined,
    model: message.model ?? undefined,
    cost: message.cost ?? undefined,
    workflow_id: message.workflow_id ?? undefined,
    agent_execution_id: message.agent_execution_id ?? undefined,
    execution_event_type: message.execution_event_type ?? undefined,
    has_graph: message.graph !== null && message.graph !== undefined,
    input_files: Array.isArray(message.input_files)
      ? message.input_files.length
      : 0,
    output_files: Array.isArray(message.output_files)
      ? message.output_files.length
      : 0
  };
}

function summarizeThread(thread: Thread) {
  return {
    id: thread.id,
    title: thread.title,
    workflow_id: thread.workflow_id ?? undefined,
    created_at: thread.created_at,
    updated_at: thread.updated_at
  };
}

/** Run `task` over `items`, at most `limit` in flight. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (;;) {
        const index = next++;
        if (index >= items.length) return;
        results[index] = await task(items[index]);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

const listThreads: CapabilityExport = {
  spec: listThreadsSpec,
  impl: async (run, params) => {
    const userId = userOf(run);
    if (isError(userId)) return userId;
    const { Message, Thread } = await import("@nodetool-ai/models");
    const limit = clamp(params["limit"], 20, MAX_THREADS_PER_CALL);
    const workflowId = params["workflow_id"];
    const [rows, next] = await Thread.paginate(userId, {
      limit,
      reverse: true,
      workflowId: isString(workflowId) ? workflowId : undefined,
      startKey: isString(params["cursor"]) ? params["cursor"] : undefined
    });

    const wantPreview = params["preview"] !== false;
    const previews = wantPreview
      ? await mapWithConcurrency(rows, PREVIEW_CONCURRENCY, async (thread) => {
          const [last] = await Message.paginate(thread.id, {
            limit: 1,
            reverse: true
          });
          return last[0]
            ? summarizeMessage(last[0], 300)
            : undefined;
        })
      : [];

    return {
      threads: rows.map((thread, index) => ({
        ...summarizeThread(thread),
        last_message: wantPreview ? previews[index] : undefined
      })),
      next: next || undefined
    };
  }
};

const getThread: CapabilityExport = {
  spec: getThreadSpec,
  impl: async (run, params) => {
    const userId = userOf(run);
    if (isError(userId)) return userId;
    const threadId = params["thread_id"];
    if (!isString(threadId) || !threadId) {
      return { error: "thread_id is required (use list_threads to find one)." };
    }
    const { Message, Thread } = await import("@nodetool-ai/models");
    const thread = await Thread.find(userId, threadId);
    if (!thread) return { error: `Thread ${threadId} was not found.` };

    const limit = clamp(params["limit"], 50, MAX_MESSAGES_PER_CALL);
    const maxCharsRaw = params["max_chars"];
    const maxChars =
      maxCharsRaw === undefined ? DEFAULT_MAX_CHARS : Number(maxCharsRaw);
    const [rows, next] = await Message.paginate(threadId, {
      limit,
      reverse: params["newest_first"] === true,
      startKey:
        isString(params["cursor"]) ? params["cursor"] : undefined
    });

    return {
      ...summarizeThread(thread),
      messages: rows.map((message) =>
        summarizeMessage(message, Number.isFinite(maxChars) ? maxChars : DEFAULT_MAX_CHARS)
      ),
      next: next || undefined
    };
  }
};

const getMessage: CapabilityExport = {
  spec: getMessageSpec,
  impl: async (run, params) => {
    const userId = userOf(run);
    if (isError(userId)) return userId;
    const messageId = params["message_id"];
    if (!isString(messageId) || !messageId) {
      return { error: "message_id is required (use get_thread to find one)." };
    }
    const { Message } = await import("@nodetool-ai/models");
    const message = await Message.find(messageId);
    // A message owned by someone else reads as missing — the rule every other
    // read capability here applies.
    if (!message || message.user_id !== userId) {
      return { error: `Message ${messageId} was not found.` };
    }
    return {
      id: message.id,
      thread_id: message.thread_id,
      role: message.role,
      name: message.name ?? undefined,
      created_at: message.created_at,
      text: messageText(message.content),
      content: message.content,
      tool_calls: message.tool_calls ?? undefined,
      tool_call_id: message.tool_call_id ?? undefined,
      input_files: message.input_files ?? undefined,
      output_files: message.output_files ?? undefined,
      provider: message.provider ?? undefined,
      model: message.model ?? undefined,
      cost: message.cost ?? undefined,
      workflow_id: message.workflow_id ?? undefined,
      graph: message.graph ?? undefined,
      tools: message.tools ?? undefined,
      collections: message.collections ?? undefined,
      agent_execution_id: message.agent_execution_id ?? undefined,
      execution_event_type: message.execution_event_type ?? undefined,
      workflow_target: message.workflow_target ?? undefined,
      media_generation: message.media_generation ?? undefined
    };
  }
};

/** Every thread capability, in declaration order. */
export const THREAD_CAPABILITIES: readonly CapabilityExport[] = [
  listThreads,
  getThread,
  getMessage
];

export const module: CapabilityModule = {
  module: "threads",
  exports: THREAD_CAPABILITIES
};

export { listThreads, getThread, getMessage };
