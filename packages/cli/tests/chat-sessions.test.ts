import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ChatSessionStore,
  newSessionId,
  type ChatSession
} from "../src/chat-sessions.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  );
});
it("resumes full local context and keeps sessions scoped to workspace and server", async () => {
  const path = await mkdtemp(join(tmpdir(), "nodetool-sessions-"));
  directories.push(path);
  const store = new ChatSessionStore(path);
  const id = newSessionId();
  const session: ChatSession = {
    version: 1,
    id,
    threadId: newSessionId(),
    title: "Make a film",
    updatedAt: new Date().toISOString(),
    workspace: path,
    provider: "openai",
    model: "model",
    messages: [{ id: "m", role: "user", content: "Make a film" }],
    history: [
      { role: "user", content: "Make a film" },
      {
        role: "assistant",
        content: null,
        toolCalls: [
          {
            id: "tc",
            name: "view_image",
            args: { image: "asset://0123456789abcdef0123456789abcdef" }
          }
        ]
      },
      {
        role: "tool",
        toolCallId: "tc",
        content: [
          {
            type: "image_url",
            image: { data: new Uint8Array([1, 2, 3]), mimeType: "image/png" }
          }
        ]
      }
    ],
    providerSession: {
      providerId: "openai",
      model: "model",
      checkpoint: 3,
      token: "continuation"
    }
  };
  await store.save(session);
  await writeFile(join(path, `${newSessionId()}.json`), "{broken");
  const saved = await store.list(path);
  expect(saved).toHaveLength(1);
  expect(saved[0]?.history[2]?.content).toEqual([
    { type: "image_url", image: { data: "AQID", mimeType: "image/png" } }
  ]);
  expect(saved[0]?.providerSession).toEqual(session.providerSession);
  expect(saved[0]?.threadId).toBe(session.threadId);
  expect(await store.list(join(path, "other"))).toEqual([]);
  expect(await store.list(path, "ws://server/ws")).toEqual([]);
  if (process.platform !== "win32")
    expect((await stat(join(path, `${id}.json`))).mode & 0o777).toBe(0o600);
});
it("rejects invalid session identifiers before writing outside its directory", async () => {
  const path = await mkdtemp(join(tmpdir(), "nodetool-sessions-"));
  directories.push(path);
  const store = new ChatSessionStore(path);
  await expect(
    store.save({
      version: 1,
      id: "../escape",
      threadId: "thread",
      title: "x",
      updatedAt: "today",
      workspace: path,
      provider: "p",
      model: "m",
      messages: [],
      history: []
    })
  ).rejects.toThrow();
  await writeFile(join(path, `${newSessionId()}.json`), "{}");
  expect(await store.list(path)).toEqual([]);
});
