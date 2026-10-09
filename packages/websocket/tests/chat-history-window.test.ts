/**
 * A turn's history is the thread's newest rows. A thread longer than the
 * window must lose its oldest turns, never the latest ones: the user message
 * the turn answers is the newest row of all.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { initTestDb, Message } from "@nodetool-ai/models";
import { loadRecentThreadRows } from "../src/session/chat-turn.js";

const at = (n: number) =>
  new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();

/** Each turn: a user ask, an assistant tool call, and the tool's result. */
async function seedTurns(threadId: string, turns: number): Promise<void> {
  for (let turn = 1; turn <= turns; turn++) {
    const base = { thread_id: threadId, user_id: "1" };
    await Message.create({
      ...base,
      created_at: at(turn * 3),
      role: "user",
      content: `ask ${turn}`
    });
    await Message.create({
      ...base,
      created_at: at(turn * 3 + 1),
      role: "assistant",
      content: `answer ${turn}`,
      tool_calls: [{ id: `call-${turn}`, name: "search", args: {} }]
    });
    await Message.create({
      ...base,
      created_at: at(turn * 3 + 2),
      role: "tool",
      tool_call_id: `call-${turn}`,
      content: `result ${turn}`
    });
  }
}

describe("loadRecentThreadRows", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("returns the whole thread, oldest first, when it fits", async () => {
    await seedTurns("t-short", 2);
    const rows = await loadRecentThreadRows("t-short", 10);
    expect(rows.map((row) => row.content)).toEqual([
      "ask 1",
      "answer 1",
      "result 1",
      "ask 2",
      "answer 2",
      "result 2"
    ]);
  });

  it("keeps the newest rows of a thread longer than the window", async () => {
    await seedTurns("t-long", 4);
    const rows = await loadRecentThreadRows("t-long", 5);
    expect(rows.at(-1)?.content).toBe("result 4");
    expect(rows.map((row) => row.content)).not.toContain("ask 1");
  });

  it("starts a cut window at a user row, never at an orphaned tool result", async () => {
    await seedTurns("t-cut", 4);
    // The newest 5 rows begin with turn 3's assistant call and tool result.
    const rows = await loadRecentThreadRows("t-cut", 5);
    expect(rows.map((row) => row.content)).toEqual([
      "ask 4",
      "answer 4",
      "result 4"
    ]);
  });
});
