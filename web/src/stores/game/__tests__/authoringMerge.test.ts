import { gameAuthoring, type AnyGameDocument } from "@nodetool-ai/protocol";
import { applyAnyGameOps, createNative3DGame, createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { diffAnyGameDocuments } from "../diffAnyGameDocuments";
import { rebaseGameAuthoringEdits } from "../authoringMerge";
import { anyGameMergeAdapter } from "../anyMerge";
import { mergeByUnits } from "../../documentMerge";

function retained(dimension: "2d" | "3d"): AnyGameDocument {
  const baseline = dimension === "2d" ? createTopDownRoomGame("authoring-store") : createNative3DGame("authoring-store");
  return { ...baseline, authoring: gameAuthoring.parse({ version: 1,
    program: { source: "return inputs.document", inputs: {}, seed: 1 }, baseline }) };
}

it.each(["2d", "3d"] as const)("persists metadata-only detach through the %s document diff", (dimension) => {
  const before = retained(dimension);
  const scene = before.scenes[0];
  const entityId = scene.entities[0].id;
  const detached = applyAnyGameOps(before, [{ op: "detach_entity", scene_id: scene.id, entity_id: entityId }]);
  expect(detached.scenes).toEqual(before.scenes);
  const ops = diffAnyGameDocuments(before, detached);
  expect(ops.length).toBeGreaterThan(0);
  expect(applyAnyGameOps(before, ops)).toEqual(detached);
});

it.each(["2d", "3d"] as const)("persists metadata-only override reset through the %s document diff", (dimension) => {
  const before = retained(dimension);
  if (!before.authoring) { throw new Error("Fixture has no authoring"); }
  const scene = before.scenes[0];
  const entity = scene.entities[0];
  const path = "transform3d" in entity ? ["transform3d", "position", "x"] : ["transform2d", "x"];
  const value = "transform3d" in entity ? entity.transform3d.position.x : entity.transform2d.x;
  before.authoring.overrides = [{ sceneId: scene.id, entityId: entity.id, path, value }];
  const reset = applyAnyGameOps(before, [{ op: "reset_override", scene_id: scene.id, entity_id: entity.id, path }]);
  expect(reset.scenes).toEqual(before.scenes);
  expect(reset.authoring?.overrides).toHaveLength(0);
  const ops = diffAnyGameDocuments(before, reset);
  expect(ops.length).toBeGreaterThan(0);
  expect(applyAnyGameOps(before, ops)).toEqual(reset);
});

it.each(["2d", "3d"] as const)("merges new accepted %s construction without replacing it with old local ownership metadata", (dimension) => {
  const before = retained(dimension);
  if (!before.authoring) { throw new Error("Fixture has no authoring"); }
  const scene = before.scenes[0];
  const entityId = scene.entities[0].id;
  const local = applyAnyGameOps(before, [{ op: "detach_entity", scene_id: scene.id, entity_id: entityId }]);
  const server = { ...before, authoring: { ...before.authoring, program: { ...before.authoring.program, source: "return builder.game()" } } };
  const merged = mergeByUnits(before, local, server, anyGameMergeAdapter(before), { mergeWithoutOps: true });
  expect(merged.doc.authoring?.program).toEqual(server.authoring.program);
  expect(merged.doc.authoring?.detached).toEqual(local.authoring?.detached);
  expect(merged.conflicts).toHaveLength(0);
});

it("rebases local reset and deletion onto the new generated values", () => {
  const before = retained("2d");
  if (before.schemaVersion === 3 || !before.authoring) { throw new Error("Fixture must be retained 2D"); }
  const scene = before.scenes[0];
  const entity = scene.entities[0];
  const other = scene.entities[1];
  const moved = applyAnyGameOps(before, [{ op: "update_entity", scene_id: scene.id, entity_id: entity.id, set: { transform2d: { x: entity.transform2d.x + 1 } } }]);
  const local = applyAnyGameOps(moved, [{ op: "reset_override", scene_id: scene.id, entity_id: entity.id },
    { op: "remove_entity", scene_id: scene.id, entity_id: other.id }]);
  const { authoring: _authoring, ...native } = before;
  const baseline = { ...native, scenes: before.scenes.map((item) => ({ ...item,
    entities: item.entities.map((value) => value.id === entity.id ? { ...value, transform2d: { ...value.transform2d, x: value.transform2d.x + 3 } } : value) })) };
  const generated = { ...baseline, authoring: gameAuthoring.parse({ ...before.authoring, baseline, program: { ...before.authoring.program, source: "return inputs.next" } }) };
  const rebased = rebaseGameAuthoringEdits(local, generated);
  expect(rebased.conflicts).toHaveLength(0);
  if (rebased.document.schemaVersion === 3) { throw new Error("Rebase changed dimensions"); }
  expect(rebased.document.scenes[0].entities.find((value) => value.id === entity.id)?.transform2d.x).toBe(entity.transform2d.x + 3);
  expect(rebased.document.scenes[0].entities.some((value) => value.id === other.id)).toBe(false);
  expect(rebased.document.authoring?.suppressions).toContainEqual({ sceneId: scene.id, entityId: other.id });
  expect(rebased.document.authoring?.program).toEqual(generated.authoring.program);
});
