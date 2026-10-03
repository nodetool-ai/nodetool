import { describe, expect, it } from "@jest/globals";
import { applyGameOps, createTopDownRoomGame } from "@nodetool-ai/game-runtime";

import { diffGameDocuments } from "../diffGameDocuments";

describe("diffGameDocuments", () => {
  it("removes a parent and its child with ops the runtime accepts", () => {
    const before = applyGameOps(createTopDownRoomGame("diff-hierarchy"), [
      { op: "add_entity", scene_id: "room", entity: { id: "parent", transform2d: { x: 1, y: 0 } } },
      { op: "add_entity", scene_id: "room", entity: { id: "child", parentId: "parent", transform2d: { x: 1, y: 0 } } }
    ]);
    const after = createTopDownRoomGame("diff-hierarchy");

    const ops = diffGameDocuments(before, after);

    expect(applyGameOps(before, ops)).toEqual(after);
  });
});
