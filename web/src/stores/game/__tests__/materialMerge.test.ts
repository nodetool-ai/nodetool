import { expect, it } from "@jest/globals";
import { gameDocument3D, gameMaterial3D, type GameDocument3D, type GameEntity3D } from "@nodetool-ai/protocol";
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
  const materials = Object.fromEntries(Array.from({ length: 256 }, (_, index) => [`material-${index}`,
    gameMaterial3D.parse({ ...gold, baseColorTexture: { assetId: `paint-${index}` } })]));
  const image = withTexturedMaterial().assets.paint;
  const images = Object.fromEntries(Array.from({ length: 256 }, (_, index) => [`paint-${index}`, image]));
  base.assets = { ...base.assets, ...images };
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
  for (const slot of Object.keys(images)) { delete server.assets[slot]; }
  const merged = mergeByUnits(base, draft, server, gameMergeAdapter3D, { mergeWithoutOps: true });
  expect(merged.doc.materials).toEqual(materials);
  for (const slot of Object.keys(images)) { expect(merged.doc.assets[slot]).toEqual(images[slot]); }
  expect(validateGame3D(merged.doc).valid).toBe(true);
  expect(merged.doc.scenes[0].entities).toHaveLength(draft.scenes[0].entities.length);
});

function withTexturedMaterial(slot = "paint"): GameDocument3D {
  const document = withMaterial();
  document.materials = { gold: gameMaterial3D.parse({ ...gold, baseColorTexture: { assetId: slot } }) };
  document.assets = { ...document.assets, [slot]: { mediaKind: "image", assetId: "owned-paint", digest: "paint-digest", required: true,
    format: "png", width: 2, height: 2, byteLength: 64, preparationVersion: "1" } };
  return gameDocument3D.parse(document);
}

it.each([false, true])("restores image bindings for deleted presets in both merge directions (prefab: %s)", (prefab) => {
  const base = withTexturedMaterial();
  const assigned = structuredClone(base);
  assignMaterial(assigned, prefab);
  if (prefab) { assigned.prefabs.visual.externalAssets = ["paint"]; }
  const deleted = structuredClone(base);
  delete deleted.materials;
  delete deleted.assets.paint;
  deleted.scenes[0].name = "Remote scene name";
  for (const [draft, server] of [[assigned, deleted], [deleted, assigned]]) {
    expect(validateGame3D(draft).valid).toBe(true);
    expect(validateGame3D(server).valid).toBe(true);
    const merged = mergeByUnits(base, draft, server, anyGameMergeAdapter(base), { mergeWithoutOps: true });
    expect(validateGame3D(merged.doc).valid).toBe(true);
    expect(merged.doc.assets.paint).toEqual(base.assets.paint);
    expect(merged.doc.materials).toEqual(base.materials);
    expect(merged.doc.scenes[0].name).toBe("Remote scene name");
  }
});

it("keeps compatible server image changes while restoring a referenced preset", () => {
  const base = withTexturedMaterial();
  const draft = structuredClone(base);
  assignMaterial(draft, false);
  const server = structuredClone(base);
  delete server.materials;
  server.assets.paint = { ...base.assets.paint, assetId: "replacement-paint", digest: "replacement-digest" };
  const merged = mergeByUnits(base, draft, server, gameMergeAdapter3D, { mergeWithoutOps: true });
  expect(validateGame3D(merged.doc).valid).toBe(true);
  expect(merged.doc.assets.paint).toEqual(server.assets.paint);
});

