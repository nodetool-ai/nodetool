/**
 * A storyboard revision conflict has to say what the board's revision is and
 * that nothing was written. "Storyboard revision conflict. Refresh the board
 * before editing." said neither, and a model that sent `expected_revision: 2`
 * after reading revision 1 read it as partial success and repeated the call.
 *
 * Each case asserts the stored board too, not only the message.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { ModelObserver, Storyboard, initTestDb } from "@nodetool-ai/models";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { finishStoryboard } from "../src/capabilities/finish-storyboard.js";

const context = { userId: "u1" } as unknown as ProcessingContext;
const run = () => createCapabilityRun({ context, gate: UNGATED });

type Result = Record<string, unknown> & { error?: string };

const call = async (
  name: string,
  params: Record<string, unknown>
): Promise<Result> => (await run().invoke(name, params)) as Result;

async function makeBoard() {
  return Storyboard.create<Storyboard>({
    user_id: "u1",
    project_id: "default",
    name: "Board",
    document: JSON.stringify({
      screenplay: null,
      brief: "Original brief",
      style: "",
      entityIds: [],
      aspectRatio: "9:16",
      setupStage: "done",
      genre: "",
      directorModel: null,
      imageModel: null,
      videoModel: null,
      shots: []
    })
  });
}

const conflict = (sent: number, current: number) =>
  `Revision conflict: you sent expected_revision ${sent} but the board is at ` +
  `revision ${current}. Nothing was applied. Re-read the board or resend with ` +
  `expected_revision ${current}.`;

beforeEach(() => initTestDb());
afterEach(() => ModelObserver.clear());

describe("storyboard revision conflicts", () => {
  it("edit_storyboard ops: names both revisions and that nothing was applied", async () => {
    const board = await makeBoard();
    const result = await call("edit_storyboard", {
      storyboard_id: board.id,
      expected_revision: board.revision + 1,
      ops: [{ op: "set_setup", brief: "Stale brief" }]
    });
    expect(result.error).toBe(conflict(board.revision + 1, board.revision));
    expect(result["revision"]).toBe(board.revision);
    const stored = await Storyboard.findById(board.id);
    expect(stored?.revision).toBe(board.revision);
    expect(stored?.toDocument().brief).toBe("Original brief");
  });

  it("edit_storyboard rename alone: names both revisions", async () => {
    const board = await makeBoard();
    const result = await call("edit_storyboard", {
      storyboard_id: board.id,
      expected_revision: board.revision + 1,
      name: "Renamed"
    });
    expect(result.error).toBe(conflict(board.revision + 1, board.revision));
    expect((await Storyboard.findById(board.id))?.name).toBe("Board");
  });

  /**
   * The ops bump the revision before the rename runs, so the rename used to
   * check the caller's revision against the one the ops just wrote and report
   * a conflict for its own edit.
   */
  it("edit_storyboard ops and a rename at the current revision apply both", async () => {
    const board = await makeBoard();
    const result = await call("edit_storyboard", {
      storyboard_id: board.id,
      expected_revision: board.revision,
      ops: [{ op: "set_setup", brief: "New brief" }],
      name: "Renamed"
    });
    expect(result.error).toBeUndefined();
    expect(result["rename_error"]).toBeUndefined();
    const stored = await Storyboard.findById(board.id);
    expect(stored?.name).toBe("Renamed");
    expect(stored?.toDocument().brief).toBe("New brief");
  });

  it("update_storyboard_one_take: names both revisions", async () => {
    const board = await makeBoard();
    const result = await call("update_storyboard_one_take", {
      storyboard_id: board.id,
      expected_revision: board.revision + 1,
      prompt: "x"
    });
    expect(result.error).toBe(conflict(board.revision + 1, board.revision));
    expect(result["revision"]).toBe(board.revision);
  });

  it("finish_storyboard: names both revisions", async () => {
    const board = await makeBoard();
    const result = (await finishStoryboard.impl(run(), {
      storyboardId: board.id,
      expectedStoryboardRevision: board.revision + 1
    })) as Result;
    expect(result.error).toBe(
      `Revision conflict: you sent expectedStoryboardRevision ${board.revision + 1} ` +
        `but the board is at revision ${board.revision}. Nothing was applied. ` +
        `Re-read the board or resend with expectedStoryboardRevision ${board.revision}.`
    );
    expect(result["revision"]).toBe(board.revision);
  });
});
