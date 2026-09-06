/**
 * Finding the copy a recast made, past the end of the listing.
 *
 * `RecastStoryboard` reuses the board it derived last run instead of deriving
 * (and re-rendering) a second one. It used to find it by scanning
 * `listByProject`, which answers with the 50 most recently updated rows — so a
 * catalog batch bigger than that window lost its own copies and paid for them
 * again on every pass. `findRecast` asks the database for the one row instead.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { initTestDb } from "../src/db.js";
import {
  Storyboard,
  emptyStoryboardDocument,
  type StoryboardDocument
} from "../src/storyboard.js";

const OWNER = "u1";
const OTHER = "u2";
const PROJECT = "catalog";

const document = (over: Partial<StoryboardDocument> = {}): string =>
  JSON.stringify({ ...emptyStoryboardDocument(), ...over });

async function seed(
  name: string,
  over: {
    userId?: string;
    projectId?: string;
    templateId?: string | null;
    recastKey?: string | null;
  } = {}
): Promise<Storyboard> {
  const board = new Storyboard({
    user_id: over.userId ?? OWNER,
    project_id: over.projectId ?? PROJECT,
    name,
    document: document({
      templateId: over.templateId,
      recastKey: over.recastKey
    })
  });
  await board.save();
  return board;
}

describe("Storyboard.findRecast", () => {
  beforeEach(() => initTestDb());

  it("finds a copy sitting past the end of the listing window", async () => {
    const copy = await seed("Copy", {
      templateId: "tpl",
      recastKey: "ent-hero>ent-rival"
    });
    for (let i = 0; i < 60; i += 1) {
      await seed(`SKU ${i}`);
    }

    // The window the scan used to see: 50 rows, and the copy is not in them.
    const listed = await Storyboard.listByProject(PROJECT, OWNER);
    expect(listed).toHaveLength(50);
    expect(listed.some((board) => board.id === copy.id)).toBe(false);

    const found = await Storyboard.findRecast({
      userId: OWNER,
      projectId: PROJECT,
      templateId: "tpl",
      recastKey: "ent-hero>ent-rival"
    });

    expect(found?.id).toBe(copy.id);
  });

  it("answers null for another mapping, another project and another owner", async () => {
    const copy = await seed("Copy", {
      templateId: "tpl",
      recastKey: "ent-hero>ent-rival"
    });
    const ask = (over: Record<string, string>) =>
      Storyboard.findRecast({
        userId: OWNER,
        projectId: PROJECT,
        templateId: "tpl",
        recastKey: "ent-hero>ent-rival",
        ...over
      });

    expect((await ask({}))?.id).toBe(copy.id);
    expect(await ask({ recastKey: "ent-hero>ent-other" })).toBeNull();
    expect(await ask({ templateId: "other-tpl" })).toBeNull();
    expect(await ask({ projectId: "another" })).toBeNull();
    expect(await ask({ userId: OTHER })).toBeNull();
  });

  it("ignores a board that was authored rather than derived", async () => {
    await seed("Authored");

    const found = await Storyboard.findRecast({
      userId: OWNER,
      projectId: PROJECT,
      templateId: "tpl",
      recastKey: "ent-hero>ent-rival"
    });

    expect(found).toBeNull();
  });
});