it.each([false, true])("raises an asset conflict for incompatible bindings in either merge direction (remote: %s)", (remote) => {
  const base = withTexturedMaterial();
  const assigned = structuredClone(base);
  assignMaterial(assigned, false);
  const replaced = structuredClone(base);
  delete replaced.materials;
  replaced.assets.paint = { mediaKind: "audio", assetId: "other-audio", digest: "audio-digest", required: true };
  const draft = remote ? assigned : replaced;
  const server = remote ? replaced : assigned;
  expect(validateGame3D(draft).valid).toBe(true);
  expect(validateGame3D(server).valid).toBe(true);
  const merged = mergeByUnits(base, draft, server, anyGameMergeAdapter(base), { mergeWithoutOps: true });
  expect(validateGame3D(merged.doc).valid).toBe(true);
  expect(merged.doc.assets.paint).toEqual(base.assets.paint);
  expect(merged.conflicts).toContainEqual(expect.objectContaining({
    unit: { kind: "asset", id: "paint", label: "asset paint" }, reason: "edited",
    external: { slot: "paint", binding: server.assets.paint }, draft: { slot: "paint", binding: draft.assets.paint }
  }));
  const accepted = acceptServerAnyGameUnit(merged.doc, server, "asset", "paint");
  if (accepted.schemaVersion !== 3) { throw new Error("Unexpected game dimension"); }
  expect(validateGame3D(accepted).valid).toBe(true);
  expect(accepted.assets.paint).toEqual(base.assets.paint);
  const cleared = structuredClone(accepted);
  delete cleared.materials;
  for (const entity of cleared.scenes[0].entities) {
    if (entity.primitive) { delete entity.primitive.materialId; }
  }
  const resolved = acceptServerAnyGameUnit(cleared, server, "asset", "paint");
  if (resolved.schemaVersion !== 3) { throw new Error("Unexpected game dimension"); }
  expect(validateGame3D(resolved).valid).toBe(true);
  expect(resolved.assets.paint).toEqual(server.assets.paint);
  expect(replaced.assets.paint.mediaKind).toBe("audio");
});

it("restores only owned image bindings for prototype-named material texture slots", () => {
  const base = withTexturedMaterial("constructor");
  const draft = structuredClone(base);
  assignMaterial(draft, false);
  const server = structuredClone(base);
  delete server.materials;
  delete server.assets.constructor;
  const merged = mergeByUnits(base, draft, server, gameMergeAdapter3D, { mergeWithoutOps: true });
  expect(Object.hasOwn(merged.doc.assets, "constructor")).toBe(true);
  expect(merged.doc.assets.constructor).toEqual(base.assets.constructor);
  expect(validateGame3D(merged.doc).valid).toBe(true);
});

it("restores image identity from the source that supplies the selected preset", () => {
  const base = withTexturedMaterial();
  const draft = structuredClone(base);
  delete draft.materials;
  delete draft.assets.paint;
  const server = structuredClone(base);
  assignMaterial(server, false);
  server.materials = { gold: gameMaterial3D.parse({ color: "#0000ff", baseColorTexture: { assetId: "paint" } }) };
  server.assets.paint = { ...base.assets.paint, assetId: "server-image", digest: "server-image-digest" };
  const merged = mergeByUnits(base, draft, server, anyGameMergeAdapter(base), { mergeWithoutOps: true });
  expect(validateGame3D(merged.doc).valid).toBe(true);
  expect(merged.doc.materials).toEqual(server.materials);
  expect(merged.doc.assets.paint).toEqual(server.assets.paint);
});

it("keeps an unused locally edited textured preset valid when its remote copy and image are removed", () => {
  const base = withTexturedMaterial();
  const draft = structuredClone(base);
  draft.materials = { gold: gameMaterial3D.parse({ ...base.materials?.gold, roughness: 0.25 }) };
  const server = structuredClone(base);
  delete server.materials;
  delete server.assets.paint;
  const merged = mergeByUnits(base, draft, server, gameMergeAdapter3D, { mergeWithoutOps: true });
  expect(merged.doc.materials).toEqual(draft.materials);
  expect(validateGame3D(merged.doc).valid).toBe(true);
  expect(merged.doc.assets.paint).toEqual(draft.assets.paint);
});

it.each(["baseColorTexture", "normalTexture", "ormTexture", "emissiveTexture"] as const)("retains image dependencies in the %s slot", (field) => {
  const base = withTexturedMaterial();
  base.materials = { gold: gameMaterial3D.parse({ ...gold, [field]: { assetId: "paint" } }) };
  const draft = structuredClone(base);
  assignMaterial(draft, false);
  const server = structuredClone(base);
  delete server.materials;
  delete server.assets.paint;
  const merged = mergeByUnits(base, draft, server, gameMergeAdapter3D, { mergeWithoutOps: true });
  expect(validateGame3D(merged.doc).valid).toBe(true);
  expect(merged.doc.assets.paint).toEqual(base.assets.paint);
});

