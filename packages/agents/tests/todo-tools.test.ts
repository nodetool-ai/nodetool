import { afterEach, describe, expect, it } from "vitest";
import {
  TodoWriteTool,
  getThreadTodos,
  clearThreadTodos,
  _resetTodoStoreForTests
} from "../src/tools/todo-tools.js";
import { createMockContext } from "./_helpers/mock-context.js";

describe("TodoWriteTool", () => {
  afterEach(() => {
    _resetTodoStoreForTests();
  });

  it("stores todos per thread and emits a todo_update", async () => {
    const tool = new TodoWriteTool();
    const ctx = createMockContext();
    ctx.threadId = "thread-1";

    const result = (await tool.process(ctx, {
      todos: [
        { content: "Research", status: "completed" },
        { content: "Write report", status: "in_progress" },
        { content: "Ship", status: "pending" }
      ]
    })) as { ok: boolean; total: number; counts: Record<string, number> };

    expect(result.ok).toBe(true);
    expect(result.total).toBe(3);
    expect(result.counts).toEqual({
      pending: 1,
      in_progress: 1,
      completed: 1
    });

    expect(getThreadTodos("thread-1")).toEqual([
      { content: "Research", status: "completed" },
      { content: "Write report", status: "in_progress" },
      { content: "Ship", status: "pending" }
    ]);

    expect(ctx.postMessage).toHaveBeenCalledTimes(1);
    const msg = ctx.postMessage.mock.calls[0][0];
    expect(msg.type).toBe("todo_update");
    expect(msg.thread_id).toBe("thread-1");
    expect(msg.todos).toHaveLength(3);
  });

  it("rejects invalid status values", async () => {
    const tool = new TodoWriteTool();
    const ctx = createMockContext();
    ctx.threadId = "t";
    await expect(
      tool.process(ctx, {
        todos: [{ content: "x", status: "blocked" }]
      })
    ).rejects.toThrow(/status must be one of/);
  });

  it("rejects empty content", async () => {
    const tool = new TodoWriteTool();
    const ctx = createMockContext();
    ctx.threadId = "t";
    await expect(
      tool.process(ctx, {
        todos: [{ content: "  ", status: "pending" }]
      })
    ).rejects.toThrow(/non-empty/);
  });

  it("replaces — does not merge — on subsequent calls", async () => {
    const tool = new TodoWriteTool();
    const ctx = createMockContext();
    ctx.threadId = "t2";
    await tool.process(ctx, {
      todos: [
        { content: "a", status: "pending" },
        { content: "b", status: "pending" }
      ]
    });
    await tool.process(ctx, {
      todos: [{ content: "a", status: "completed" }]
    });
    expect(getThreadTodos("t2")).toEqual([
      { content: "a", status: "completed" }
    ]);
  });

  it("scopes storage by thread id", async () => {
    const tool = new TodoWriteTool();
    const ctx1 = createMockContext();
    ctx1.threadId = "thread-A";
    const ctx2 = createMockContext();
    ctx2.threadId = "thread-B";

    await tool.process(ctx1, { todos: [{ content: "A1", status: "pending" }] });
    await tool.process(ctx2, { todos: [{ content: "B1", status: "pending" }] });

    expect(getThreadTodos("thread-A")).toEqual([
      { content: "A1", status: "pending" }
    ]);
    expect(getThreadTodos("thread-B")).toEqual([
      { content: "B1", status: "pending" }
    ]);

    clearThreadTodos("thread-A");
    expect(getThreadTodos("thread-A")).toEqual([]);
    expect(getThreadTodos("thread-B")).toHaveLength(1);
  });

  it("still emits todo_update when threadId is missing (but does not store)", async () => {
    const tool = new TodoWriteTool();
    const ctx = createMockContext();
    await tool.process(ctx, {
      todos: [{ content: "no-thread", status: "pending" }]
    });
    expect(ctx.postMessage).toHaveBeenCalled();
    const msg = ctx.postMessage.mock.calls[0][0];
    expect(msg.thread_id).toBeNull();
  });
});
