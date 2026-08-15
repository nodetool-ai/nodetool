/**
 * The `threads` capability module — the chat history, read-only.
 *
 * A well-formed, correctly classified module, plus round trips against a real
 * in-memory database: ordering (newest thread first, newest message last),
 * the preview each listed thread carries, truncation and the flag that reports
 * it, text extraction from both content shapes, and the ownership rule that
 * makes another user's thread read as missing rather than as forbidden.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Message, ModelObserver, Thread, initTestDb } from "@nodetool-ai/models";
import { module as threads } from "../src/capabilities/threads.js";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { capabilityModuleIssues } from "../src/capabilities/registry.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import { DEFAULT_MAX_CHARS } from "../src/capabilities/threads.specs.js";

const NAMES = ["list_threads", "get_thread", "get_message"] as const;

const run = (userId = "u1") =>
  createCapabilityRun({
    context: { userId } as unknown as ProcessingContext,
    gate: UNGATED
  });

/** Timestamps are the sort key, so they are set explicitly, not by the clock. */
async function makeThread(
  id: string,
  updatedAt: string,
  opts: { userId?: string; workflowId?: string | null } = {}
): Promise<Thread> {
  return Thread.create<Thread>({
    id,
    user_id: opts.userId ?? "u1",
    workflow_id: opts.workflowId ?? null,
    title: `Thread ${id}`,
    created_at: updatedAt,
    updated_at: updatedAt
  });
}

async function makeMessage(
  id: string,
  threadId: string,
  createdAt: string,
  fields: Record<string, unknown> = {}
): Promise<Message> {
  return Message.create<Message>({
    id,
    user_id: "u1",
    thread_id: threadId,
    role: "user",
    content: "hello",
    created_at: createdAt,
    ...fields
  });
}

describe("threads capability module", () => {
  it("is well-formed and declares itself as threads", () => {
    expect(capabilityModuleIssues("threads", threads)).toEqual([]);
    expect(threads.exports.map((e) => e.spec.name)).toEqual([...NAMES]);
  });

  it("classifies every export the way the gate's map does", () => {
    for (const entry of threads.exports) {
      expect([entry.spec.name, entry.spec.category]).toEqual([
        entry.spec.name,
        permissionCategoryFor(entry.spec.name)
      ]);
    }
  });

  it("keeps the wire surface the belt offers", () => {
    for (const name of NAMES) {
      const spec = threads.exports.find((e) => e.spec.name === name)?.spec;
      const tool = toolForCapabilityName(name);
      expect(spec).toBeDefined();
      expect(tool.name).toBe(name);
      expect(tool.description).toBe(spec?.description);
      expect(tool.inputSchema).toEqual(spec?.inputSchema);
    }
  });
});

