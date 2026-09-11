/**
 * Listing boards without reading their documents.
 *
 * The `document` column holds the entire board — screenplay, every shot, every
 * take. A listing that selected it and counted `shots.length` in JavaScript
 * pulled megabytes out of the database to print one number per row.
 * `listSummaries` asks the database for the count instead, so these tests pin
 * both that the count is right and that the query never hands back a document.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getDb, initTestDb } from "../src/db.js";
import { storyboards } from "../src/schema/storyboards.js";
import {
  Storyboard,
  emptyStoryboardDocument,
  type StoryboardDocument
} from "../src/storyboard.js";

const OWNER = "u1";
const OTHER = "u2";

const shot = (index: number) => ({
  type: "shot",
  id: `shot_${index}`,
  index,
  action: "A lighthouse at dawn.",
  status: "planned"
});

const document = (over: Partial<StoryboardDocument> = {}): string =>
  JSON.stringify({ ...emptyStoryboardDocument(), ...over });

async function seed(
  name: string,
  over: {
    userId?: string;
    projectId?: string;
    document?: string;
  } = {}
): Promise<Storyboard> {
  const board = new Storyboard({
    user_id: over.userId ?? OWNER,
    project_id: over.projectId ?? "default",
    name,
    document: over.document ?? document()
  });
  await board.save();
  return board;
}

/** A row written straight to the table, past the model's write-time guards. */
async function insertRaw(name: string, document: string): Promise<void> {
  const now = new Date().toISOString();
  await getDb().insert(storyboards).values({
    id: `raw_${name}`,
    user_id: OWNER,
    project_id: "default",
    name,
    document,
    timeline_id: null,
    revision: 1,
    created_at: now,
    updated_at: now
  });
}

describe("Storyboard.listSummaries", () => {
  beforeEach(async () => {
    await initTestDb();
  });

  it("counts the shots in the stored document", async () => {
    await seed("three", {
      document: document({
        shots: [shot(0), shot(1), shot(2)] as StoryboardDocument["shots"]
      })
    });
    await seed("empty");

    const rows = await Storyboard.listSummaries({ userId: OWNER });

    expect(
      Object.fromEntries(rows.map((r) => [r.name, r.shotCount]))
    ).toEqual({ three: 3, empty: 0 });
  });

  it("carries identity, project and update time", async () => {
    const board = await seed("named", { projectId: "p1" });

    const [row] = await Storyboard.listSummaries({ userId: OWNER });

    expect(row).toEqual({
      id: board.id,
      projectId: "p1",
      name: "named",
      shotCount: 0,
      updatedAt: board.updated_at
    });
  });

  it("never selects the document column", async () => {
    await seed("heavy", {
      document: document({
        shots: Array.from({ length: 5 }, (_, i) =>
          shot(i)
        ) as StoryboardDocument["shots"],
        brief: "a brief nothing in a summary should carry"
      })
    });

    const [row] = await Storyboard.listSummaries({ userId: OWNER });

    expect(JSON.stringify(row)).not.toContain("a brief nothing");
    expect(Object.keys(row).sort()).toEqual([
      "id",
      "name",
      "projectId",
      "shotCount",
      "updatedAt"
    ]);
  });

  it("counts 0 for a document whose shots key is missing or not an array", async () => {
    // `save()` refuses such a document, so this is the shape only a row
    // written before that guard can have. It must not fail the whole listing.
    await insertRaw("missing", JSON.stringify({ brief: "" }));
    await insertRaw("scalar", JSON.stringify({ shots: 7 }));

    const rows = await Storyboard.listSummaries({ userId: OWNER });

    expect(rows.map((r) => r.shotCount)).toEqual([0, 0]);
  });

  it("answers only the caller's own boards", async () => {
    await seed("mine");
    await seed("theirs", { userId: OTHER });

    const rows = await Storyboard.listSummaries({ userId: OWNER });

    expect(rows.map((r) => r.name)).toEqual(["mine"]);
  });

  it("filters by project when one is given", async () => {
    await seed("in", { projectId: "p1" });
    await seed("out", { projectId: "p2" });

    const rows = await Storyboard.listSummaries({
      userId: OWNER,
      projectId: "p1"
    });

    expect(rows.map((r) => r.name)).toEqual(["in"]);
  });

  it("returns the most recently updated first, within the limit", async () => {
    const first = await seed("first");
    await seed("second");
    // A save moves `updated_at` forward, so touching the older row reorders it.
    first.name = "first touched";
    await first.save();

    const rows = await Storyboard.listSummaries({ userId: OWNER, limit: 1 });

    expect(rows.map((r) => r.name)).toEqual(["first touched"]);
  });
});
