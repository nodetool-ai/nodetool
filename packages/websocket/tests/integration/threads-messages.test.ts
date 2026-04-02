import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { initTestDb } from "@nodetool/models";
import { startServer, stopServer, get, post, put, del } from "./setup.js";

beforeAll(startServer);
afterAll(stopServer);
beforeEach(() => initTestDb());

describe("Thread CRUD", () => {
  it("creates a thread with a title", async () => {
    const res = await post("/threads", { title: "My Thread" });
    expect(res.status).toBe(200);
    const thread = await res.json();
    expect(thread.id).toBeTypeOf("string");
    expect(thread.title).toBe("My Thread");
    expect(thread.user_id).toBe("test-user");
  });

  it("defaults title to 'New Thread'", async () => {
    const thread = await (await post("/threads", {})).json();
    expect(thread.title).toBe("New Thread");
  });

  it("lists only the current user's threads", async () => {
    await post("/threads", { title: "Mine" });
    await post("/threads", { title: "Also mine" });
    await post("/threads", { title: "Other's" }, { userId: "other-user" });

    const res = await get("/threads");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.threads).toHaveLength(2);
  });

  it("gets a thread by ID", async () => {
    const created = await (
      await post("/threads", { title: "Fetch me" })
    ).json();
    const res = await get(`/threads/${created.id}`);
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe("Fetch me");
  });

  it("returns 404 for another user's thread", async () => {
    const created = await (await post("/threads", { title: "Secret" })).json();
    const res = await get(`/threads/${created.id}`, { userId: "intruder" });
    expect(res.status).toBe(404);
  });

  it("updates a thread title", async () => {
    const created = await (await post("/threads", { title: "Old" })).json();
    const res = await put(`/threads/${created.id}`, { title: "New" });
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe("New");
  });

  it("prevents cross-user thread updates", async () => {
    const created = await (await post("/threads", { title: "Mine" })).json();
    const res = await put(
      `/threads/${created.id}`,
      { title: "Hacked" },
      { userId: "attacker" }
    );
    expect(res.status).toBe(404);
  });
});

describe("Message CRUD", () => {
  it("creates a message and auto-creates a thread", async () => {
    const res = await post("/messages", { role: "user", content: "Hello" });
    expect(res.status).toBe(200);
    const msg = await res.json();
    expect(msg.content).toBe("Hello");
    expect(msg.role).toBe("user");
    expect(msg.thread_id).toBeTypeOf("string");
  });

  it("creates a message in an existing thread", async () => {
    const thread = await (await post("/threads", { title: "Chat" })).json();

    const res = await post("/messages", {
      thread_id: thread.id,
      role: "assistant",
      content: "Hi there"
    });
    expect(res.status).toBe(200);
    const msg = await res.json();
    expect(msg.thread_id).toBe(thread.id);
  });

  it("lists messages by thread", async () => {
    const thread = await (await post("/threads", { title: "Chat" })).json();

    await post("/messages", {
      thread_id: thread.id,
      role: "user",
      content: "First"
    });
    await post("/messages", {
      thread_id: thread.id,
      role: "assistant",
      content: "Second"
    });

    const res = await get(`/messages?thread_id=${thread.id}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.messages).toHaveLength(2);
  });

  it("returns 400 when listing messages without thread_id", async () => {
    const res = await get("/messages");
    expect(res.status).toBe(400);
  });

  it("gets a message by ID", async () => {
    const msg = await (
      await post("/messages", { role: "user", content: "test" })
    ).json();

    const res = await get(`/messages/${msg.id}`);
    expect(res.status).toBe(200);
    expect((await res.json()).content).toBe("test");
  });

  it("returns 404 for another user's message", async () => {
    const msg = await (
      await post("/messages", { role: "user", content: "private" })
    ).json();

    const res = await get(`/messages/${msg.id}`, { userId: "other" });
    expect(res.status).toBe(404);
  });
});

describe("Thread deletion cascades to messages", () => {
  it("deleting a thread removes all its messages", async () => {
    const thread = await (await post("/threads", { title: "Bye" })).json();
    const msg = await (
      await post("/messages", {
        thread_id: thread.id,
        role: "user",
        content: "gone soon"
      })
    ).json();

    const delRes = await del(`/threads/${thread.id}`);
    expect(delRes.status).toBe(204);

    expect((await get(`/threads/${thread.id}`)).status).toBe(404);
    expect((await get(`/messages/${msg.id}`)).status).toBe(404);
  });
});
