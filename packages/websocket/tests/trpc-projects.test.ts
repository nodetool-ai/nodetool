/**
 * projects router — ownership, the document gather, and the derived rollup.
 *
 * Real DB, real models: a project is a name over rows that already carry its
 * id, so what `get` returns is only as good as the read-back it derives.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  initTestDb,
  LOOSE_PROJECT_ID,
  ModelObserver,
  Prediction,
  Script,
  Storyboard
} from "@nodetool-ai/models";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const createCallerFor = createCallerFactory(appRouter);

function makeCtx(userId: string): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

const caller = (userId = "user-1") => createCallerFor(makeCtx(userId));

describe("projects router", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("creates, lists, updates and deletes", async () => {
    const created = await caller().projects.create({
      name: "Aurora Launch Spot",
      kind: "spot"
    });
    expect(created.name).toBe("Aurora Launch Spot");

    expect((await caller().projects.list({})).map((p) => p.id)).toEqual([
      created.id
    ]);

    const renamed = await caller().projects.update({
      id: created.id,
      name: "Aurora"
    });
    expect(renamed.name).toBe("Aurora");
    expect(renamed.kind).toBe("spot");

    await caller().projects.delete({ id: created.id });
    expect(await caller().projects.list({})).toEqual([]);
  });

  it("hides another user's project behind not-found", async () => {
    const theirs = await caller("user-2").projects.create({
      name: "Theirs",
      kind: ""
    });
    await expect(caller().projects.get({ id: theirs.id })).rejects.toThrow(
      /not found/i
    );
    await expect(
      caller().projects.update({ id: theirs.id, name: "Mine" })
    ).rejects.toThrow(/not found/i);
    await expect(
      caller().projects.delete({ id: theirs.id })
    ).rejects.toThrow(/not found/i);
  });

  it("returns each document with its status and the project's spend", async () => {
    const project = await caller().projects.create({ name: "Aurora", kind: "spot" });
    const board = await Storyboard.create<Storyboard>({
      user_id: "user-1",
      project_id: project.id,
      name: "Board",
      document: JSON.stringify({
        screenplay: null,
        shots: [
          {
            type: "shot",
            id: "a",
            index: 0,
            action: "wide",
            status: "draft",
            keyframe: { type: "image", uri: "asset://1" }
          },
          { type: "shot", id: "b", index: 1, action: "close", status: "draft" }
        ],
        brief: "",
        style: "",
        entityIds: [],
        aspectRatio: "16:9",
        directorModel: null,
        imageModel: null,
        videoModel: null
      })
    });
    await Prediction.create<Prediction>({
      user_id: "user-1",
      project_id: project.id,
      document_id: board.id,
      cost: 0.5,
      metadata: { capability: "text_to_image" }
    });

    const detail = await caller().projects.get({ id: project.id });
    expect(detail.project.name).toBe("Aurora");
    expect(detail.documents).toEqual([
      {
        type: "storyboard",
        ref: board.id,
        name: "Board",
        updatedAt: board.updated_at,
        status: { kind: "storyboard", shots: 2, stills: 1, clips: 0 },
        spendUsd: 0.5,
        unpricedCount: 0,
        thumbnails: [{ uri: "asset://1", asset_id: null }]
      }
    ]);
    expect(detail.spend.totalUsd).toBeCloseTo(0.5, 6);
    expect(detail.spend.byCategory).toContainEqual({
      category: "stills",
      usd: 0.5,
      unpricedCount: 0
    });

    const refs = await caller().projects.documents({ id: project.id });
    expect(refs).toEqual([
      {
        type: "storyboard",
        ref: board.id,
        name: "Board",
        updatedAt: board.updated_at
      }
    ]);
  });

  it("returns one rollup per project in summaries", async () => {
    const aurora = await caller().projects.create({ name: "Aurora", kind: "" });
    await caller().projects.create({ name: "Meridian", kind: "" });
    await Storyboard.create<Storyboard>({
      user_id: "user-1",
      project_id: aurora.id,
      name: "Board"
    });
    // Another user's project must not appear in this user's list.
    await caller("user-2").projects.create({ name: "Theirs", kind: "" });

    const summaries = await caller().projects.summaries({});
    expect(summaries.map((s) => s.project.name).sort()).toEqual([
      "Aurora",
      "Meridian"
    ]);
    const auroraSummary = summaries.find((s) => s.project.id === aurora.id);
    expect(auroraSummary?.documents.map((d) => d.name)).toEqual(["Board"]);
  });

  it("lists the documents in no project, and moves one in and back out", async () => {
    const project = await caller().projects.create({ name: "Aurora", kind: "" });
    const loose = await Script.create<Script>({
      user_id: "user-1",
      name: "Scratch VO"
    });
    await Script.create<Script>({ user_id: "user-2", name: "Theirs" });

    expect((await caller().projects.unassigned({})).map((d) => d.ref)).toEqual([
      loose.id
    ]);

    await caller().projects.assignDocument({
      projectId: project.id,
      type: "script",
      ref: loose.id
    });
    expect(await caller().projects.unassigned({})).toEqual([]);
    expect(
      (await caller().projects.documents({ id: project.id })).map((d) => d.ref)
    ).toEqual([loose.id]);

    await caller().projects.assignDocument({
      projectId: LOOSE_PROJECT_ID,
      type: "script",
      ref: loose.id
    });
    expect((await caller().projects.unassigned({})).map((d) => d.ref)).toEqual([
      loose.id
    ]);
  });

  it("refuses a move into a project the caller does not own, and of a document they do not own", async () => {
    const theirs = await caller("user-2").projects.create({
      name: "Theirs",
      kind: ""
    });
    const mine = await Script.create<Script>({ user_id: "user-1", name: "Mine" });
    await expect(
      caller().projects.assignDocument({
        projectId: theirs.id,
        type: "script",
        ref: mine.id
      })
    ).rejects.toThrow(/not found/i);

    const project = await caller().projects.create({ name: "Aurora", kind: "" });
    const notMine = await Script.create<Script>({
      user_id: "user-2",
      name: "Theirs"
    });
    await expect(
      caller().projects.assignDocument({
        projectId: project.id,
        type: "script",
        ref: notMine.id
      })
    ).rejects.toThrow(/not found/i);
  });
});
