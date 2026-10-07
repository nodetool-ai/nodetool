import { describe, expect, it } from "@jest/globals";
import { gameDocument } from "@nodetool-ai/protocol";
import { applyAnyGameOps, applyGameOps, createTopDownRoomGame } from "@nodetool-ai/game-runtime";

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
  it("round-trips optional 2D collision layers through public JSON operations", () => {
    const before = gameDocument.parse({ ...createTopDownRoomGame("diff-layers"), schemaVersion: 2,
      collisionLayers: ["default", "unused"] });
    const after = structuredClone(before);
    delete after.collisionLayers;
    const forward = diffGameDocuments(before, after);
    expect(applyAnyGameOps(before, JSON.parse(JSON.stringify(forward)))).toEqual(after);
    const inverse = diffGameDocuments(after, before);
    expect(applyAnyGameOps(after, JSON.parse(JSON.stringify(inverse)))).toEqual(before);
  });

});

it("restores explicitly empty backgrounds after absent-container deletion through JSON", () => {
  const before = gameDocument.parse({ ...createTopDownRoomGame("empty-background-diff"), schemaVersion: 2 });
  delete before.scenes[0].backgrounds;
  const after = structuredClone(before);
  after.scenes[0].backgrounds = [];
  expect(applyAnyGameOps(before, JSON.parse(JSON.stringify(diffGameDocuments(before, after))))).toEqual(after);
  expect(applyAnyGameOps(after, JSON.parse(JSON.stringify(diffGameDocuments(after, before))))).toEqual(before);
});

it("replaces missing background options and reorders layers in the same JSON batch", () => {
  const before = gameDocument.parse({ ...createTopDownRoomGame("reordered-background-diff"), schemaVersion: 2 });
  const player = before.scenes[0].entities.find((entity) => entity.id === "player");
  if (!player?.sprite) { throw new Error("Fixture sprite missing"); }
  const parsed = gameDocument.parse({ ...before, scenes: [{ ...before.scenes[0], backgrounds: [
    { id: "a", assetId: player.sprite.assetId, width: 16, height: 9, sampling: "linear" },
    { id: "b", assetId: player.sprite.assetId, width: 16, height: 9 },
    { id: "c", assetId: player.sprite.assetId, width: 16, height: 9 },
  ] }] });
  const after = structuredClone(parsed);
  const backgrounds = after.scenes[0].backgrounds;
  if (!backgrounds) { throw new Error("Fixture backgrounds missing"); }
  delete backgrounds[0].sampling;
  after.scenes[0].backgrounds = [backgrounds[2], backgrounds[0], backgrounds[1]];
  expect(applyAnyGameOps(parsed, JSON.parse(JSON.stringify(diffGameDocuments(parsed, after))))).toEqual(after);
  expect(applyAnyGameOps(after, JSON.parse(JSON.stringify(diffGameDocuments(after, parsed))))).toEqual(parsed);
});
