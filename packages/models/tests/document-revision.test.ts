/**
 * Every resource-backed document carries a `revision` that moves forward on
 * each write. Mini-app resource bindings hand widgets a `ResourceRef` carrying
 * it, and the provider rejects a write whose ref is behind.
 */
import { describe, it, expect, beforeEach } from "vitest";

import { initTestDb } from "../src/db.js";
import { Storyboard } from "../src/storyboard.js";

describe("document revision", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("starts at 1 after the first save and advances on every write", async () => {
    const board = await Storyboard.create<Storyboard>({
      user_id: "u1",
      project_id: "p1",
      name: "Board"
    });
    expect(board.revision).toBe(1);

    const updated = await Storyboard.updateFieldsIfUnchanged(
      board.id,
      board.updated_at,
      { name: "Renamed" }
    );
    expect(updated?.revision).toBe(2);

    const again = await Storyboard.updateFieldsIfUnchanged(
      board.id,
      updated!.updated_at,
      { name: "Renamed twice" }
    );
    expect(again?.revision).toBe(3);
  });

  it("does not advance on a rejected stale write", async () => {
    const board = await Storyboard.create<Storyboard>({
      user_id: "u1",
      project_id: "p1",
      name: "Board"
    });
    const staleUpdatedAt = board.updated_at;
    await Storyboard.updateFieldsIfUnchanged(board.id, staleUpdatedAt, {
      name: "First"
    });

    const clobber = await Storyboard.updateFieldsIfUnchanged(
      board.id,
      staleUpdatedAt,
      { name: "Second" }
    );
    expect(clobber).toBeNull();

    const current = await Storyboard.findById(board.id);
    expect(current?.name).toBe("First");
    expect(current?.revision).toBe(2);
  });
});
