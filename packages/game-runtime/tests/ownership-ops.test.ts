import { describe, expect, it } from "vitest";
import { anyGameDocument, type AnyGameDocument } from "@nodetool-ai/protocol";
import { anyGameDocumentOp, applyAnyGameOps, createNative3DGame, createTopDownRoomGame, gameDocumentOp, gameDocumentOp3D, GameOpError } from "../src/index.js";

function apply(document: AnyGameDocument, ops: readonly unknown[]): AnyGameDocument {
  const schema = document.schemaVersion === 3 ? gameDocumentOp3D : gameDocumentOp;
  return applyAnyGameOps(document, JSON.parse(JSON.stringify(ops)).map((op: unknown) => schema.parse(op)));
}
function retained(create: typeof createNative3DGame | typeof createTopDownRoomGame): AnyGameDocument {
  const baseline = create(`ownership-${create.name}`);
  return anyGameDocument.parse({ ...baseline, authoring: { version: 1,
    program: { source: "return inputs.document", inputs: {}, seed: 1 }, baseline } });
}
function move(document: AnyGameDocument, x: number): unknown {
  return { op: "update_entity", scene_id: document.entrySceneId, entity_id: "player",
    set: document.schemaVersion === 3 ? { transform3d: { position: { x } } } : { transform2d: { x } } };
}
function override(document: AnyGameDocument, value: number | null, index?: number): unknown {
  const op: Record<string, unknown> = { op: "set_override_membership", scene_id: document.entrySceneId, entity_id: "player",
    path: document.schemaVersion === 3 ? ["transform3d", "position", "x"] : ["transform2d", "x"],
    override: value === null ? null : { value } };
  if (index !== undefined) { op.index = index; }
  return op;
}

