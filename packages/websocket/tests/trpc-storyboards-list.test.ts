/**
 * storyboards router — the listing.
 *
 * Real DB, real models. The listing used to load every board in full and count
 * `shots.length` in JavaScript, so a sidebar of boards read every shot, take
 * and prompt the user owns. It now asks the database for the count; these
 * tests pin the answer it gives and that the document never leaves the row.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initTestDb, ModelObserver, Storyboard } from "@nodetool-ai/models";
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

const caller = (userId = "user-1") => createCaller(makeCtx(userId));

const shots = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    type: "shot" as const,
    id: `shot_${index}`,
    index,
    action: "A lighthouse at dawn.",
    status: "planned"
  }));

async function board(args: {
  name: string;
  projectId?: string;
  shotCount?: number;
  userId?: string;
}) {
  const created = await caller(args.userId).storyboards.create({
    name: args.name,
    projectId: args.projectId ?? "default"
  });
  if (args.shotCount) {
    await caller(args.userId).storyboards.update({
      id: created.id,
      baseUpdatedAt: created.updatedAt,
      document: {
        screenplay: null,
        shots: shots(args.shotCount),
        brief: "",
        style: "",
        entityIds: [],
        aspectRatio: "16:9",
        setupStage: "done",
        genre: "",
        directorModel: null,
        imageModel: null,
        videoModel: null
      }
    });
  }
  return created;
}

describe("storyboards.list", () => {
  beforeEach(() => initTestDb());
  afterEach(() => {
    ModelObserver.clear();
    vi.restoreAllMocks();
  });

  it("answers with each board's shot count", async () => {
    await board({ name: "Trailer", shotCount: 3 });
    await board({ name: "Blank" });

    const items = await caller().storyboards.list({});

    expect(
      Object.fromEntries(items.map((i) => [i.name, i.shotCount]))
    ).toEqual({ Trailer: 3, Blank: 0 });
  });

  it("filters by project", async () => {
    await board({ name: "In", projectId: "p1" });
    await board({ name: "Out", projectId: "p2" });

    const items = await caller().storyboards.list({ projectId: "p1" });

    expect(items.map((i) => i.name)).toEqual(["In"]);
  });

  it("shows the caller only their own boards", async () => {
    await board({ name: "Mine" });
    await board({ name: "Theirs", userId: "user-2" });

    const items = await caller().storyboards.list({});

    expect(items.map((i) => i.name)).toEqual(["Mine"]);
  });

  // The whole point: a listing must not read documents. Loading the rows is
  // what made a sidebar of boards cost megabytes.
  it("never loads a board's document", async () => {
    await board({ name: "Trailer", shotCount: 3 });
    const listByUser = vi.spyOn(Storyboard, "listByUser");
    const listByProject = vi.spyOn(Storyboard, "listByProject");

    const items = await caller().storyboards.list({});

    expect(items).toHaveLength(1);
    expect(listByUser).not.toHaveBeenCalled();
    expect(listByProject).not.toHaveBeenCalled();
  });
});