function inlineVisual(document: GameDocument3D, prefab: boolean): GameEntity3D {
  const entity = prefab ? document.prefabs.visual.entities[0] : document.scenes[0].entities.find((entry) => entry.id === "player-visual");
  if (!entity) { throw new Error("Fixture visual missing"); }
  return entity;
}
function withInlineVisual(component: "primitive" | "model", prefab: boolean, slot = "paint"): GameDocument3D {
  const document = withTexturedMaterial(slot);
  delete document.materials;
  const sceneVisual = inlineVisual(document, false);
  if (prefab) {
    const entity = structuredClone(sceneVisual);
    delete entity.parentId;
    document.prefabs.visual = { rootId: entity.id, entities: [entity], externalAssets: [], externalScenes: [] };
  }
  if (component === "model") {
    document.assets.hero = { mediaKind: "model", assetId: "hero", digest: "hero-digest", required: true, format: "glb", preparationVersion: "1",
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }, nodeIds: ["node:0"], clipIds: [],
      geometryBytes: 1, textureBytes: 0, triangles: 1, supportedExtensions: [] };
    const visual = inlineVisual(document, prefab);
    delete visual.primitive;
    visual.model = { assetId: "hero", castShadow: true, receiveShadow: true, material: {} };
    if (prefab) { document.prefabs.visual.externalAssets = ["hero"]; }
  }
  return gameDocument3D.parse(document);
}
const inlineCases = (["primitive", "model"] as const).flatMap((component) => [false, true].flatMap((prefab) =>
  (["baseColorTexture", "normalTexture", "ormTexture", "emissiveTexture"] as const).map((field) => ({ component, prefab, field }))));
it.each(inlineCases)("inline textures survive deletion in either merge direction: $component $field prefab=$prefab", ({ component, prefab, field }) => {
  const base = withInlineVisual(component, prefab);
  const assigned = structuredClone(base);
  const visual = inlineVisual(assigned, prefab)[component];
  if (!visual) { throw new Error("Fixture component missing"); }
  visual.material = { ...visual.material, [field]: { assetId: "paint" } };
  if (prefab) { assigned.prefabs.visual.externalAssets.push("paint"); }
  const deleted = structuredClone(base);
  delete deleted.assets.paint;
  for (const [draft, server] of [[assigned, deleted], [deleted, assigned]]) {
    expect(validateGame3D(draft).valid).toBe(true);
    expect(validateGame3D(server).valid).toBe(true);
    const merged = mergeByUnits(base, draft, server, anyGameMergeAdapter(base), { mergeWithoutOps: true });
    expect(validateGame3D(merged.doc).valid).toBe(true);
    expect(merged.doc.assets.paint).toEqual(base.assets.paint);
  }
});

