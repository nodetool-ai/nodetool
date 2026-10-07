import { anyGameDocument, gameAuthoring } from "@nodetool-ai/protocol";
import { applyAnyGameOps, anyGameDocumentOp, createNative3DGame, createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { diffGameOwnership } from "../diffGameOwnership";

describe.each([{ name: "2D", create: createTopDownRoomGame }, { name: "3D", create: createNative3DGame }])("$name ownership diffs", ({ name, create }) => {
  function authored(id: string) {
    const baseline = create(`${id}-${name}`);
    return { ...baseline, authoring: gameAuthoring.parse({ version: 1,
      program: { source: "return inputs.document", inputs: {}, seed: 1 }, baseline }) };
  }
  it("rejects retained parameter-definition changes instead of dropping them", () => {
    const before = authored("ownership-parameter-definition");
    const after = structuredClone(before);
    after.authoring.parameters.speed = { type: "number", default: 2 };
    expect(() => diffGameOwnership(before, after)).toThrow(/definition/);
    expect(() => diffGameOwnership(before, before, after)).toThrow(/definition/);
  });
  it("checkpoints the last baseline-valued override through a combined JSON save batch", () => {
    const before = authored("ownership-checkpoint");
    const entity = before.scenes[0].entities.find((entry) => entry.id === "player");
    if (!entity) { throw new Error("Fixture player missing"); }
    const x = "transform3d" in entity ? entity.transform3d.position.x : entity.transform2d.x;
    const move = (value: number) => ({ op: "update_entity" as const, scene_id: before.entrySceneId, entity_id: "player",
      set: before.schemaVersion === 3 ? { transform3d: { position: { x: value } } } : { transform2d: { x: value } } });
    const first = applyAnyGameOps(before, [move(x + 2)]);
    const after = applyAnyGameOps(first, [move(x)]);
    const pending = [move(x + 2), ...diffGameOwnership(before, first, first), move(x), ...diffGameOwnership(first, after, after)];
    const wire = JSON.parse(JSON.stringify(pending)).map((op: unknown) => anyGameDocumentOp.parse(op));
    expect(applyAnyGameOps(before, wire)).toEqual(after);
    const inverse = diffGameOwnership(after, before);
    expect(inverse.some((op) => op.op === "set_override_membership" && op.override === null)).toBe(true);
    expect(applyAnyGameOps(after, inverse)).toEqual(before);
  });
  it("restores interleaved duplicate memberships without changing retained definitions", () => {
    const before = authored("ownership-duplicate-order");
    const a = { sceneId: before.entrySceneId, entityId: "ghost-a" };
    const b = { sceneId: before.entrySceneId, entityId: "ghost-b" };
    const after = structuredClone(before);
    after.authoring.detached = [a, b, a, b, a];
    const forward = JSON.parse(JSON.stringify(diffGameOwnership(before, after)))
      .map((op: unknown) => anyGameDocumentOp.parse(op));
    expect(applyAnyGameOps(before, forward)).toEqual(after);
    expect(applyAnyGameOps(after, diffGameOwnership(after, before))).toEqual(before);
  });
  it("captures a large interleaved occurrence list with bounded per-key operations", () => {
    const before = authored("ownership-large-positions");
    const after = structuredClone(before);
    after.authoring.detached = Array.from({ length: 50_000 }, (_, index) => ({ sceneId: before.entrySceneId,
      entityId: index % 2 === 0 ? "ghost-a" : "ghost-b" }));
    const ops = diffGameOwnership(before, after);
    expect(ops).toHaveLength(4);
    expect(applyAnyGameOps(before, ops)).toEqual(after);
  });
  it("removes one of many distinct flag targets within the public save operation bound", () => {
    const before = authored("ownership-distinct-flags");
    before.authoring.detached = Array.from({ length: 514 }, (_, index) => ({ sceneId: before.entrySceneId,
      entityId: `ghost-${index}` }));
    const after = structuredClone(before);
    after.authoring.detached.shift();
    const forward = diffGameOwnership(before, after);
    expect(forward.length).toBeLessThanOrEqual(2);
    expect(applyAnyGameOps(before, JSON.parse(JSON.stringify(forward)))).toEqual(after);
    const inverse = diffGameOwnership(after, before);
    expect(inverse.length).toBeLessThanOrEqual(2);
    expect(applyAnyGameOps(after, JSON.parse(JSON.stringify(inverse)))).toEqual(before);
  });
  it("removes one early override without re-emitting the unchanged suffix", () => {
    const initial = create(`ownership-distinct-overrides-${name}`);
    const player = initial.scenes[0].entities.find((entity) => entity.id === "player");
    if (!player) { throw new Error("Fixture player missing"); }
    const copies = Array.from({ length: 1025 }, (_, index) => ({ ...structuredClone(player), id: `owned-${index}` }));
    const baseline = anyGameDocument.parse({ ...initial, scenes: [{ ...initial.scenes[0],
      entities: [...initial.scenes[0].entities, ...copies] }, ...initial.scenes.slice(1)] });
    const path = baseline.schemaVersion === 3 ? ["transform3d", "position", "x"] : ["transform2d", "x"];
    const x = "transform3d" in player ? player.transform3d.position.x : player.transform2d.x;
    const before = anyGameDocument.parse({ ...baseline,
      scenes: baseline.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity) => {
        if (!entity.id.startsWith("owned-")) { return entity; }
        return "transform3d" in entity
          ? { ...entity, transform3d: { ...entity.transform3d, position: { ...entity.transform3d.position, x: x + 1 } } }
          : { ...entity, transform2d: { ...entity.transform2d, x: x + 1 } };
      }) })),
      authoring: gameAuthoring.parse({ version: 1, program: { source: "return inputs.document", inputs: {}, seed: 1 }, baseline,
        overrides: copies.map((entity) => ({ sceneId: baseline.entrySceneId, entityId: entity.id, path, value: x + 1 })) }) });
    const field = { op: "update_entity" as const, scene_id: before.entrySceneId, entity_id: "owned-0",
      set: before.schemaVersion === 3 ? { transform3d: { position: { x } } } : { transform2d: { x } } };
    const applied = applyAnyGameOps(before, [field]);
    const after = structuredClone(applied);
    if (!after.authoring) { throw new Error("Fixture authoring missing"); }
    after.authoring.overrides.shift();
    const forward = diffGameOwnership(before, after, applied);
    expect(forward).toHaveLength(1);
    expect(applyAnyGameOps(before, [field, ...forward])).toEqual(after);
    const restoreField = { ...field, set: before.schemaVersion === 3
      ? { transform3d: { position: { x: x + 1 } } } : { transform2d: { x: x + 1 } } };
    const inverseApplied = applyAnyGameOps(after, [restoreField]);
    const inverse = diffGameOwnership(after, before, inverseApplied);
    expect(inverse.length).toBeLessThanOrEqual(2);
    expect(applyAnyGameOps(after, [restoreField, ...inverse])).toEqual(before);
  });
  it("reorders existing duplicate flags and override keys through JSON forward and inverse operations", () => {
    const document = authored("ownership-reorder");
    const field = { op: "update_entity" as const, scene_id: document.entrySceneId, entity_id: "player",
      set: document.schemaVersion === 3 ? { transform3d: { position: { x: 2, z: 3 } } } : { transform2d: { x: 2, y: 3 } } };
    const before = applyAnyGameOps(document, [field]);
    if (!before.authoring) { throw new Error("Fixture authoring missing"); }
    const a = { sceneId: before.entrySceneId, entityId: "ghost-a" };
    const b = { sceneId: before.entrySceneId, entityId: "ghost-b" };
    before.authoring.detached = [a, b, a];
    const after = structuredClone(before);
    if (!after.authoring) { throw new Error("Fixture authoring missing"); }
    after.authoring.overrides.reverse();
    after.authoring.detached = [a, a, b];
    const forward = JSON.parse(JSON.stringify(diffGameOwnership(before, after))).map((op: unknown) => anyGameDocumentOp.parse(op));
    expect(forward.length).toBeGreaterThan(0);
    expect(applyAnyGameOps(before, forward)).toEqual(after);
    const inverse = JSON.parse(JSON.stringify(diffGameOwnership(after, before))).map((op: unknown) => anyGameDocumentOp.parse(op));
    expect(applyAnyGameOps(after, inverse)).toEqual(before);
  });
  it("uses raw source order when a field edit already reconciles ownership into baseline order", () => {
    const document = authored("ownership-source-vs-applied-order");
    const changes = document.scenes[0].entities.slice(0, 4).map((entity) => ({
      op: "update_entity" as const, scene_id: document.entrySceneId, entity_id: entity.id,
      set: "transform3d" in entity
        ? { transform3d: { position: { x: entity.transform3d.position.x + 1 } } }
        : { transform2d: { x: entity.transform2d.x + 1 } }
    }));
    const before = applyAnyGameOps(document, changes);
    if (!before.authoring) { throw new Error("Fixture authoring missing"); }
    expect(before.authoring.overrides).toHaveLength(4);
    before.authoring.overrides.reverse();
    const rename = { op: "update_scene" as const, scene_id: before.entrySceneId, set: { name: "Renamed" } };
    const after = applyAnyGameOps(before, [rename]);
    expect(after.authoring?.overrides.map((entry) => entry.entityId)).toEqual(
      before.authoring.overrides.map((entry) => entry.entityId).reverse());
    const checkpoint = diffGameOwnership(before, after, after);
    const wire = JSON.parse(JSON.stringify([rename, ...checkpoint])).map((op: unknown) => anyGameDocumentOp.parse(op));
    expect(applyAnyGameOps(before, wire)).toEqual(after);
    const renameBack = { ...rename, set: { name: before.scenes[0].name } };
    const inverseApplied = applyAnyGameOps(after, [renameBack]);
    expect(applyAnyGameOps(after, [renameBack, ...diffGameOwnership(after, before, inverseApplied)])).toEqual(before);
  });
});

