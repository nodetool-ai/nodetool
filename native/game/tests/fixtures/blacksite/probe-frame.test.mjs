import assert from "node:assert/strict";
import test from "node:test";
import { controlledNativeFrame, resolvedLegacyCamera } from "./probe-frame.mjs";

const transform = { position: { x: 2, y: 3, z: 4 }, rotation: [0, 0, 0, 1], scale: { x: 1, y: 1, z: 1 } };
const entity = (id) => ({ id, name: id, props: {}, assetIds: [], behaviors: [], prefabOverrides: [], transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } });
const sourceFrame = () => ({ dimension: "3d", sceneId: "reactor", tick: 24, camera: { transform, projection: { kind: "perspective", fov: 78, near: 0.03, far: 160 } }, entities: [{ entityId: "facility", transform, opacity: 1 }], lights: [], hud: [], environment: {}, presentation: { aspectRatio: 16 / 9, hudWidth: 1280, hudHeight: 720 } });
const document = { scenes: [{ id: "reactor", entities: [entity("facility"), { ...entity("facility-chunk-0"), parentId: "facility", visual: { kind: "model", assetId: "facility-chunk-0" } }] }], prefabs: [{ id: "explosion", entities: [entity("explosion")] }] };

test("controlled renderer frame preserves camera/world poses and detached particle samples without running a session", () => {
  const legacy = sourceFrame();
  const particles = [{ entityId: "explosion#1/explosion", emitterId: "smoke", emitter: { blend: "normal", unlit: true }, x: 1, y: 2, z: 3, vx: 4, vy: 5, vz: 6, r: 0.1, g: 0.2, b: 0.3, size: 2, opacity: 0.4, rotation: 0.5, life: 0.6 }];
  const frame = controlledNativeFrame(legacy, document, particles);
  assert.deepEqual(frame.camera, { position: [2, 3, 4], target: [2, 3, 3], up: [0, 1, 0], fov: 78, near: 0.03, far: 160 });
  assert.deepEqual(frame.entities.map((entity) => entity.transform.position), [[2, 3, 4], [2, 3, 4]]);
  assert.ok(frame.entities.every((entity) => !Object.hasOwn(entity, "parentId")));
  assert.equal(document.scenes[0].entities[1].parentId, "facility");
  assert.deepEqual(frame.particles[0].position, [1, 2, 3]);
  assert.deepEqual(frame.particles[0].velocity, [4, 5, 6]);
  assert.deepEqual(frame.particles[0].color, [0.1, 0.2, 0.3]);
  assert.equal(frame.particles[0].entityId, "probe-explosion-1");
  assert.equal(frame.entities.some((entity) => entity.id === "probe-explosion-1"), false);
  assert.equal(frame.particles[0].age / frame.particles[0].lifetime, particles[0].life);
});

test("controlled camera includes actual roll instead of silently using world-up", () => {
  const frame = sourceFrame();
  frame.camera.transform = { ...transform, rotation: [0, 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)] };
  const resolved = resolvedLegacyCamera(frame);
  assert.ok(Math.abs(resolved.up[0] + 1) < 1e-12);
  assert.ok(Math.abs(resolved.up[1]) < 1e-12);
});

test("baked camera and weapon frames do not reapply authored ancestors", () => {
  const game = structuredClone(document);
  game.scenes[0].entities.push({ ...entity("camera"), parentId: "facility" }, { ...entity("weapon"), parentId: "camera" });
  const legacy = sourceFrame();
  legacy.entities.push({ entityId: "camera", transform }, { entityId: "weapon", transform });
  const frame = controlledNativeFrame(legacy, game, []);
  const weapon = frame.entities.find((entity) => entity.id === "weapon");
  assert.equal(Object.hasOwn(weapon, "parentId"), false);
  assert.deepEqual(weapon.transform.position, [2, 3, 4]);
  assert.deepEqual(frame.worldTransforms.weapon.position, [2, 3, 4]);
  assert.equal(game.scenes[0].entities.at(-1).parentId, "camera");
});

test("unmapped visible presentation fails rather than being dropped", () => {
  const frame = sourceFrame();
  frame.entities[0].opacity = 0.5;
  assert.throws(() => controlledNativeFrame(frame, document, []), /per-entity fading/);
  frame.entities[0].opacity = 1;
  frame.hud.push({ text: "visible label" });
  assert.throws(() => controlledNativeFrame(frame, document, []), /visible legacy HUD labels/);
});
