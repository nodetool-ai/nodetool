/**
 * scripts router — the resource back-pointers.
 *
 * Real DB, real models: a patch of `storyboardId` (and its `timelineId`
 * sibling) has to survive the write and come back on `get`, and clearing it
 * to null has to stick.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initTestDb, ModelObserver } from "@nodetool-ai/models";
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

const caller = () => createCaller(makeCtx("user-1"));

describe("scripts router back-pointers", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("patches, round-trips and clears the storyboard back-pointer", async () => {
    const created = await caller().scripts.create({
      name: "Trailer",
      projectId: "p1"
    });
    expect(created.storyboardId).toBeUndefined();

    const linked = await caller().scripts.update({
      id: created.id,
      storyboardId: "sb-1",
      baseUpdatedAt: created.updatedAt
    });
    expect(linked.storyboardId).toBe("sb-1");

    const fetched = await caller().scripts.get({ id: created.id });
    expect(fetched.storyboardId).toBe("sb-1");

    const cleared = await caller().scripts.update({
      id: created.id,
      storyboardId: null,
      baseUpdatedAt: fetched.updatedAt
    });
    expect(cleared.storyboardId).toBeUndefined();
    expect(
      (await caller().scripts.get({ id: created.id })).storyboardId
    ).toBeUndefined();
  });

  it("leaves the storyboard back-pointer alone when the patch omits it", async () => {
    const created = await caller().scripts.create({
      name: "Trailer",
      projectId: "p1"
    });
    const linked = await caller().scripts.update({
      id: created.id,
      storyboardId: "sb-1",
      baseUpdatedAt: created.updatedAt
    });

    const renamed = await caller().scripts.update({
      id: created.id,
      name: "Trailer v2",
      baseUpdatedAt: linked.updatedAt
    });
    expect(renamed.name).toBe("Trailer v2");
    expect(renamed.storyboardId).toBe("sb-1");
  });

  it("keeps the timeline and storyboard back-pointers independent", async () => {
    const created = await caller().scripts.create({
      name: "Trailer",
      projectId: "p1"
    });
    const both = await caller().scripts.update({
      id: created.id,
      timelineId: "tl-1",
      storyboardId: "sb-1",
      baseUpdatedAt: created.updatedAt
    });
    expect(both.timelineId).toBe("tl-1");
    expect(both.storyboardId).toBe("sb-1");

    const unlinked = await caller().scripts.update({
      id: created.id,
      storyboardId: null,
      baseUpdatedAt: both.updatedAt
    });
    expect(unlinked.timelineId).toBe("tl-1");
    expect(unlinked.storyboardId).toBeUndefined();
  });
});
