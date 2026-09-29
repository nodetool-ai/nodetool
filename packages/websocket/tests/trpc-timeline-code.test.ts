/**
 * `timeline.code` — tRPC. Real DB (`initTestDb`), real sandbox pack (the
 * shipped `sandbox-timeline`), no mocking of `@nodetool-ai/models`: this
 * router is a thin translation over the `*_timeline_code` capabilities in
 * `@nodetool-ai/agents`, so the behavior worth pinning here is the wire
 * shape — camelCase `groupId`/`bakedAt` from `code.get`, `timeline_id`
 * alongside camelCase `scenes`/`conflicts` from `code.set`/`code.rebake`,
 * and error mapping (not-found vs. a plain refusal).
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  createSandboxModuleCatalog,
  discoverSandboxPack
} from "@nodetool-ai/node-sdk";
import { setProcessSandboxModuleCatalog } from "@nodetool-ai/runtime";
import { initTestDb, TimelineSequence } from "@nodetool-ai/models";
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

const CODE = `
import { video } from "@nodetool-ai/sandbox-timeline";
const v = video({ width: 1080, height: 1920, fps: 30 });
v.series([v.scene("one", 1, (s) => { s.text("hi", {}); })]);
await v.save(nodetool.timelines, { name: "trpc code test" });
`;

beforeAll(() => {
  const discovery = discoverSandboxPack(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "sandbox-packs",
      "sandbox-timeline"
    )
  );
  if (discovery === undefined) {
    throw new Error("The shipped timeline pack is missing");
  }
  setProcessSandboxModuleCatalog(createSandboxModuleCatalog([discovery]));
});

describe("timeline.code", () => {
  it("get answers nulls for a timeline with no authoring code", async () => {
    initTestDb();
    const seq = new TimelineSequence({ user_id: "user-1", project_id: "p-1", name: "x" });
    await seq.save();

    const caller = createCaller(makeCtx());
    const result = await caller.timeline.code.get({ id: seq.id });
    expect(result).toEqual({ code: null, bakedAt: null, scenes: [] });
  });

  it("get refuses a timeline that is not the caller's, as NOT_FOUND", async () => {
    initTestDb();
    const seq = new TimelineSequence({ user_id: "user-1", project_id: "p-1", name: "x" });
    await seq.save();

    const caller = createCaller(makeCtx({ userId: "someone-else" }));
    await expect(caller.timeline.code.get({ id: seq.id })).rejects.toMatchObject(
      { code: "NOT_FOUND" }
    );
  });

  it("set bakes and writes, answering the camelCase scene report next to timeline_id", async () => {
    initTestDb();
    const seq = new TimelineSequence({ user_id: "user-1", project_id: "p-1", name: "x" });
    await seq.save();

    const caller = createCaller(makeCtx());
    const result = await caller.timeline.code.set({ id: seq.id, code: CODE });
    expect(result.timeline_id).toBe(seq.id);
    expect(result.errors).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.scenes).toEqual([
      { name: "one", groupId: expect.any(String), edited: false }
    ]);

    const get = await caller.timeline.code.get({ id: seq.id });
    expect(get.code).toBe(CODE);
    expect(get.bakedAt).toEqual(expect.any(String));
    expect(get.scenes).toEqual([
      { name: "one", groupId: expect.any(String), edited: false }
    ]);
  });

  it("set refuses empty code as a bad-request error, not a write-result shape", async () => {
    initTestDb();
    const seq = new TimelineSequence({ user_id: "user-1", project_id: "p-1", name: "x" });
    await seq.save();

    const caller = createCaller(makeCtx());
    await expect(
      caller.timeline.code.set({ id: seq.id, code: "   " })
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("rebake keeps a hand-edited scene and reports it in conflicts; force overwrites it", async () => {
    initTestDb();
    const seq = new TimelineSequence({ user_id: "user-1", project_id: "p-1", name: "x" });
    await seq.save();
    const caller = createCaller(makeCtx());
    await caller.timeline.code.set({ id: seq.id, code: CODE });

    // Simulate a hand edit made outside the code (the editor, or an
    // `edit_timeline` op) by writing the document directly.
    const before = await TimelineSequence.findById(seq.id);
    const doc = before!.toDocument();
    const textClip = doc.clips.find((c) => c.mediaType === "text")!;
    textClip.textStyle = { ...textClip.textStyle, text: "hand edited" };
    await TimelineSequence.updateFieldsIfUnchanged(
      seq.id,
      before!.updated_at,
      { document: JSON.stringify(doc) }
    );

    const rebaked = await caller.timeline.code.rebake({ id: seq.id });
    expect(rebaked.conflicts).toEqual([
      { scene: "one", reason: "edited since the last bake" }
    ]);
    expect(rebaked.scenes).toEqual([
      { name: "one", groupId: expect.any(String), edited: true }
    ]);

    const forced = await caller.timeline.code.rebake({
      id: seq.id,
      force: true
    });
    expect(forced.conflicts).toEqual([]);
  });

  it("keeps the code through an ordinary editor save", async () => {
    initTestDb();
    const seq = new TimelineSequence({ user_id: "user-1", project_id: "p-1", name: "x" });
    await seq.save();
    const caller = createCaller(makeCtx());
    await caller.timeline.code.set({ id: seq.id, code: CODE });

    // The editor autosave sends the document it holds, which has no source.
    const loaded = await caller.timeline.get({ id: seq.id });
    const clips = loaded.clips.map((c) =>
      c.mediaType === "text"
        ? { ...c, textStyle: { ...c.textStyle, text: "hand edited" } }
        : c
    );
    await caller.timeline.update({
      id: seq.id,
      document: { tracks: loaded.tracks, clips, markers: loaded.markers }
    });

    const get = await caller.timeline.code.get({ id: seq.id });
    expect(get.code).toBe(CODE);
    expect(get.scenes).toEqual([
      { name: "one", groupId: expect.any(String), edited: true }
    ]);
  });

  it("detach stops tracking a scene and answers its name", async () => {
    initTestDb();
    const seq = new TimelineSequence({ user_id: "user-1", project_id: "p-1", name: "x" });
    await seq.save();
    const caller = createCaller(makeCtx());
    await caller.timeline.code.set({ id: seq.id, code: CODE });

    const detached = await caller.timeline.code.detach({
      id: seq.id,
      scenes: ["one"]
    });
    expect(detached).toEqual({ scenes: ["one"] });

    const after = await TimelineSequence.findById(seq.id);
    expect(after!.toDocument().source?.scenes["one"]).toBeUndefined();
    // Detaching stops tracking the scene; it does not drop the code itself.
    expect(after!.toDocument().source?.code).toBe(CODE);
  });
});
