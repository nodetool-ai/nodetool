/**
 * Tests for the Thread model.
 *
 * Covers: constructor defaults, beforeSave, find (user-scoped), paginate.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { Thread } from "../src/thread.js";

// ── Setup ────────────────────────────────────────────────────────────

async function createThread(
  userId: string,
  title = "Test Thread"
): Promise<Thread> {
  return Thread.create<Thread>({ user_id: userId, title });
}

describe("Thread model", () => {
  beforeEach(() => {
    initTestDb();
  });

  afterEach(() => {
    ModelObserver.clear();
  });

  // ── Constructor defaults ──────────────────────────────────────────

  it("sets default values", () => {
    const thread = new Thread({ user_id: "u1" });
    expect(thread.id).toBeTruthy();
    expect(thread.title).toBe("");
    expect(thread.created_at).toBeTruthy();
    expect(thread.updated_at).toBeTruthy();
  });

  // ── beforeSave ────────────────────────────────────────────────────

  it("updates updated_at on save", async () => {
    const thread = await createThread("u1");
    const original = thread.updated_at;
    await new Promise((r) => setTimeout(r, 5));

    thread.title = "Updated";
    await thread.save();
    expect(thread.updated_at >= original).toBe(true);
  });

  // ── find (user-scoped) ────────────────────────────────────────────

  it("finds a thread owned by the user", async () => {
    const thread = await createThread("u1", "My Thread");
    const found = await Thread.find("u1", thread.id);
    expect(found).not.toBeNull();
    expect(found!.title).toBe("My Thread");
  });

  it("returns null for wrong user", async () => {
    const thread = await createThread("u1");
    const found = await Thread.find("u2", thread.id);
    expect(found).toBeNull();
  });

  it("returns null for nonexistent thread", async () => {
    const found = await Thread.find("u1", "nonexistent");
    expect(found).toBeNull();
  });

  // ── paginate ──────────────────────────────────────────────────────

  it("paginates threads for a user", async () => {
    await createThread("u1", "A");
    await createThread("u1", "B");
    await createThread("u1", "C");

    const [threads, cursor] = await Thread.paginate("u1");
    expect(threads).toHaveLength(3);
    expect(cursor).toBe("");
  });

  it("does not return threads from other users", async () => {
    await createThread("u1", "Mine");
    await createThread("u2", "Theirs");

    const [threads] = await Thread.paginate("u1");
    expect(threads).toHaveLength(1);
    expect(threads[0].title).toBe("Mine");
  });

  it("respects limit and returns cursor", async () => {
    for (let i = 0; i < 5; i++) {
      await createThread("u1", `Thread ${i}`);
    }

    const [threads, cursor] = await Thread.paginate("u1", { limit: 3 });
    expect(threads).toHaveLength(3);
    expect(cursor).toBeTruthy();
  });

  it("returns empty array for user with no threads", async () => {
    const [threads, cursor] = await Thread.paginate("u1");
    expect(threads).toHaveLength(0);
    expect(cursor).toBe("");
  });
});