describe("threads capability behaviour", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("lists threads newest first, each with its last message", async () => {
    await makeThread("t-old", "2026-01-01T00:00:00.000Z");
    await makeThread("t-new", "2026-02-01T00:00:00.000Z");
    await makeMessage("m1", "t-new", "2026-01-31T00:00:00.000Z");
    await makeMessage("m2", "t-new", "2026-02-01T00:00:00.000Z", {
      role: "assistant",
      content: "the newest thing said"
    });

    const listed = (await run().invoke("list_threads", {})) as {
      threads: Array<{
        id: string;
        last_message?: { id: string; role: string; text: string };
      }>;
    };
    expect(listed.threads.map((t) => t.id)).toEqual(["t-new", "t-old"]);
    expect(listed.threads[0].last_message).toMatchObject({
      id: "m2",
      role: "assistant",
      text: "the newest thing said"
    });
    expect(listed.threads[1].last_message).toBeUndefined();
  });

  it("skips the preview query when preview is false", async () => {
    await makeThread("t1", "2026-01-01T00:00:00.000Z");
    await makeMessage("m1", "t1", "2026-01-01T00:00:00.000Z");

    const listed = (await run().invoke("list_threads", {
      preview: false
    })) as { threads: Array<{ last_message?: unknown }> };
    expect(listed.threads[0].last_message).toBeUndefined();
  });

  it("scopes a listing to one workflow", async () => {
    await makeThread("t-free", "2026-01-01T00:00:00.000Z");
    await makeThread("t-wf", "2026-01-02T00:00:00.000Z", { workflowId: "wf1" });

    const listed = (await run().invoke("list_threads", {
      workflow_id: "wf1",
      preview: false
    })) as { threads: Array<{ id: string }> };
    expect(listed.threads.map((t) => t.id)).toEqual(["t-wf"]);
  });

  it("reads a thread's messages in reading order, newest last", async () => {
    await makeThread("t1", "2026-01-03T00:00:00.000Z");
    await makeMessage("m1", "t1", "2026-01-01T00:00:00.000Z");
    await makeMessage("m2", "t1", "2026-01-02T00:00:00.000Z", {
      role: "assistant",
      content: [
        { type: "text", text: "part one" },
        { type: "image_url", image: { uri: "asset://x" } }
      ],
      provider: "anthropic",
      model: "claude-sonnet-5",
      cost: 0.25
    });

    const read = (await run().invoke("get_thread", {
      thread_id: "t1"
    })) as {
      id: string;
      title: string;
      messages: Array<{
        id: string;
        text: string;
        provider?: string;
        cost?: number;
      }>;
    };
    expect(read.id).toBe("t1");
    expect(read.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(read.messages[1]).toMatchObject({
      text: "part one\n[image_url]",
      provider: "anthropic",
      cost: 0.25
    });
  });

  it("reads the last message with newest_first and limit 1", async () => {
    await makeThread("t1", "2026-01-03T00:00:00.000Z");
    await makeMessage("m1", "t1", "2026-01-01T00:00:00.000Z");
    await makeMessage("m2", "t1", "2026-01-02T00:00:00.000Z", {
      content: "the last word"
    });

    const read = (await run().invoke("get_thread", {
      thread_id: "t1",
      newest_first: true,
      limit: 1
    })) as { messages: Array<{ id: string; text: string }> };
    expect(read.messages).toHaveLength(1);
    expect(read.messages[0]).toMatchObject({ id: "m2", text: "the last word" });
  });

  it("truncates long text and says so", async () => {
    await makeThread("t1", "2026-01-01T00:00:00.000Z");
    await makeMessage("m1", "t1", "2026-01-01T00:00:00.000Z", {
      content: "x".repeat(DEFAULT_MAX_CHARS + 500)
    });

    const truncated = (await run().invoke("get_thread", {
      thread_id: "t1"
    })) as { messages: Array<{ text: string; truncated: boolean }> };
    expect(truncated.messages[0].text).toHaveLength(DEFAULT_MAX_CHARS);
    expect(truncated.messages[0].truncated).toBe(true);

    const whole = (await run().invoke("get_thread", {
      thread_id: "t1",
      max_chars: 0
    })) as { messages: Array<{ text: string; truncated: boolean }> };
    expect(whole.messages[0].text).toHaveLength(DEFAULT_MAX_CHARS + 500);
    expect(whole.messages[0].truncated).toBe(false);
  });

  it("returns one message in full, arguments and all", async () => {
    await makeThread("t1", "2026-01-01T00:00:00.000Z");
    await makeMessage("m1", "t1", "2026-01-01T00:00:00.000Z", {
      role: "assistant",
      content: "calling a tool",
      tool_calls: [{ id: "c1", name: "web_search", args: { query: "otters" } }]
    });

    const summarized = (await run().invoke("get_thread", {
      thread_id: "t1"
    })) as { messages: Array<{ tool_calls?: Array<Record<string, unknown>> }> };
    expect(summarized.messages[0].tool_calls).toEqual([
      { id: "c1", name: "web_search" }
    ]);

    const full = (await run().invoke("get_message", {
      message_id: "m1"
    })) as { tool_calls?: Array<{ args: Record<string, unknown> }> };
    expect(full.tool_calls?.[0].args).toEqual({ query: "otters" });
  });

  it("reads another user's thread and message as missing", async () => {
    await makeThread("t-other", "2026-01-01T00:00:00.000Z", { userId: "u2" });
    await makeMessage("m1", "t-other", "2026-01-01T00:00:00.000Z");

    expect(
      await run("u2").invoke("get_thread", { thread_id: "t-other" })
    ).toMatchObject({ id: "t-other" });
    expect(
      await run("u3").invoke("get_thread", { thread_id: "t-other" })
    ).toEqual({ error: "Thread t-other was not found." });
    // The message is owned by u1, so u3 cannot read it either.
    expect(
      await run("u3").invoke("get_message", { message_id: "m1" })
    ).toEqual({ error: "Message m1 was not found." });
  });

  it("refuses a call with no user bound to the session", async () => {
    const anonymous = createCapabilityRun({
      context: {} as unknown as ProcessingContext,
      gate: UNGATED
    });
    expect(await anonymous.invoke("list_threads", {})).toEqual({
      error: "No user is bound to this session."
    });
  });
});