describe.each([{ name: "2D", create: createTopDownRoomGame }, { name: "3D", create: createNative3DGame }])(
  "manual ownership deltas $name", ({ create }) => {
  it("preserves legacy controls for sticky ownership and duplicate flag normalization", () => {
    const before = retained(create);
    const x = before.schemaVersion === 3
      ? before.scenes[0].entities.find((entity) => entity.id === "player")?.transform3d.position.x
      : before.scenes[0].entities.find((entity) => entity.id === "player")?.transform2d.x;
    if (x === undefined || !before.authoring) { throw new Error("Fixture player or authoring missing"); }
    expect(apply(before, [move(before, x + 2), move(before, x)])).toEqual(before);
    const sequential = apply(apply(before, [move(before, x + 2)]), [move(before, x)]);
    expect(sequential.scenes).toEqual(before.scenes);
    expect(sequential.authoring?.overrides).toHaveLength(1);
    expect(sequential.authoring?.overrides[0].value).toBe(x);
    const target = { sceneId: before.entrySceneId, entityId: "legacy-ghost" };
    before.authoring.suppressions = [target, structuredClone(target)];
    before.authoring.detached = [target, structuredClone(target)];
    const normalized = apply(before, []);
    expect(normalized.authoring?.suppressions).toEqual([target]);
    expect(normalized.authoring?.detached).toEqual([target, target]);
  });

  it("round-trips net-zero manual ownership through JSON forward, inverse and redo batches", () => {
    const before = retained(create);
    const baselineX = before.schemaVersion === 3
      ? before.scenes[0].entities.find((entity) => entity.id === "player")?.transform3d.position.x
      : before.scenes[0].entities.find((entity) => entity.id === "player")?.transform2d.x;
    if (baselineX === undefined) { throw new Error("Fixture player missing"); }
    const expected = apply(apply(before, [move(before, baselineX + 2)]), [move(before, baselineX)]);
    const forward = [move(before, baselineX + 2), move(before, baselineX), override(before, baselineX, 0)];
    const after = apply(before, forward);
    expect(after).toEqual(expected);
    expect(apply(after, [override(before, null)])).toEqual(before);
    expect(apply(apply(after, [override(before, null)]), forward)).toEqual(expected);
  });

  it("rejects inconsistent ownership atomically and preserves legacy ordinary batch semantics", () => {
    const before = retained(create);
    const original = structuredClone(before);
    expect(() => apply(before, [move(before, 42), override(before, null)])).toThrow();
    expect(before).toEqual(original);
    expect(() => apply(before, [override(before, 99)])).toThrow();
    expect(before).toEqual(original);
    const x = before.schemaVersion === 3
      ? before.scenes[0].entities.find((entity) => entity.id === "player")?.transform3d.position.x
      : before.scenes[0].entities.find((entity) => entity.id === "player")?.transform2d.x;
    if (x === undefined) { throw new Error("Fixture player missing"); }
    expect(apply(before, [move(before, x + 2), move(before, x)])).toEqual(before);
    expect(apply(apply(before, [move(before, x + 2)]), [move(before, x)]).authoring?.overrides).toHaveLength(1);
  });

  it("restores orphan detached metadata without changing retained definitions", () => {
    const before = retained(create);
    const target = { scene_id: before.entrySceneId, entity_id: "manual" };
    const added = apply(before, [{ op: "add_entity", scene_id: target.scene_id, entity: { id: target.entity_id } }]);
    const detached = apply(added, [{ op: "detach_entity", ...target }]);
    const ghost = apply(detached, [{ op: "remove_entity", ...target }]);
    expect(ghost.authoring?.detached).toEqual([{ sceneId: target.scene_id, entityId: target.entity_id }]);
    const clean = apply(ghost, [{ op: "set_authoring_membership", ...target, membership: "detachment", present: false }]);
    expect(clean.authoring?.detached).toEqual([]);
    expect(apply(clean, [{ op: "set_authoring_membership", ...target, membership: "detachment", present: true, positions: [0] }])).toEqual(ghost);
    expect(clean.authoring?.program).toEqual(before.authoring?.program);
    expect(clean.authoring?.baseline).toEqual(before.authoring?.baseline);
  });

  it("preserves final composed positions for two inserts at index zero", () => {
    const before = retained(create);
    const first = { op: "set_authoring_membership", scene_id: before.entrySceneId, entity_id: "manual-a",
      membership: "detachment", present: true, positions: [0] };
    const second = { ...first, entity_id: "manual-b" };
    const after = apply(before, [first, second]);
    expect(after.authoring?.detached.map((entry) => entry.entityId)).toEqual(["manual-b", "manual-a"]);
    expect(apply(after, [{ ...second, present: false, positions: undefined },
      { ...first, present: false, positions: undefined }])).toEqual(before);
  });

  it("restores an early override position through final tracking while preserving unrelated keys", () => {
    const initial = retained(create);
    const first = initial.scenes[0].entities[0];
    const second = initial.scenes[0].entities[1];
    if (!first || !second) { throw new Error("Fixture requires two entities"); }
    const before = apply(initial, [
      { op: "update_entity", scene_id: initial.entrySceneId, entity_id: first.id, set: { name: "First manual" } },
      { op: "update_entity", scene_id: initial.entrySceneId, entity_id: second.id, set: { name: "Second manual" } },
      { op: "set_authoring_membership", scene_id: initial.entrySceneId, entity_id: "unrelated",
        membership: "detachment", present: true },
      { op: "set_authoring_membership", scene_id: initial.entrySceneId, entity_id: "unrelated",
        membership: "suppression", present: true }
    ]);
    expect(before.authoring?.overrides.map((entry) => entry.entityId)).toEqual([first.id, second.id]);
    const member = { op: "set_override_membership", scene_id: initial.entrySceneId, entity_id: first.id, path: ["name"] };
    const after = apply(before, [
      { op: "update_entity", scene_id: initial.entrySceneId, entity_id: first.id, set: { name: first.name } },
      { ...member, override: null }
    ]);
    expect(after.authoring?.overrides.map((entry) => entry.entityId)).toEqual([second.id]);
    const restored = apply(after, [
      { op: "update_entity", scene_id: initial.entrySceneId, entity_id: first.id, set: { name: "First manual" } },
      { ...member, override: { value: "First manual" }, index: 0 }
    ]);
    expect(restored).toEqual(before);
    expect(after.authoring?.detached).toEqual(before.authoring?.detached);
    expect(after.authoring?.suppressions).toEqual(before.authoring?.suppressions);
  });

  it("restores suppression membership for a re-added entity without requiring its absence", () => {
    const before = retained(create);
    const target = { scene_id: before.entrySceneId, entity_id: "suppressed" };
    const authoredEntity = { ...before.scenes[0].entities[0], id: target.entity_id };
    const baseline = anyGameDocument.parse({ ...before, scenes: before.scenes.map((scene, index) => index === 0
      ? { ...scene, entities: [...scene.entities, authoredEntity] } : scene) });
    const { authoring: _authoring, ...baselineDocument } = baseline;
    const initial = anyGameDocument.parse({ ...baseline, authoring: { ...before.authoring, baseline: baselineDocument } });
    const removed = apply(initial, [{ op: "remove_entity", ...target }]);
    const readded = apply(removed, [{ op: "add_entity", scene_id: target.scene_id, entity: authoredEntity }]);
    expect(readded.authoring?.suppressions).toEqual([{ sceneId: target.scene_id, entityId: target.entity_id }]);
    const clean = apply(readded, [{ op: "set_authoring_membership", ...target, membership: "suppression", present: false }]);
    expect(clean.authoring?.suppressions).toEqual([]);
    expect(apply(clean, [{ op: "set_authoring_membership", ...target, membership: "suppression", present: true, positions: [0] }])).toEqual(readded);
  });

  it("rejects a schema-valid insertion beyond the current length atomically", () => {
    const before = retained(create);
    const x = before.schemaVersion === 3
      ? before.scenes[0].entities.find((entity) => entity.id === "player")?.transform3d.position.x
      : before.scenes[0].entities.find((entity) => entity.id === "player")?.transform2d.x;
    if (x === undefined) { throw new Error("Fixture player missing"); }
    const original = structuredClone(before);
    expect(() => apply(before, [move(before, x + 2), override(before, x + 2, 1)])).toThrow(/index/i);
    expect(before).toEqual(original);
  });

  it("rejects invalid paths, positions and definition payloads", () => {
    const before = retained(create);
    for (const invalid of [
      { ...override(before, 0) as object, path: ["__proto__"] },
      { ...override(before, 0) as object, index: 50_001 },
      { ...override(before, null) as object, index: 0 },
      { ...override(before, 0) as object, program: { source: "changed" } }
    ]) {
      expect(() => apply(before, [move(before, 2), invalid])).toThrow();
    }
    expect(before).toEqual(retained(create));
  });

  it.each(["suppression", "detachment"] as const)("removes and restores every duplicate %s occurrence at captured positions", (membership) => {
    const document = retained(create);
    if (!document.authoring) { throw new Error("Fixture authoring missing"); }
    const field = membership === "suppression" ? "suppressions" : "detached";
    const target = { sceneId: document.entrySceneId, entityId: "ghost" };
    const unrelated = { sceneId: document.entrySceneId, entityId: "unrelated" };
    document.authoring[field] = [target, unrelated, structuredClone(target)];
    const original = structuredClone(document);
    const op = { op: "set_authoring_membership", scene_id: target.sceneId, entity_id: target.entityId, membership };
    const removed = apply(document, [{ ...op, present: false }]);
    expect(removed.authoring?.[field]).toEqual([unrelated]);
    expect(apply(removed, [{ ...op, present: true, positions: [0, 2] }])).toEqual(original);
    expect(document).toEqual(original);
  });

  it("preserves unrelated duplicate flag entries when a different override changes", () => {
    const document = retained(create);
    if (!document.authoring) { throw new Error("Fixture authoring missing"); }
    const unrelated = { sceneId: document.entrySceneId, entityId: "unrelated" };
    document.authoring.detached = [unrelated, structuredClone(unrelated)];
    document.authoring.suppressions = [unrelated, structuredClone(unrelated)];
    const changed = apply(document, [move(document, 42), override(document, 42)]);
    expect(changed.authoring?.detached).toEqual(document.authoring.detached);
    expect(changed.authoring?.suppressions).toEqual(document.authoring.suppressions);
    const legacy = apply(document, [move(document, 42)]);
    expect(legacy.authoring?.suppressions).toEqual([unrelated]);
    expect(legacy.authoring?.detached).toEqual([unrelated, unrelated]);
  });

  it("does not let a later legacy reset erase the last explicit ownership request", () => {
    const before = retained(create);
    const path = before.schemaVersion === 3 ? ["transform3d", "position", "x"] : ["transform2d", "x"];
    expect(() => apply(before, [move(before, 42), override(before, 42),
      { op: "reset_override", scene_id: before.entrySceneId, entity_id: "player", path }])).toThrow(/ownership/i);
    expect(before).toEqual(retained(create));
  });

  it("reconstructs the bounded flag array with many interleaved occurrences", () => {
    const document = retained(create);
    if (!document.authoring) { throw new Error("Fixture authoring missing"); }
    const target = { sceneId: document.entrySceneId, entityId: "large-ghost" };
    const positions = Array.from({ length: 25_000 }, (_, index) => index * 2);
    document.authoring.detached = positions.flatMap((_, index) => [structuredClone(target),
      { sceneId: document.entrySceneId, entityId: `unrelated-${index}` }]);
    expect(document.authoring.detached).toHaveLength(50_000);
    const op = { op: "set_authoring_membership", scene_id: target.sceneId, entity_id: target.entityId,
      membership: "detachment" };
    const removed = apply(document, [{ ...op, present: false }]);
    expect(removed.authoring?.detached).toHaveLength(25_000);
    const restored = apply(removed, [{ ...op, present: true, positions }]);
    expect(restored).toEqual(document);
  });

  it("uses the last explicit request for the same ownership key", () => {
    const before = retained(create);
    const target = { op: "set_authoring_membership", scene_id: before.entrySceneId, entity_id: "ghost",
      membership: "detachment" };
    expect(apply(before, [{ ...target, present: true, positions: [0] },
      { ...target, present: false }])).toEqual(before);
    const after = apply(before, [{ ...target, present: false }, { ...target, present: true, positions: [0, 1] }]);
    expect(after.authoring?.detached).toEqual([
      { sceneId: before.entrySceneId, entityId: "ghost" }, { sceneId: before.entrySceneId, entityId: "ghost" }
    ]);
  });

  it("round-trips optional-field removal ownership with the existing payload shape", () => {
    const base = create(`ownership-removal-${create.name}`);
    const baseline = apply(base, [
      { op: "add_entity", scene_id: base.entrySceneId, entity: { id: "parent" } },
      { op: "add_entity", scene_id: base.entrySceneId, entity: { id: "child", parentId: "parent" } }
    ]);
    const before = anyGameDocument.parse({ ...baseline, authoring: { version: 1,
      program: { source: "return inputs.document", inputs: {}, seed: 1 }, baseline } });
    const target = { scene_id: before.entrySceneId, entity_id: "child" };
    const remove = { op: "update_entity", ...target, set: { parentId: null } };
    const membership = { op: "set_override_membership", ...target, path: ["parentId"] };
    const after = apply(before, [remove, { ...membership, override: { value: null, remove: true } }]);
    expect(after).toEqual(apply(before, [remove]));
    expect(after.authoring?.overrides).toEqual([{ sceneId: target.scene_id, entityId: target.entity_id,
      path: ["parentId"], value: null, remove: true }]);
    expect(apply(after, [{ op: "update_entity", ...target, set: { parentId: "parent" } },
      { ...membership, override: null }])).toEqual(before);
    expect(anyGameDocumentOp.safeParse({ ...membership, override: { remove: true } }).success).toBe(false);
  });

  it("rejects malformed occurrence positions and runtime out-of-range insertion", () => {
    const before = retained(create);
    const target = { op: "set_authoring_membership", scene_id: before.entrySceneId, entity_id: "ghost",
      membership: "detachment", present: true };
    for (const positions of [[], [1, 0], [0, 0], [-1], [0.5], [50_000]]) {
      expect(() => apply(before, [{ ...target, positions }])).toThrow();
    }
    const validShape = anyGameDocumentOp.parse({ ...target, positions: [1] });
    try {
      applyAnyGameOps(before, [anyGameDocumentOp.parse(move(before, 42)), validShape]);
      expect.unreachable("Out-of-range position must reject");
    } catch (error) {
      expect(error).toBeInstanceOf(GameOpError);
      expect(error).toMatchObject({ opIndex: 1, path: ["authoring", "detached"], message: expect.stringMatching(/position/i) });
    }
    expect(() => apply(before, [{ ...target, present: false, positions: [0] }])).toThrow();
    expect(before).toEqual(retained(create));
  });

  it("reports the responsible operation when ownership exceeds the existing metadata limit", () => {
    const before = retained(create);
    const original = structuredClone(before);
    const huge = { op: "set_authoring_membership", scene_id: before.entrySceneId,
      entity_id: "x".repeat(16_000_001), membership: "detachment", present: true };
    const parsed = anyGameDocumentOp.parse(huge);
    try {
      applyAnyGameOps(before, [anyGameDocumentOp.parse(move(before, 42)), parsed]);
      expect.unreachable("Oversized ownership must reject");
    } catch (error) {
      expect(error).toBeInstanceOf(GameOpError);
      expect(error).toMatchObject({ opIndex: 1, path: ["authoring"], message: expect.stringContaining("size limit") });
    }
    expect(before).toEqual(original);
  });
});
