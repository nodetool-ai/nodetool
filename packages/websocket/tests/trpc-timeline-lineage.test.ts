/**
 * `timeline.create` with `templateId` — tRPC over a real in-memory DB. A
 * format adaptation records the sequence it came from; a later save keeps it,
 * so the lineage has to be written when the sequence is created.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { initTestDb } from "@nodetool-ai/models";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const createCaller = createCallerFactory(appRouter);

function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    userId: "user-1",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false,
    ...overrides
  };
}

describe("timeline.create templateId (O7)", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("records the source sequence and keeps it through a save", async () => {
    const caller = createCaller(makeCtx());
    const source = await caller.timeline.create({
      name: "Source",
      projectId: "p-1"
    });
    const derived = await caller.timeline.create({
      name: "Source — 9:16",
      projectId: "p-1",
      width: 1080,
      height: 1920,
      templateId: source.id
    });
    expect(derived.templateId).toBe(source.id);

    await caller.timeline.update({
      id: derived.id,
      document: { tracks: [], clips: [], markers: [] }
    });
    const saved = await caller.timeline.get({ id: derived.id });
    expect(saved.templateId).toBe(source.id);
  });

  it("refuses a source the caller does not own", async () => {
    const other = await createCaller(
      makeCtx({ userId: "user-2" })
    ).timeline.create({ name: "Theirs", projectId: "p-2" });
    await expect(
      createCaller(makeCtx()).timeline.create({
        name: "Mine",
        projectId: "p-1",
        templateId: other.id
      })
    ).rejects.toThrow(/not found/i);
  });
});