it.each(["primitive", "model"] as const)("restores owned constructor image aliases for inline %s materials", (component) => {
  const base = withInlineVisual(component, false, "constructor");
  const draft = structuredClone(base);
  const visual = inlineVisual(draft, false)[component];
  if (!visual) { throw new Error("Fixture component missing"); }
  visual.material = { ...visual.material, normalTexture: { assetId: "constructor" } };
  const server = structuredClone(base);
  delete server.assets.constructor;
  const merged = mergeByUnits(base, draft, server, gameMergeAdapter3D, { mergeWithoutOps: true });
  expect(validateGame3D(merged.doc).valid).toBe(true);
  expect(Object.hasOwn(merged.doc.assets, "constructor")).toBe(true);
});
it.each(["primitive", "model"] as const)("preserves compatible remote image identity for inline %s materials", (component) => {
  const base = withInlineVisual(component, false);
  const draft = structuredClone(base);
  const visual = inlineVisual(draft, false)[component];
  if (!visual) { throw new Error("Fixture component missing"); }
  visual.material = { ...visual.material, normalTexture: { assetId: "paint" } };
  const server = structuredClone(base);
  server.assets.paint = { ...base.assets.paint, assetId: "remote-image", digest: "remote-image-digest" };
  const merged = mergeByUnits(base, draft, server, gameMergeAdapter3D, { mergeWithoutOps: true });
  expect(validateGame3D(merged.doc).valid).toBe(true);
  expect(merged.doc.assets.paint).toEqual(server.assets.paint);
});
it.each(["primitive", "model"] as const)("ignores inline texture dependencies shadowed by a named %s material", (component) => {
  const base = withInlineVisual(component, false);
  base.materials = { plain: gold };
  const draft = structuredClone(base);
  const visual = inlineVisual(draft, false)[component];
  if (!visual) { throw new Error("Fixture component missing"); }
  visual.materialId = "plain";
  visual.material = { ...visual.material, normalTexture: { assetId: "paint" } };
  const server = structuredClone(base);
  delete server.assets.paint;
  const merged = mergeByUnits(base, draft, server, gameMergeAdapter3D, { mergeWithoutOps: true });
  expect(validateGame3D(merged.doc).valid).toBe(true);
  expect(Object.hasOwn(merged.doc.assets, "paint")).toBe(false);
});
it.each(["primitive", "model"] as const)("raises and safely accepts inline %s image conflicts in either direction", (component) => {
  const base = withInlineVisual(component, false);
  const assigned = structuredClone(base);
  const visual = inlineVisual(assigned, false)[component];
  if (!visual) { throw new Error("Fixture component missing"); }
  visual.material = { ...visual.material, normalTexture: { assetId: "paint" } };
  const replaced = structuredClone(base);
  replaced.assets.paint = { mediaKind: "audio", assetId: "other-audio", digest: "other-digest", required: true };
  for (const [draft, server] of [[assigned, replaced], [replaced, assigned]]) {
    const merged = mergeByUnits(base, draft, server, anyGameMergeAdapter(base), { mergeWithoutOps: true });
    expect(validateGame3D(merged.doc).valid).toBe(true);
    expect(merged.conflicts).toContainEqual(expect.objectContaining({
      unit: { kind: "asset", id: "paint", label: "asset paint" },
      external: { slot: "paint", binding: server.assets.paint }, draft: { slot: "paint", binding: draft.assets.paint }
    }));
    const accepted = acceptServerAnyGameUnit(merged.doc, server, "asset", "paint");
    if (accepted.schemaVersion !== 3) { throw new Error("Unexpected game dimension"); }
    expect(validateGame3D(accepted).valid).toBe(true);
    expect(accepted.assets.paint).toEqual(base.assets.paint);
  }
});

it("indexes inline source scopes distinctly when scene and entity IDs contain separators", () => {
  const base = withInlineVisual("primitive", false);
  const first = base.scenes[0];
  first.id = "a:b";
  base.entrySceneId = first.id;
  const firstVisual = first.entities.find((entity) => entity.id === "player-visual");
  if (!firstVisual) { throw new Error("Fixture visual missing"); }
  firstVisual.id = "c";
  const second = structuredClone(first);
  second.id = "a";
  const secondVisual = second.entities.find((entity) => entity.id === "c");
  if (!secondVisual) { throw new Error("Fixture visual missing"); }
  secondVisual.id = "b:c";
  base.scenes.push(second);
  const draft = structuredClone(base);
  const visual = draft.scenes[0].entities.find((entity) => entity.id === "c")?.primitive;
  if (!visual) { throw new Error("Fixture primitive missing"); }
  visual.material.normalTexture = { assetId: "paint" };
  const server = structuredClone(base);
  delete server.assets.paint;
  expect(validateGame3D(draft).valid).toBe(true);
  expect(validateGame3D(server).valid).toBe(true);
  const combined = structuredClone(draft);
  delete combined.assets.paint;
  const finalize = gameMergeAdapter3D.finalizeMergedDocument;
  if (!finalize) { throw new Error("Missing native finalizer"); }
  const merged = finalize(combined, base, draft, server, []);
  expect(validateGame3D(merged).valid).toBe(true);
  expect(merged.assets.paint).toEqual(base.assets.paint);
});
