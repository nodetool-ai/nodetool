import { describe, expect, it } from "vitest";
import { gameEntity3D } from "@nodetool-ai/protocol";
import { anyGameDocumentOp, applyGameOps3D, instantiateGamePrefab3D } from "../src/document-ops3d.js";
import { validateGame3D } from "../src/validate3d.js";
import { createGameSession3D, replayGame3D } from "../src/session3d.js";
import { blockout } from "./fixtures-game3d.js";

function fixture() {
  const document = blockout();
  document.assets.paint = { mediaKind: "image", assetId: "paint-bytes", digest: "paint-digest", format: "png",
    width: 2, height: 2, byteLength: 64, preparationVersion: "1" };
  document.scenes[0].entities.push(
    gameEntity3D.parse({ id: "wall", transform3d: {}, primitive: { kind: "box", dimensions: { x: 2, y: 2, z: 1 } } }),
    gameEntity3D.parse({ id: "decal", transform3d: {}, decal3d: { assetId: "paint", receiverId: "wall", size: { x: 2, y: 3, z: 1 } } })
  );
  return document;
}

describe("3D decal authoring", () => {
  it("patches nested extents, deletes the component, and preserves the input document", () => {
    const before = fixture();
    const original = structuredClone(before);
    const op = anyGameDocumentOp.parse(JSON.parse(JSON.stringify({ op: "update_entity", entity_id: "decal", set: { decal3d: { size: { x: 4 }, opacity: 0.25 } } })));
    if (op.op !== "update_entity") { throw new Error("Expected entity operation"); }
    const after = applyGameOps3D(before, [op]);
    expect(after.scenes[0].entities.at(-1)?.decal3d).toEqual({ assetId: "paint", receiverId: "wall", size: { x: 4, y: 3, z: 1 }, opacity: 0.25, renderOrder: 0 });
    expect(applyGameOps3D(after, [{ op: "update_entity", entity_id: "decal", set: { decal3d: null } }]).scenes[0].entities.at(-1)).not.toHaveProperty("decal3d");
    expect(before).toEqual(original);
    expect(applyGameOps3D(before, [{ op: "duplicate_entity", entity_id: "decal", new_id: "second-decal" }]).scenes[0].entities.at(-1)?.decal3d?.receiverId).toBe("wall");
  });

  it("rejects missing, self, template and nonvisual receivers and missing image bindings", () => {
    expect(validateGame3D(fixture()).errors).toEqual([]);
    for (const receiverId of ["missing", "decal", "camera"]) {
      const document = fixture();
      document.scenes[0].entities.at(-1)!.decal3d!.receiverId = receiverId;
      expect(validateGame3D(document).diagnostics).toContainEqual(expect.objectContaining({ code: "invalid_decal_receiver" }));
    }
    const template = fixture();
    template.scenes[0].entities.find((entity) => entity.id === "wall")!.templateOnly = true;
    expect(validateGame3D(template).diagnostics).toContainEqual(expect.objectContaining({ code: "invalid_decal_receiver" }));
    const missing = fixture();
    delete missing.assets.paint;
    expect(validateGame3D(missing).diagnostics).toContainEqual(expect.objectContaining({ code: "missing_asset" }));
  });

  it("enforces the 32-decal scene budget and validates the final atomic batch", () => {
    const document = fixture();
    const decal = document.scenes[0].entities.at(-1)!;
    for (let index = 1; index < 32; index++) { document.scenes[0].entities.push({ ...structuredClone(decal), id: `decal-${index}` }); }
    expect(validateGame3D(document).errors).toEqual([]);
    document.scenes[0].entities.push({ ...structuredClone(decal), id: "overflow" });
    expect(validateGame3D(document).diagnostics).toContainEqual(expect.objectContaining({ code: "decal_budget" }));
    const before = fixture();
    expect(() => applyGameOps3D(before, [{ op: "remove_entity", entity_id: "wall" }])).toThrow(/receiver/i);
    expect(applyGameOps3D(before, [{ op: "remove_entity", entity_id: "wall" }, { op: "remove_entity", entity_id: "decal" }]).scenes[0].entities.map((entity) => entity.id)).toEqual(["camera", "player"]);
  });

  it("remaps internal prefab receivers and checks declared external assets", () => {
    const document = fixture();
    const wall = structuredClone(document.scenes[0].entities.find((entity) => entity.id === "wall")!);
    const decal = { ...structuredClone(document.scenes[0].entities.at(-1)!), parentId: "wall" };
    document.prefabs.painted = { rootId: "wall", entities: [wall, decal], externalAssets: ["paint"], externalScenes: [] };
    expect(validateGame3D(document).errors).toEqual([]);
    expect(instantiateGamePrefab3D(document.prefabs.painted, "copy").entities[1].decal3d?.receiverId).toBe("copy");
    expect(applyGameOps3D(document, [{ op: "instantiate_prefab", scene_id: "scene", prefab_id: "painted", instance_id: "instance" }]).scenes[0].entities.at(-1)?.decal3d?.receiverId).toBe("instance");
    const duplicate = applyGameOps3D({ ...document, scenes: [{ ...document.scenes[0], entities: document.scenes[0].entities.map((entity) => entity.id === "decal" ? decal : entity) }] }, [{ op: "duplicate_entity", entity_id: "wall", new_id: "duplicate" }]);
    expect(duplicate.scenes[0].entities.at(-1)?.decal3d?.receiverId).toBe("duplicate");
    document.prefabs.painted.externalAssets = [];
    expect(validateGame3D(document).diagnostics).toContainEqual(expect.objectContaining({ code: "undeclared_external_asset" }));
  });

  it("remaps scripted prefab spawns and reconstructs decal references on snapshot restore", async () => {
    const document = fixture();
    const wall = document.scenes[0].entities.find((entity) => entity.id === "wall")!;
    const decal = { ...document.scenes[0].entities.at(-1)!, parentId: "wall" };
    document.prefabs.painted = { rootId: "wall", entities: [wall, decal], externalAssets: ["paint"], externalScenes: [] };
    document.scenes[0].entities[1].behaviors = [{ kind: "script", maxTickMs: 20, maxCommands: 4,
      source: "input => ({ state: null, commands: input.tick === 0 ? [{ kind: 'spawn', prefabId: 'painted' }] : [] })" }];
    const session = await createGameSession3D(document, 1);
    const input = { pressed: [], justPressed: [], axes: {}, look: { x: 0, y: 0 } };
    try {
      session.step(input);
      const frame = session.frame();
      const spawned = frame.entities.find((entity) => entity.entityId !== "decal" && entity.decal3d);
      expect(spawned).toBeDefined();
      expect(spawned?.decal3d?.receiverId).not.toBe("wall");
      expect(frame.entities.find((entity) => entity.entityId === spawned?.decal3d?.receiverId)?.primitive).toBeDefined();
      const restored = await createGameSession3D(document, 1, session.snapshot());
      try {
        expect(restored.frame().entities).toEqual(frame.entities);
        const restoredStep = restored.step(input);
        const originalStep = session.step(input);
        expect(restoredStep.events).toEqual(originalStep.events);
        expect(restoredStep.frame.entities).toEqual(originalStep.frame.entities);
        expect(restored.snapshot()).toEqual(session.snapshot());
      } finally { restored.dispose(); }
    } finally { session.dispose(); }
  });

  it("projects decals without changing simulation and replays tick 60 through 120 exactly", async () => {
    const document = fixture();
    const plain = structuredClone(document);
    delete plain.scenes[0].entities.at(-1)!.decal3d;
    const session = await createGameSession3D(document, 1);
    const baseline = await createGameSession3D(plain, 1);
    const input = { pressed: [], justPressed: [], axes: { moveX: 0.25 }, look: { x: 0, y: 0 } };
    try {
      expect(session.frame().entities.at(-1)?.decal3d).toEqual(document.scenes[0].entities.at(-1)?.decal3d);
      const projected = session.frame().entities.at(-1)?.decal3d;
      if (!projected) { throw new Error("Expected projected decal"); }
      projected.size.x = 99;
      expect(session.frame().entities.at(-1)?.decal3d?.size.x).toBe(2);
      expect(baseline.frame().entities.at(-1)).not.toHaveProperty("decal3d");
      for (let tick = 0; tick < 60; tick++) { session.step(input); baseline.step(input); }
      const checkpoint = session.snapshot();
      const expected = Array.from({ length: 60 }, () => { baseline.step(input); return session.step(input); });
      const replay = await replayGame3D(document, 1, Array.from({ length: 60 }, () => input), checkpoint);
      expect(replay.steps).toEqual(expected);
      expect(replay.snapshot).toEqual(session.snapshot());
      const { contentDigest: _decalDigest, ...actual } = session.snapshot();
      const { contentDigest: _plainDigest, ...original } = baseline.snapshot();
      expect(actual).toEqual(original);
    } finally { session.dispose(); baseline.dispose(); }
  });
});