it("keeps 350 existing override updates and their inverse within the public operation budget", () => {
  const baseline = anyGameDocument.parse({ schemaVersion: 2, engineVersion: "1", id: "stable-override-budget",
    revision: "1", entrySceneId: "room", pixelsPerUnit: 32, tickRate: 60, inputActions: [], assets: {},
    scenes: [{ id: "room", name: "Many roots", entities: Array.from({ length: 350 }, (_, index) => ({ id: `root-${index}`,
      transform2d: { x: index, y: 0 } })) }] });
  if (baseline.schemaVersion === 3) { throw new Error("Expected 2D baseline"); }
  const authored = { ...baseline, authoring: gameAuthoring.parse({ version: 1,
    program: { source: "return inputs.document;", inputs: { document: baseline }, seed: 1 }, baseline,
    detached: [{ sceneId: "room", entityId: "ghost" }, { sceneId: "room", entityId: "ghost" }] }) };
  const seed = baseline.scenes[0].entities.map((entity) => anyGameDocumentOp.parse({ op: "update_entity",
    scene_id: "room", entity_id: entity.id, set: { transform2d: { x: entity.transform2d.x + 1 } } }));
  const before = applyAnyGameOps(authored, seed);
  expect(before.schemaVersion).toBe(2);
  expect(before.authoring?.overrides).toHaveLength(350);
  const moves = before.scenes[0].entities.map((entity) => anyGameDocumentOp.parse({ op: "update_entity",
    scene_id: "room", entity_id: entity.id, set: { transform2d: { x: entity.transform2d.x + 1 } } }));
  const after = applyAnyGameOps(before, moves);
  const wire = (ops: unknown[]) => ops.map((op) => anyGameDocumentOp.parse(JSON.parse(JSON.stringify(op))));
  const forward = wire([...moves, ...diffGameOwnership(before, after, after)]);
  expect(applyAnyGameOps(before, forward)).toEqual(after);
  expect(after.authoring?.detached).toEqual(before.authoring?.detached);
  const restoredFields = applyAnyGameOps(after, seed);
  const inverse = wire([...seed, ...diffGameOwnership(after, before, restoredFields)]);
  expect(applyAnyGameOps(after, inverse)).toEqual(before);
  expect(forward.length).toBeLessThanOrEqual(1024);
  expect(inverse.length).toBeLessThanOrEqual(1024);
});
