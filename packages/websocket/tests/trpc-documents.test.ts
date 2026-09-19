/**
 * The documents router — the project navigator's one read.
 *
 * Real DB, real resolver: the point of the endpoint is that one call answers
 * for every kind of document, scoped to the caller, so that is what is tested.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  Asset,
  ModelObserver,
  Script,
  Storyboard,
  Workflow,
  initTestDb
} from "@nodetool-ai/models";

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

describe("documents.index", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("answers for every kind of document in one call", async () => {
    await Workflow.create<Workflow>({
      user_id: "u1",
      project_id: "p1",
      name: "Pipeline",
      graph: { nodes: [], edges: [] }
    });
    await Script.create<Script>({
      user_id: "u1",
      project_id: "p1",
      name: "Voiceover"
    });
    await Storyboard.create<Storyboard>({
      user_id: "u1",
      project_id: "p1",
      name: "Board"
    });
    await Asset.create<Asset>({
      user_id: "u1",
      project_id: "p1",
      name: "keeper.png",
      content_type: "image/png",
      metadata: {
        nodetool_entity: {
          kind: "character",
          name: "Keeper",
          descriptor: "weathered coat"
        }
      }
    });

    const caller = createCaller(makeCtx("u1"));
    const index = await caller.documents.index({ projectId: "p1" });

    expect(index.partial).toBe(false);
    expect(
      Object.fromEntries(index.documents.map((d) => [d.type, d.name]))
    ).toEqual({
      workflow: "Pipeline",
      script: "Voiceover",
      storyboard: "Board",
      entity: "Keeper"
    });
    expect(
      index.documents.find((d) => d.type === "entity")?.entity?.kind
    ).toBe("character");
  });

  it("does not serve another user's documents", async () => {
    await Script.create<Script>({
      user_id: "u2",
      project_id: "p1",
      name: "Theirs"
    });

    const index = await createCaller(makeCtx("u1")).documents.index({
      projectId: "p1"
    });

    expect(index.documents).toEqual([]);
  });

  it("requires authentication", async () => {
    const caller = createCaller({ ...makeCtx("u1"), userId: undefined } as Context);

    await expect(caller.documents.index({ projectId: "p1" })).rejects.toThrow(
      /Authentication required/
    );
  });
});
