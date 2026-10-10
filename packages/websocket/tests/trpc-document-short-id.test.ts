/**
 * The document routers load a row by an exact 12-character prefix of its id,
 * the form agent-facing tools hand out. Every write after that load must use
 * the loaded row's full id: the conditional updates and the thread cleanup
 * match ids exactly, so a prefix would match nothing.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Message,
  ModelObserver,
  Thread,
  initTestDb
} from "@nodetool-ai/models";

import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const USER_ID = "user-1";

const createCaller = createCallerFactory(appRouter);
const caller = () =>
  createCaller({
    userId: USER_ID,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context);

const short = (id: string): string => id.slice(0, 12);

describe("document routers with short ids", () => {
  beforeEach(() => {
    initTestDb();
  });
  afterEach(() => {
    ModelObserver.clear();
  });

  it("updates a sketch named by its short id", async () => {
    const doc = await caller().sketch.create({
      name: "Sketch",
      projectId: "default",
      width: 64,
      height: 64
    });
    const updated = await caller().sketch.update({
      id: short(doc.id),
      name: "Renamed"
    });
    expect(updated.name).toBe("Renamed");
  });

  it("updates a timeline named by its short id", async () => {
    const seq = await caller().timeline.create({
      name: "Cut",
      projectId: "default"
    });
    const updated = await caller().timeline.update({
      id: short(seq.id),
      name: "Final cut"
    });
    expect(updated.name).toBe("Final cut");
  });

  it("updates a storyboard named by its short id", async () => {
    const board = await caller().storyboards.create({ name: "Board" });
    const updated = await caller().storyboards.update({
      id: short(board.id),
      name: "Shots"
    });
    expect(updated.name).toBe("Shots");
  });

  it("deletes a thread's messages when the thread is named by its short id", async () => {
    const thread = (await Thread.create({
      user_id: USER_ID,
      title: "Chat"
    })) as Thread;
    await Message.create({
      thread_id: thread.id,
      user_id: USER_ID,
      role: "user",
      content: "hello"
    });

    await caller().threads.delete({ id: short(thread.id) });

    const [remaining] = await Message.paginate(thread.id, { limit: 10 });
    expect(remaining).toEqual([]);
  });
});
