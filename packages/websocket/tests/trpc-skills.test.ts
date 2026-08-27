import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initTestDb, ModelObserver } from "@nodetool-ai/models";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const createCaller = createCallerFactory(appRouter);

function makeCtx(userId: string | null): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

function caller(userId = "user-1") {
  return createCaller(makeCtx(userId));
}

async function createSkill(name = "writing") {
  return caller().skills.create({
    name,
    description: "A writing skill",
    content: "Write clearly."
  });
}

describe("skills router", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("creates, gets, lists, updates and deletes skills", async () => {
    const created = await createSkill();
    expect(created.content).toBe("Write clearly.");
    expect((await caller().skills.get({ id: created.id })).name).toBe("writing");
    expect((await caller().skills.list({})).map((item) => item.id)).toEqual([
      created.id
    ]);

    const updated = await caller().skills.update({
      id: created.id,
      baseUpdatedAt: created.updatedAt,
      name: "editing"
    });
    expect(updated.name).toBe("editing");

    await caller().skills.delete({ id: created.id });
    await expect(caller().skills.get({ id: created.id })).rejects.toThrow(
      /not found/i
    );
  });

  it("scopes reads and lists to the authenticated user", async () => {
    const created = await createSkill();
    const other = caller("user-2");
    expect(await other.skills.list({})).toEqual([]);
    await expect(other.skills.get({ id: created.id })).rejects.toThrow(
      /not found/i
    );
  });

  it("maps duplicate names to ALREADY_EXISTS", async () => {
    await createSkill("same");
    await expect(createSkill("same")).rejects.toMatchObject({
      cause: { apiCode: "ALREADY_EXISTS" }
    });
    await expect(caller("user-2").skills.create({
      name: "same",
      description: "A writing skill",
      content: "Write clearly."
    })).resolves.toBeTruthy();
  });

  it("requires a baseUpdatedAt and rejects stale updates", async () => {
    const created = await createSkill();
    await expect(
      caller().skills.update({ id: created.id, name: "renamed" })
    ).rejects.toThrow();

    const moved = await caller().skills.update({
      id: created.id,
      baseUpdatedAt: created.updatedAt,
      name: "moved"
    });
    expect(moved.name).toBe("moved");
    await expect(
      caller().skills.update({
        id: created.id,
        baseUpdatedAt: created.updatedAt,
        name: "stale"
      })
    ).rejects.toMatchObject({ cause: { apiCode: "ALREADY_EXISTS" } });
  });

  it("rejects unauthenticated access", async () => {
    await expect(createCaller(makeCtx(null)).skills.list({})).rejects.toThrow(
      /authentication required/i
    );
  });
});
