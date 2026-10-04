import { beforeEach, describe, expect, it } from "vitest";
import { initTestDb } from "../src/db.js";
import { Message, COMPACTION_EVENT_TYPE } from "../src/message.js";
import { Thread } from "../src/thread.js";
import { threadHasTraceContentTools } from "../src/trace-provenance.js";

describe("thread trace tool provenance", () => {
  beforeEach(() => { initTestDb(); });

  it("finds protected tool calls before compacted and recent history", async () => {
    const thread = await Thread.create({ user_id: "owner" });
    await Message.create({ user_id: "owner", thread_id: thread.id, role: "assistant", created_at: "2020-01-01", tool_calls: [{ function: { name: "email" } }] });
    await Message.create({ user_id: "owner", thread_id: thread.id, created_at: "2026-01-01", content: "Compacted summary", execution_event_type: COMPACTION_EVENT_TYPE });
    await Message.create({ user_id: "owner", thread_id: thread.id, created_at: "2026-01-02", content: "Recent turn" });
    const [recent] = await Message.paginate(thread.id, { reverse: true, limit: 2 });
    expect(recent).toHaveLength(2); expect(recent.every((message) => message.tool_calls === null)).toBe(true);
    expect(await threadHasTraceContentTools("owner", thread.id, ["email", "google", "browser"])).toBe(true);
  });

  it("isolates owners and threads without treating message bodies as tool calls", async () => {
    const thread = await Thread.create({ user_id: "owner" });
    await Message.create({ user_id: "foreign", thread_id: thread.id, role: "tool", name: "email" });
    await Message.create({ user_id: "owner", thread_id: "other-thread", tool_calls: [{ name: "email" }] });
    await Message.create({ user_id: "owner", thread_id: thread.id, content: "email google browser function.name email" });
    expect(await threadHasTraceContentTools("owner", thread.id, ["email"])).toBe(false);
    expect(await threadHasTraceContentTools("foreign", thread.id, ["email"])).toBe(true);
    expect(await threadHasTraceContentTools("owner", thread.id, [])).toBe(false);
  });

  it("preserves compaction tool provenance after its source tool message is deleted", async () => {
    const thread = await Thread.create({ user_id: "owner" });
    const original = await Message.create({ user_id: "owner", thread_id: thread.id, name: "email" });
    await Message.create({ user_id: "owner", thread_id: thread.id, execution_event_type: COMPACTION_EVENT_TYPE, content: "Compacted third-party text", tools: ["email"] });
    await original.delete();
    expect(await threadHasTraceContentTools("owner", thread.id, ["email"])).toBe(true);
    expect(await threadHasTraceContentTools("foreign", thread.id, ["email"])).toBe(false);
    expect(await threadHasTraceContentTools("owner", thread.id, ["email.search"])).toBe(false);
    await Message.create({ user_id: "owner", thread_id: "ordinary", tools: ["email"] });
    expect(await threadHasTraceContentTools("owner", "ordinary", ["email"])).toBe(false);
  });

  it.each([
    { name: "email", calls: null, expected: true },
    { name: "email.search", calls: [{ name: "google-extra" }], expected: false },
    { name: null, calls: [{ name: "email" }], expected: true },
    { name: null, calls: [{ function: { name: "browser" } }], expected: true },
    { name: null, calls: [null, "email", 1, false, ["email"], { function: "email" }], expected: false },
    { name: null, calls: [null, "email", { function: { name: "google" } }], expected: true }
  ])("matches exact stored names across supported tool-call shapes: $name $expected", async ({ name, calls, expected }) => {
    const thread = await Thread.create({ user_id: "owner" });
    await Message.create({ user_id: "owner", thread_id: thread.id, name, tool_calls: calls });
    expect(await threadHasTraceContentTools("owner", thread.id, ["email", "google", "browser"])).toBe(expected);
  });
});
