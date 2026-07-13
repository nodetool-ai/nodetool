/**
 * `todo_write` — task checklist for an agent run.
 *
 * The agent passes the *entire* todo list on every call (full replacement,
 * not patch). The list is stored per chat-thread and broadcast to the UI via
 * a `todo_update` ProcessingMessage so the chat sidebar can render it as a
 * live checklist.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { TodoItem, TodoStatus, TodoUpdate } from "@nodetool-ai/protocol";
import { Tool } from "./base-tool.js";

const VALID_STATUSES: ReadonlySet<TodoStatus> = new Set<TodoStatus>([
  "pending",
  "in_progress",
  "completed"
]);

/** Module-level store: thread_id → latest TodoItem[]. */
const TODO_STORE = new Map<string, TodoItem[]>();

// Bound the store so a long-lived server (one thread id per chat session) can't
// leak an array per session forever. Nothing reliably calls clearThreadTodos on
// thread deletion, so evict the least-recently-written thread past this cap.
const TODO_STORE_MAX_THREADS = 1000;

function putThreadTodos(threadId: string, todos: TodoItem[]): void {
  // Re-insert to mark most-recently-used (Map preserves insertion order).
  TODO_STORE.delete(threadId);
  TODO_STORE.set(threadId, todos);
  while (TODO_STORE.size > TODO_STORE_MAX_THREADS) {
    const oldest = TODO_STORE.keys().next().value;
    if (oldest === undefined) break;
    TODO_STORE.delete(oldest);
  }
}

/**
 * Read the current todo list for a chat thread. Returns a defensive copy.
 * Other code (tests, server endpoints) can use this to hydrate UI state.
 */
export function getThreadTodos(threadId: string): TodoItem[] {
  const list = TODO_STORE.get(threadId);
  return list ? list.map((t) => ({ ...t })) : [];
}

/** Clear all todos for a thread (e.g. on thread delete). */
export function clearThreadTodos(threadId: string): void {
  TODO_STORE.delete(threadId);
}

/** Test-only — wipe the global store. */
export function _resetTodoStoreForTests(): void {
  TODO_STORE.clear();
}

function normalizeTodos(raw: unknown): TodoItem[] {
  if (!Array.isArray(raw)) {
    throw new Error("`todos` must be an array");
  }
  return raw.map((item, i) => {
    if (!item || typeof item !== "object") {
      throw new Error(`todos[${i}] must be an object`);
    }
    const rec = item as Record<string, unknown>;
    const content = rec.content;
    const status = rec.status;
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new Error(`todos[${i}].content must be a non-empty string`);
    }
    if (typeof status !== "string" || !VALID_STATUSES.has(status as TodoStatus)) {
      throw new Error(
        `todos[${i}].status must be one of: pending, in_progress, completed`
      );
    }
    return { content: content.trim(), status: status as TodoStatus };
  });
}

export class TodoWriteTool extends Tool {
  readonly name = "todo_write";
  readonly description =
    "Maintain a checklist of work for the current chat session. Pass the FULL " +
    "todo list on every call (this replaces, not appends). Use to plan multi-" +
    "step tasks, track progress, and surface what's done vs. pending to the " +
    "user — the list is rendered as a live sidebar in the chat UI. Keep items " +
    "concise (one short sentence each). Mark exactly one item as `in_progress` " +
    "at a time; move it to `completed` before starting the next.";

  readonly jsonSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      todos: {
        type: "array",
        description:
          "Complete todo list for this session. Replaces any prior list.",
        items: {
          type: "object",
          properties: {
            content: {
              type: "string",
              minLength: 1,
              description: "Short description of the task (one sentence)."
            },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed"],
              description: "Current status of the task."
            }
          },
          required: ["content", "status"],
          additionalProperties: false
        }
      }
    },
    required: ["todos"],
    additionalProperties: false
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const todos = normalizeTodos(params.todos);

    const threadId = context.threadId;
    if (threadId) {
      putThreadTodos(threadId, todos.map((t) => ({ ...t })));
    }

    const update: TodoUpdate = {
      type: "todo_update",
      thread_id: threadId ?? null,
      workflow_id: context.workflowId ?? null,
      todos: todos.map((t) => ({ ...t }))
    };
    context.postMessage(update);

    const counts = todos.reduce(
      (acc, t) => {
        acc[t.status] += 1;
        return acc;
      },
      { pending: 0, in_progress: 0, completed: 0 } as Record<TodoStatus, number>
    );

    return {
      ok: true,
      total: todos.length,
      counts,
      todos
    };
  }

  userMessage(params: Record<string, unknown>): string {
    const llm = Tool.extractMessage(params);
    if (llm) return llm;
    const raw = params.todos;
    if (!Array.isArray(raw)) return "Updating todo list";
    const total = raw.length;
    const inProgress = raw.find(
      (t) =>
        t &&
        typeof t === "object" &&
        (t as Record<string, unknown>).status === "in_progress"
    ) as { content?: string } | undefined;
    if (inProgress?.content) {
      return `Working on: ${inProgress.content}`;
    }
    return `Updating todo list (${total} item${total === 1 ? "" : "s"})`;
  }
}
