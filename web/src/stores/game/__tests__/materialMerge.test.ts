import { expect, it } from "@jest/globals";
import { gameDocument3D, gameMaterial3D, type GameDocument3D } from "@nodetool-ai/protocol";
import { createNative3DGame, validateGame3D } from "@nodetool-ai/game-runtime";

import { mergeByUnits } from "../../documentMerge";
import { acceptServerAnyGameUnit, anyGameMergeAdapter } from "../anyMerge";
import { gameMergeAdapter3D } from "../merge3D";

const gold = gameMaterial3D.parse({ color: "#ffaa00" });
const silver = gameMaterial3D.parse({ color: "#aabbcc" });

function withMaterial(): GameDocument3D {
  return { ...createNative3DGame("material-merge"), materials: { gold } };
}

function assignMaterial(doc: GameDocument3D, prefab: boolean): void {
  const visual = doc.scenes[0].entities.find((entity) => entity.id === "player-visual");
  if (!visual?.primitive) { throw new Error("Fixture primitive missing"); }
  if (prefab) {
    const entity = structuredClone(visual);
    delete entity.parentId;
    if (!entity.primitive) { throw new Error("Fixture primitive missing"); }
    entity.primitive.materialId = "gold";
    doc.prefabs.visual = { rootId: entity.id, entities: [entity], externalAssets: [], externalScenes: [] };
  } else {
    visual.primitive.materialId = "gold";
  }
}

it("merges distinct material edits and reports competing edits on one material", () => {
  const base = withMaterial();
  const draft = { ...base, materials: { gold: silver } };
  const server = { ...base, materials: { gold, copper: silver } };
  const merged = mergeByUnits(base, draft, server, gameMergeAdapter3D, { mergeWithoutOps: true });
  expect(merged.conflicts).toEqual([]);
  expect(merged.doc.materials).toEqual({ gold: silver, copper: silver });
  const contested = mergeByUnits(base, draft, { ...base, materials: { gold: gameMaterial3D.parse({ color: "#ff0000" }) } },
    anyGameMergeAdapter(base), { mergeWithoutOps: true });
  expect(contested.conflicts).toHaveLength(1);
  expect(contested.conflicts[0].unit).toEqual({ kind: "material", id: "gold", label: "material gold" });
  expect(gameDocument3D.parse(contested.doc).materials?.gold).toEqual(silver);
});

it("omits the material table after the last unreferenced material is removed", () => {
  const base = withMaterial();
  const removed = createNative3DGame("material-merge");
  const merged = mergeByUnits(base, base, removed, gameMergeAdapter3D, { mergeWithoutOps: true });
  expect(merged.conflicts).toEqual([]);
  expect("materials" in merged.doc).toBe(false);
});

it.each([false, true])("preserves a material deleted remotely when the draft assigns it (prefab: %s)", (prefab) => {
  const base = withMaterial();
  const draft = structuredClone(base);
  assignMaterial(draft, prefab);
  const server = createNative3DGame("material-merge");
  const merged = mergeByUnits(base, draft, server, anyGameMergeAdapter(base), { mergeWithoutOps: true });
  expect(gameDocument3D.parse(merged.doc).materials).toEqual({ gold });
  expect(gameDocument3D.parse(merged.doc)).toEqual(merged.doc);
  expect(validateGame3D(merged.doc).valid).toBe(true);
  expect("materials" in merged.nextBase).toBe(false);
});

it.each([false, true])("preserves a material deleted locally when the server assigns it (prefab: %s)", (prefab) => {
  const base = withMaterial();
  const draft = createNative3DGame("material-merge");
  const server = structuredClone(base);
  assignMaterial(server, prefab);
  const merged = mergeByUnits(base, draft, server, anyGameMergeAdapter(base), { mergeWithoutOps: true });
  expect(gameDocument3D.parse(merged.doc).materials).toEqual({ gold });
  expect(gameDocument3D.parse(merged.doc)).toEqual(merged.doc);
  expect(validateGame3D(merged.doc).valid).toBe(true);
  expect(merged.nextBase).toEqual(server);
});


it("retains a referenced material when accepting server deletion, then removes it after clearing refs", () => {
  const current = withMaterial();
  assignMaterial(current, false);
  const server = createNative3DGame("material-merge");
  const retained = acceptServerAnyGameUnit(current, server, "material", "gold");
  expect(retained.schemaVersion).toBe(3);
  if (retained.schemaVersion !== 3) { throw new Error("Unexpected game dimension"); }
  expect(retained.materials).toEqual({ gold });
  expect(validateGame3D(retained).valid).toBe(true);
  const cleared = structuredClone(retained);
  for (const entity of cleared.scenes[0].entities) {
    if (entity.primitive) { delete entity.primitive.materialId; }
  }
  const removed = acceptServerAnyGameUnit(cleared, server, "material", "gold");
  expect("materials" in removed).toBe(false);
});

it("retains only owned material entries for prototype-named references", () => {
  const base = createNative3DGame("material-merge");
  const draft = structuredClone(base);
  assignMaterial(draft, false);
  const visual = draft.scenes[0].entities.find((entity) => entity.id === "player-visual");
  if (!visual?.primitive) { throw new Error("Fixture primitive missing"); }
  visual.primitive.materialId = "constructor";
  const missing = mergeByUnits(base, draft, base, gameMergeAdapter3D, { mergeWithoutOps: true });
  expect("materials" in missing.doc).toBe(false);
  const owned = { ...draft, materials: Object.fromEntries([["constructor", gold]]) };
  const retained = mergeByUnits({ ...base, materials: owned.materials }, owned, base, gameMergeAdapter3D, { mergeWithoutOps: true });
  expect(retained.doc.materials).toEqual(owned.materials);
  expect(Object.hasOwn(retained.doc.materials ?? {}, "constructor")).toBe(true);
});

it("retains a full named material table referenced by a large entity list", () => {
  const base = createNative3DGame("material-merge");
  const materials = Object.fromEntries(Array.from({ length: 256 }, (_, index) => [`material-${index}`, gold]));
  base.materials = materials;
  const draft = structuredClone(base);
  const visual = draft.scenes[0].entities.find((entity) => entity.id === "player-visual");
  if (!visual?.primitive) { throw new Error("Fixture primitive missing"); }
  const additionalEntities = 4096 - draft.scenes[0].entities.length;
  for (let index = 0; index < additionalEntities; index++) {
    const entity = structuredClone(visual);
    entity.id = `material-visual-${index}`;
    delete entity.parentId;
    if (!entity.primitive) { throw new Error("Fixture primitive missing"); }
    entity.primitive.materialId = `material-${index % 256}`;
    draft.scenes[0].entities.push(entity);
  }
  const server = structuredClone(base);
  delete server.materials;
  const merged = mergeByUnits(base, draft, server, gameMergeAdapter3D, { mergeWithoutOps: true });
  expect(merged.doc.materials).toEqual(materials);
  expect(merged.doc.scenes[0].entities).toHaveLength(draft.scenes[0].entities.length);
});
