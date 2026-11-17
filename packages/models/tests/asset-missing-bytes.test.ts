/**
 * A legacy asset row whose bytes are under no asset store key. The move into
 * the project folder marks it, so it stops counting as waiting, and a retry
 * of the migration clears the mark so the row is checked again.
 */
import { afterEach, describe, expect, it } from "vitest";
import { Asset } from "../src/asset.js";
import { ModelObserver } from "../src/base-model.js";
import { closeDb, initTestDb } from "../src/db.js";
import { Project } from "../src/project.js";
import { initPgliteTestDb } from "./helpers/pglite-test-db.js";

const OWNER = "owner";
const PROJECT = "project-a";
const OTHER_PROJECT = "project-b";
const DIALECT_TEST_TIMEOUT_MS = 60_000;

afterEach(async () => {
  ModelObserver.clear();
  await closeDb();
});

function legacyRow(name: string, fields: Record<string, unknown> = {}): Promise<Asset> {
  return Asset.create<Asset>({
    user_id: OWNER,
    project_id: PROJECT,
    name,
    content_type: "image/png",
    ...fields
  });
}

async function waitingNames(): Promise<string[]> {
  return (await Asset.listAwaitingFolderMove(OWNER, PROJECT)).map((row) => row.name);
}

describe.each(["sqlite", "postgres"] as const)("%s rows without stored bytes", (dialect) => {
  async function open(): Promise<void> {
    if (dialect === "postgres") await initPgliteTestDb();
    else initTestDb();
    await Project.create<Project>({ id: PROJECT, user_id: OWNER, name: "A" });
    await Project.create<Project>({ id: OTHER_PROJECT, user_id: "someone-else", name: "B" });
  }

  it("leave the waiting rows once marked, and come back when the row is saved or the marks are cleared", async () => {
    await open();
    const missing = await legacyRow("missing", { metadata: { note: "kept" } });
    const moving = await legacyRow("moving", {
      metadata: { workspace_move_target: "moving.png" }
    });
    const other = await legacyRow("other");
    // A value that only names the key does not hide a row.
    await legacyRow("named", { metadata: { note: "legacy_bytes_missing" } });
    const updatedAt = missing.updated_at;
    const seen: string[] = [];
    ModelObserver.subscribe((instance) => seen.push((instance as Asset).id));

    expect(await missing.markLegacyBytesMissing()).toBe(true);
    expect(await moving.markLegacyBytesMissing()).toBe(true);

    expect(seen).toEqual([]);
    const marked = await Asset.find(OWNER, missing.id);
    expect(marked?.updated_at).toBe(updatedAt);
    expect(marked?.metadata).toEqual({
      note: "kept",
      [Asset.LEGACY_BYTES_MISSING_KEY]: updatedAt
    });
    expect(await waitingNames()).toEqual(["other", "named"]);
    expect(
      (await Asset.listLegacyBytesMissing(OWNER, PROJECT)).map((row) => row.name)
    ).toEqual(["missing", "moving"]);
    expect(await Asset.countAwaitingFolderMove(OWNER)).toBe(2);
    expect(await Asset.listProjectsAwaitingFolderMove(OWNER)).toEqual([
      { userId: OWNER, projectId: PROJECT }
    ]);

    // A save of the row, such as a bytes update, makes it wait again.
    const saved = await Asset.find(OWNER, other.id);
    expect(await saved!.markLegacyBytesMissing()).toBe(true);
    expect(await waitingNames()).toEqual(["named"]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    saved!.name = "other renamed";
    await saved!.save();
    expect(await waitingNames()).toEqual(["other renamed", "named"]);
    expect(
      (await Asset.listLegacyBytesMissing(OWNER, PROJECT)).map((row) => row.name)
    ).toEqual(["missing", "moving"]);

    expect(await Asset.clearMissingBytesMarkers(OWNER)).toBe(3);
    expect(await Asset.clearMissingBytesMarkers(OWNER)).toBe(0);
    expect(await waitingNames()).toEqual(["missing", "moving", "other renamed", "named"]);
    expect((await Asset.find(OWNER, missing.id))?.metadata).toEqual({ note: "kept" });
    expect((await Asset.find(OWNER, missing.id))?.updated_at).toBe(updatedAt);
  }, DIALECT_TEST_TIMEOUT_MS);

  it("are not marked when the row changed since it was read", async () => {
    await open();
    const row = await legacyRow("missing");
    const stale = await Asset.find(OWNER, row.id);
    row.metadata = { note: "edited" };
    await row.save();

    expect(await stale!.markLegacyBytesMissing()).toBe(false);

    expect(stale!.metadata).toBeNull();
    expect((await Asset.find(OWNER, row.id))?.metadata).toEqual({ note: "edited" });
    expect(await waitingNames()).toEqual(["missing"]);
  }, DIALECT_TEST_TIMEOUT_MS);

  it("are cleared only for their own user", async () => {
    await open();
    const mine = await legacyRow("mine");
    const theirs = await Asset.create<Asset>({
      user_id: "someone-else",
      project_id: OTHER_PROJECT,
      name: "theirs",
      content_type: "image/png"
    });
    await mine.markLegacyBytesMissing();
    await theirs.markLegacyBytesMissing();

    expect(await Asset.clearMissingBytesMarkers(OWNER)).toBe(1);

    expect(await Asset.countAwaitingFolderMove(OWNER)).toBe(1);
    expect(await Asset.countAwaitingFolderMove("someone-else")).toBe(0);
  }, DIALECT_TEST_TIMEOUT_MS);
});
