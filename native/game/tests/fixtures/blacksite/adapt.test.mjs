import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createBlacksiteDocument } from "./adapt.mjs";

const source = JSON.parse(await readFile(new URL("../../../../../packages/game-runtime/samples/blacksite/game.json", import.meta.url), "utf8"));
const fixture = () => createBlacksiteDocument(source, [], ["facility-chunk-0", "facility-chunk-1"]);

test("BLACKSITE adapter retains the original authored visual payloads and camera hierarchy", () => {
  const adapted = fixture();
  const originalScene = source.scenes[0], scene = adapted.scenes[0];
  const entities = new Map(scene.entities.map((entity) => [entity.props.sourceEntityId ?? entity.id, entity]));
  assert.equal(scene.activeCameraId, originalScene.activeCameraId);
  assert.deepEqual(scene.environment, originalScene.environment);
  assert.deepEqual(adapted.presentation, source.presentation);
  assert.deepEqual(adapted.ui, source.ui);
  for (const original of originalScene.entities) {
    const entity = entities.get(original.id);
    assert.ok(entity, `Missing source entity ${original.id}`);
    for (const component of ["camera3d", "animator3d", "light3d", "decal3d", "particles"]) {
      assert.deepEqual(entity[component], original[component], `${original.id}.${component}`);
    }
    if (original.primitive) {
      assert.deepEqual(entity.visual.material, original.primitive.material, original.id);
    }
    for (const behavior of original.behaviors ?? []) {
      if (behavior.kind === "script") {
        assert.ok(adapted.scripts.some((script) => script.source.includes(`(${behavior.source})`)), `Original script missing for ${original.id}`);
      }
    }
  }
  assert.equal(entities.get("camera").parentId, "player");
  assert.equal(entities.get("weapon").parentId, "camera");
  assert.equal(entities.get("muzzle").parentId, "camera");
  assert.equal(entities.get("weapon").visual.cameraRelative, undefined);
  assert.equal(entities.get("exit-field").visual.material.alphaMode, "blend");
  assert.equal(entities.get("exit-field").visual.material.opacity, 0.12);
  assert.equal(entities.get("facility").visual, undefined);
  assert.deepEqual(scene.entities.filter((entity) => entity.parentId === "facility").map((entity) => entity.visual.assetId), ["facility-chunk-0", "facility-chunk-1"]);
});

test("BLACKSITE prefab particles and lifetimes remain available to the visual command adapter", () => {
  const adapted = fixture();
  for (const [id, original] of Object.entries(source.prefabs)) {
    const prefab = adapted.prefabs.find((prefab) => prefab.id === id);
    assert.ok(prefab, `Missing prefab ${id}`);
    assert.deepEqual(prefab.entities[0].particles, original.entities[0].particles);
    assert.deepEqual(prefab.entities[0].props.sourceTags, original.entities[0].tags);
    assert.equal(prefab.entities[0].gameplay.lifetimeTicks, original.entities[0].behaviors.find((behavior) => behavior.kind === "lifetime").ticks);
  }
});

test("BLACKSITE native ID sanitization rejects a collision instead of aliasing two lights", () => {
  const modified = structuredClone(source);
  modified.scenes[0].entities.push({ id: "ceiling-fill-0--7_dot_6" });
  assert.throws(() => createBlacksiteDocument(modified, [], ["facility-chunk-0"]), /entity-ID mapping is ambiguous/);
});
