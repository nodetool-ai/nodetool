/**
 * Tests for the Message model.
 *
 * Covers: constructor defaults, legacy boolean coercion, find, paginate.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { Message } from "../src/message.js";

// ── Setup ────────────────────────────────────────────────────────────

async function createMessage(
  userId: string,
  threadId: string,
  overrides: Record<string, unknown> = {}
): Promise<Message> {
  return Message.create<Message>({
    user_id: userId,
    thread_id: threadId,
    role: "user",
    content: "Hello",
    ...overrides
  });
}

describe("Message model", () => {
  beforeEach(() => {
    initTestDb();
  });

  afterEach(() => {
    ModelObserver.clear();
  });

  // ── Constructor defaults ──────────────────────────────────────────

  it("sets default values", () => {
    const msg = new Message({ user_id: "u1", thread_id: "t1" });
    expect(msg.id).toBeTruthy();
    expect(msg.role).toBe("user");
    expect(msg.name).toBeNull();
    expect(msg.content).toBeNull();
    expect(msg.tool_calls).toBeNull();
    expect(msg.tool_call_id).toBeNull();
    expect(msg.input_files).toBeNull();
    expect(msg.output_files).toBeNull();
    expect(msg.provider).toBeNull();
    expect(msg.model).toBeNull();
    expect(msg.cost).toBeNull();
    expect(msg.workflow_id).toBeNull();
    expect(msg.graph).toBeNull();
    expect(msg.tools).toBeNull();
    expect(msg.collections).toBeNull();
    expect(msg.agent_mode).toBeNull();
    expect(msg.help_mode).toBeNull();
    expect(msg.provider_session).toBeNull();
    expect(msg.created_at).toBeTruthy();
  });

  // ── Legacy boolean coercion ───────────────────────────────────────

  it("coerces numeric agent_mode to boolean", () => {
    const msg1 = new Message({ user_id: "u1", thread_id: "t1", agent_mode: 1 });
    expect(msg1.agent_mode).toBe(true);

    const msg2 = new Message({ user_id: "u1", thread_id: "t1", agent_mode: 0 });
    expect(msg2.agent_mode).toBe(false);
  });

  it("coerces numeric help_mode to boolean", () => {
    const msg1 = new Message({ user_id: "u1", thread_id: "t1", help_mode: 1 });
    expect(msg1.help_mode).toBe(true);

    const msg2 = new Message({ user_id: "u1", thread_id: "t1", help_mode: 0 });
    expect(msg2.help_mode).toBe(false);
  });

  it("preserves boolean agent_mode", () => {
    const msg = new Message({
      user_id: "u1",
      thread_id: "t1",
      agent_mode: true
    });
    expect(msg.agent_mode).toBe(true);
  });

  // ── find ──────────────────────────────────────────────────────────

  it("finds a message by id", async () => {
    const msg = await createMessage("u1", "t1", { content: "Test content" });
    const found = await Message.find(msg.id);
    expect(found).not.toBeNull();
    expect(found!.content).toBe("Test content");
  });

  it("returns null for nonexistent message", async () => {
    const found = await Message.find("nonexistent");
    expect(found).toBeNull();
  });

  // ── paginate ──────────────────────────────────────────────────────

  it("paginates messages in a thread", async () => {
    await createMessage("u1", "t1", { content: "A" });
    await createMessage("u1", "t1", { content: "B" });
    await createMessage("u1", "t1", { content: "C" });

    const [messages, cursor] = await Message.paginate("t1");
    expect(messages).toHaveLength(3);
    expect(cursor).toBe("");
  });

  it("does not return messages from other threads", async () => {
    await createMessage("u1", "t1", { content: "Mine" });
    await createMessage("u1", "t2", { content: "Other" });

    const [messages] = await Message.paginate("t1");
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe("Mine");
  });

  it("respects limit and returns cursor", async () => {
    for (let i = 0; i < 5; i++) {
      await createMessage("u1", "t1", { content: `Msg ${i}` });
    }

    const [messages, cursor] = await Message.paginate("t1", { limit: 3 });
    expect(messages).toHaveLength(3);
    expect(cursor).toBeTruthy();
  });

  it("advances past the cursor instead of repeating the first page", async () => {
    // Regression: startKey was ignored, so following the returned cursor
    // re-fetched the same first page forever.
    for (let i = 0; i < 5; i++) {
      await createMessage("u1", "t1", { content: `Msg ${i}` });
      await new Promise((r) => setTimeout(r, 2));
    }

    const [page1, cursor1] = await Message.paginate("t1", { limit: 2 });
    expect(page1.map((m) => m.content)).toEqual(["Msg 0", "Msg 1"]);
    expect(cursor1).toBeTruthy();

    const [page2, cursor2] = await Message.paginate("t1", {
      limit: 2,
      startKey: cursor1
    });
    expect(page2.map((m) => m.content)).toEqual(["Msg 2", "Msg 3"]);

    const [page3] = await Message.paginate("t1", {
      limit: 2,
      startKey: cursor2
    });
    expect(page3.map((m) => m.content)).toEqual(["Msg 4"]);
  });

  it("advances past the cursor in reverse ordering too", async () => {
    for (let i = 0; i < 4; i++) {
      await createMessage("u1", "t1", { content: `Msg ${i}` });
      await new Promise((r) => setTimeout(r, 2));
    }
    const [page1, cursor1] = await Message.paginate("t1", {
      limit: 2,
      reverse: true
    });
    expect(page1.map((m) => m.content)).toEqual(["Msg 3", "Msg 2"]);
    const [page2] = await Message.paginate("t1", {
      limit: 2,
      reverse: true,
      startKey: cursor1
    });
    expect(page2.map((m) => m.content)).toEqual(["Msg 1", "Msg 0"]);
  });

  it("returns empty for thread with no messages", async () => {
    const [messages, cursor] = await Message.paginate("t1");
    expect(messages).toHaveLength(0);
    expect(cursor).toBe("");
  });

  it("supports reverse ordering", async () => {
    await createMessage("u1", "t1", { content: "First" });
    await new Promise((r) => setTimeout(r, 5));
    await createMessage("u1", "t1", { content: "Last" });

    const [normal] = await Message.paginate("t1", { reverse: false });
    const [reversed] = await Message.paginate("t1", { reverse: true });

    expect(normal[0].content).toBe("First");
    expect(reversed[0].content).toBe("Last");
  });

  // ── CRUD ──────────────────────────────────────────────────────────

  it("creates and retrieves with all fields", async () => {
    const msg = await createMessage("u1", "t1", {
      role: "assistant",
      content: "Hello!",
      provider: "anthropic",
      model: "claude-3",
      cost: 0.01,
      agent_mode: true
    });

    const loaded = await Message.get<Message>(msg.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.role).toBe("assistant");
    expect(loaded!.content).toBe("Hello!");
    expect(loaded!.provider).toBe("anthropic");
    expect(loaded!.model).toBe("claude-3");
    expect(loaded!.cost).toBe(0.01);
    expect(loaded!.agent_mode).toBe(true);
  });

  // ── provider_session round-trip ───────────────────────────────────

  it("round-trips the provider_session continuation token", async () => {
    const session = {
      providerId: "claude_agent_sdk",
      model: "haiku",
      token: "sess-abc",
      checkpoint: 4,
      systemHash: "deadbeef"
    };
    const msg = await createMessage("u1", "t1", {
      role: "assistant",
      content: "Hi",
      provider: "claude_agent_sdk",
      model: "haiku",
      provider_session: session
    });

    const loaded = await Message.get<Message>(msg.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.provider_session).toEqual(session);
  });

  it("defaults provider_session to null when absent", async () => {
    const msg = await createMessage("u1", "t1", { content: "no session" });
    const loaded = await Message.get<Message>(msg.id);
    expect(loaded!.provider_session).toBeNull();
  });
});
