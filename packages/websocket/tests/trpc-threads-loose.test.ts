/**
 * threads.list claims loose threads for Personal before it reads, as
 * documents.index does. The chat list filters by project, so a thread still in
 * the loose bucket on the first read was missing until a reload.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelObserver, Thread, initTestDb } from "@nodetool-ai/models";

import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const createCaller = createCallerFactory(appRouter);

function makeCtx(userId: string): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

describe("threads.list", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("lists a loose thread in the Personal project", async () => {
    await Thread.create<Thread>({
      id: "loose-thread",
      user_id: "u1",
      project_id: "default",
      title: "Compare vector databases"
    });

    const { threads } = await createCaller(makeCtx("u1")).threads.list({});

    expect(threads.map((t) => [t.id, t.project_id])).toEqual([
      ["loose-thread", "personal:u1"]
    ]);
  });
});
