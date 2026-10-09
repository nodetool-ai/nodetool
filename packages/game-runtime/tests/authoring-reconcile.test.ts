import { describe, expect, it } from "vitest";
import { anyGameDocument, gameDocument, type AnyGameDocument } from "@nodetool-ai/protocol";
import { applyGameOps, applyGameOps3D, createTopDownRoomGame, gameAuthoringBaseline, reconcileGameAuthoring, stableGameAuthoringId, validateGame, gameDocumentOp } from "../src/index.js";
import { blockout } from "./fixtures-game3d.js";

function retained(document: AnyGameDocument) {
  return anyGameDocument.parse({ ...document, authoring: { version: 1, program: { source: "return builder.game();", inputs: {}, seed: 1 }, baseline: document } });
}
function simple() {
  const document = createTopDownRoomGame("retained");
  document.scenes[0].entities = [0, 1, 2].map((index) => ({ id: `gem-${index}`, name: "", templateOnly: false, transform2d: { x: index, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, behaviors: [] }));
  return document;
}

describe("retained game authoring", () => {
  it("preserves moved and deleted entities while propagating another field", () => {
    const initial = gameDocument.parse(retained(simple()));
    const edited = applyGameOps(initial, [{ op: "update_entity", entity_id: "gem-1", set: { transform2d: { x: 44 } } }, { op: "remove_entity", entity_id: "gem-2" }, { op: "add_entity", scene_id: initial.scenes[0].id, entity: { id: "manual" } }]);
    const generated = simple();
    for (const entity of generated.scenes[0].entities) { entity.transform2d.x += 10; entity.transform2d.scaleX = 2; }
    const result = reconcileGameAuthoring(edited, retained(generated));
    expect(result.conflicts).toEqual([]);
    const output = gameDocument.parse(result.document).scenes[0].entities;
    expect(output.find((entity) => entity.id === "gem-1")?.transform2d).toMatchObject({ x: 44, scaleX: 2 });
    expect(output.map((entity) => entity.id)).toEqual(["gem-0", "gem-1", "manual"]);
    expect(reconcileGameAuthoring(result.document, retained(generated)).document).toEqual(result.document);
  });

  it("resets one overridden property and detaches independently", () => {
    const initial = gameDocument.parse(retained(simple()));
    const edited = applyGameOps(initial, [{ op: "update_entity", entity_id: "gem-1", set: { transform2d: { x: 44, y: 55 } } }]);
    const reset = applyGameOps(edited, [{ op: "reset_override", entity_id: "gem-1", path: ["transform2d", "x"] }]);
    expect(reset.scenes[0].entities[1].transform2d).toMatchObject({ x: 1, y: 55 });
    const detached = applyGameOps(reset, [{ op: "detach_entity", entity_id: "gem-1" }]);
    const generated = simple(); generated.scenes[0].entities[1].transform2d.x = 999;
    expect(gameDocument.parse(reconcileGameAuthoring(detached, retained(generated)).document).scenes[0].entities[1].transform2d.x).toBe(1);
  });

  it("preserves explicit overrides after the generator temporarily equals them", () => {
    const initial = gameDocument.parse(retained(simple()));
    const moved = applyGameOps(initial, [{ op: "update_entity", entity_id: "gem-1", set: { transform2d: { x: 3 } } }]);
    const matching = simple(); matching.scenes[0].entities[1].transform2d.x = 3;
    const equalBake = gameDocument.parse(reconcileGameAuthoring(moved, retained(matching)).document);
    const edited = applyGameOps(equalBake, [{ op: "update_entity", entity_id: "gem-0", set: { name: "Unrelated edit" } }]);
    const differing = simple(); differing.scenes[0].entities[1].transform2d.x = 4;
    expect(gameDocument.parse(reconcileGameAuthoring(edited, retained(differing)).document).scenes[0].entities[1].transform2d.x).toBe(3);
    const reset = applyGameOps(edited, [{ op: "reset_override", entity_id: "gem-1", path: ["transform2d", "x"] }]);
    expect(gameDocument.parse(reconcileGameAuthoring(reset, retained(differing)).document).scenes[0].entities[1].transform2d.x).toBe(4);
  });

  it("does not resurrect a deleted detached generated entity", () => {
    const initial = gameDocument.parse(retained(simple()));
    const deleted = applyGameOps(initial, [{ op: "detach_entity", entity_id: "gem-1" }, { op: "remove_entity", entity_id: "gem-1" }]);
    const rebuilt = reconcileGameAuthoring(deleted, retained(simple())).document;
    expect(rebuilt.scenes[0].entities.some((entity) => entity.id === "gem-1")).toBe(false);
    expect(reconcileGameAuthoring(rebuilt, retained(simple())).document.scenes[0].entities.some((entity) => entity.id === "gem-1")).toBe(false);
    expect(rebuilt.authoring?.detached).toContainEqual({ sceneId: initial.scenes[0].id, entityId: "gem-1" });
  });

  it("rejects an override path that addresses a prototype property", () => {
    for (const path of [["__proto__", "polluted"], ["transform2d", "constructor", "prototype", "polluted"]]) {
      const document = retained(simple());
      if (!document.authoring) { throw new Error("Expected retained authoring"); }
      document.authoring.overrides = [{ sceneId: document.scenes[0].id, entityId: "gem-1", path, value: true }];
      expect(() => gameAuthoringBaseline(document)).toThrow("Override path cannot address prototype properties");
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    }
  });

  it("restores a suppressed entity through an explicit reset", () => {
    const initial = gameDocument.parse(retained(simple()));
    const deleted = applyGameOps(initial, [{ op: "remove_entity", entity_id: "gem-1" }]);
    const restored = applyGameOps(deleted, [{ op: "reset_override", entity_id: "gem-1" }]);
    expect(restored.scenes[0].entities.map((entity) => entity.id)).toContain("gem-1");
    expect(restored.authoring?.suppressions).toEqual([]);
  });

  it("reports removed overridden objects and referenced 3D objects", () => {
    const initial = gameDocument.parse(retained(simple()));
    const edited = applyGameOps(initial, [{ op: "update_entity", entity_id: "gem-1", set: { name: "Moved" } }]);
    const generated = simple(); generated.scenes[0].entities.splice(1, 1);
    expect(reconcileGameAuthoring(edited, retained(generated)).conflicts[0].code).toBe("removed_overridden_entity");
    const three = blockout(); const changed = structuredClone(three); changed.scenes[0].entities = changed.scenes[0].entities.filter((entity) => entity.id !== "player");
    expect(reconcileGameAuthoring(retained(three), retained(changed)).conflicts[0].code).toBe("removed_referenced_entity");
  });

  it("records and resets 3D edits with the same ownership rules", () => {
    const initial = blockout();
    const retained3D = anyGameDocument.parse(retained(initial));
    if (retained3D.schemaVersion !== 3) { throw new Error("Expected 3D document"); }
    const edited = applyGameOps3D(retained3D, [{ op: "update_entity", entity_id: "player", set: { transform3d: { position: { x: 42 } } } }]);
    expect(edited.authoring?.overrides.map((override) => override.path)).toContainEqual(["transform3d", "position", "x"]);
    const reset = applyGameOps3D(edited, [{ op: "reset_override", entity_id: "player" }]);
    expect(reset.scenes[0].entities[1].transform3d.position.x).toBe(0);
  });

  it("reports manual scene settings rather than overwriting them", () => {
    const initial = gameDocument.parse(retained(simple()));
    const edited = applyGameOps(initial, [{ op: "update_scene", scene_id: initial.scenes[0].id, set: { name: "Manual name" } }]);
    expect(reconcileGameAuthoring(edited, retained(simple())).conflicts).toEqual([]);
    const generated = simple(); generated.scenes[0].name = "Generated name";
    const result = reconcileGameAuthoring(edited, retained(generated));
    expect(result.conflicts.map((conflict) => conflict.code)).toContain("modified_settings");
    expect(result.document.scenes[0].name).toBe("Manual name");
  });

  it("rejects ownership removal and forged baselines transactionally", () => {
    const initial = gameDocument.parse(retained(simple()));
    expect(() => applyGameOps(initial, [{ op: "set_document", document: simple() }])).toThrow("cannot be discarded");
    const forged = gameDocument.parse(retained(simple()));
    if (forged.authoring) { forged.authoring.program.source = "return another();"; }
    expect(() => applyGameOps(initial, [{ op: "set_document", document: forged }])).toThrow("apply boundary");
    expect(() => applyGameOps(simple(), [{ op: "set_document", document: initial }])).toThrow("hermetic authoring apply");
    expect(initial.authoring?.program.source).toBe("return builder.game();");
    for (const field of ["parameters", "prefabs", "instances"] as const) {
      const definitions = gameDocument.parse(retained(simple()));
      if (!definitions.authoring) { throw new Error("Expected authoring"); }
      if (field === "parameters") { definitions.authoring.parameters = { speed: { type: "number", default: 4 } }; }
      if (field === "prefabs") { definitions.authoring.prefabs = { forged: { name: "Forged" } }; }
      if (field === "instances") { definitions.authoring.instances = [{ sceneId: definitions.scenes[0].id, entityId: "gem-1", prefabId: "forged" }]; }
      expect(() => applyGameOps(initial, [{ op: "set_document", document: definitions }])).toThrow("apply boundary");
    }
  });

  it("rejects malformed authoring at native validation boundaries", () => {
    const initial = gameDocument.parse(retained(simple()));
    const malformed = structuredClone(initial);
    if (!malformed.authoring) { throw new Error("Expected authoring"); }
    malformed.authoring.overrides = [{ sceneId: initial.scenes[0].id, entityId: "gem-1", path: ["transform2d", "nonexistent"], value: 3 }];
    expect(validateGame(malformed).valid).toBe(false);
    malformed.authoring.overrides = [];
    malformed.authoring.instances = [{ sceneId: initial.scenes[0].id, entityId: "gem-1", prefabId: "missing" }];
    expect(validateGame(malformed).valid).toBe(false);
  });

  it("retains component dictionary overrides named id", () => {
    const generated = simple();
    const frames = [{ x: 0, y: 0, width: 1, height: 1 }];
    generated.schemaVersion = 2;
    generated.scenes[0].entities[1].sprite = { assetId: "gem", width: 1, height: 1, layer: 1 };
    generated.scenes[0].entities[1].animator = { frames, ticksPerFrame: 2, loop: true, clips: { id: { frames, ticksPerFrame: 2, loop: true } } };
    const initial = gameDocument.parse(retained(generated));
    const animator = structuredClone(generated.scenes[0].entities[1].animator);
    if (!animator.clips) { throw new Error("Expected animation clips"); }
    animator.clips.id.ticksPerFrame = 3;
    const edited = applyGameOps(initial, [{ op: "update_entity", entity_id: "gem-1", set: { animator } }]);
    expect(edited.authoring?.overrides.map((override) => override.path)).toContainEqual(["animator", "clips", "id", "ticksPerFrame"]);
    const rebuilt = gameDocument.parse(reconcileGameAuthoring(edited, retained(generated)).document);
    expect(rebuilt.scenes[0].entities[1].animator?.clips?.id.ticksPerFrame).toBe(3);
    expect(gameDocumentOp.safeParse({ op: "update_entity", entity_id: "gem-1", set: { id: "changed" } }).success).toBe(false);
  });

  it("preserves manually changed asset dictionary entries named id", () => {
    const generated = simple();
    generated.assets.id = { ...generated.assets.player, digest: "old" };
    const initial = gameDocument.parse(retained(generated));
    const edited = applyGameOps(initial, [{ op: "bind_asset", slot: "id", binding: { ...generated.assets.id, digest: "manual" } }]);
    const result = reconcileGameAuthoring(edited, retained(generated));
    expect(result.conflicts).toEqual([]);
    expect(result.document.assets.id.digest).toBe("manual");
  });

  it("includes removed generated IDs in the preview change set", () => {
    const initial = retained(simple());
    const generated = simple(); generated.scenes[0].entities = generated.scenes[0].entities.filter((entity) => entity.id !== "gem-1");
    const result = reconcileGameAuthoring(initial, retained(generated));
    expect(result.conflicts).toEqual([]);
    expect(result.changedEntityIds).toContain("gem-1");
  });

  it("reports generated keys colliding with manual entities", () => {
    const initial = gameDocument.parse(retained(simple()));
    const manual = applyGameOps(initial, [{ op: "add_entity", scene_id: initial.scenes[0].id, entity: { id: "manual", name: "Hand placed" } }]);
    const generated = simple(); generated.scenes[0].entities.push({ ...generated.scenes[0].entities[0], id: "manual", name: "Generated" });
    const result = reconcileGameAuthoring(manual, retained(generated));
    expect(result.conflicts.map((conflict) => conflict.code)).toContain("manual_entity_collision");
    expect(result.document.scenes[0].entities.find((entity) => entity.id === "manual")?.name).toBe("Hand placed");
  });

  it("handles large keyed collections without changing identity after insertion", () => {
    expect(stableGameAuthoringId("a:b", "c", "d", "e")).not.toBe(stableGameAuthoringId("a", "b:c", "d", "e"));
    const generated = simple();
    generated.scenes[0].entities = Array.from({ length: 10000 }, (_, index) => ({ ...generated.scenes[0].entities[0], id: stableGameAuthoringId("unit", "scene", "gems", String(index)) }));
    const result = reconcileGameAuthoring(retained(generated), retained(generated));
    expect(result.conflicts).toEqual([]);
    expect(result.document.scenes[0].entities).toHaveLength(10000);
  });
});

it("preserves explicit metadata replacements while rebuilding unrelated authored transforms", () => {
  const baseline = simple();
  baseline.schemaVersion = 4;
  baseline.engineVersion = "3";
  baseline.scenes[0].entities[0].tags = ["baseline"];
  baseline.scenes[0].entities[0].props = {nested:{removed:1,keep:null}};
  const initial = gameDocument.parse(retained(baseline));
  const edited = applyGameOps(initial,[{op:"update_entity",entity_id:"gem-0",set:{tags:[],props:{nested:{keep:null}}}}]);
  const generated = structuredClone(baseline);
  generated.scenes[0].entities[0].transform2d.x = 10;
  const result = reconcileGameAuthoring(edited,retained(generated));
  expect(result.conflicts).toEqual([]);
  const entity = gameDocument.parse(result.document).scenes[0].entities[0];
  expect(entity.transform2d.x).toBe(10);
  expect(entity.tags).toEqual([]);
  expect(entity.props).toEqual({nested:{keep:null}});
});
