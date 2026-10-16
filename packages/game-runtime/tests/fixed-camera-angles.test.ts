import { expect, it } from "vitest";
import { gameDocument3D, gameInputFrame3D, type GameDocument3D, type GameQuaternion3D } from "@nodetool-ai/protocol";
import { createGameSession3D } from "../src/session3d.js";
import { fixedCameraRotation3D } from "../src/spatial3d/camera.js";
import type { EntityState3D } from "../src/spatial3d/state.js";

const QUARTER_TURN: GameQuaternion3D = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
const EMPTY = gameInputFrame3D.parse({ pressed: [], justPressed: [], axes: {}, look: { x: 0, y: 0 } });

function documentFor(target: "camera" | "rig", rotation: GameQuaternion3D = [0, 0, 0, 1]): GameDocument3D {
  const source = `({tick}) => ({state:null, commands:tick === 0 ? [{kind:'setVisual',rotation:${JSON.stringify(QUARTER_TURN)}}] : []})`;
  return gameDocument3D.parse({ schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "fixed-camera", revision: "fixture",
    entrySceneId: "scene", tickRate: 60, presentation: { aspectRatio: 1, hudWidth: 128, hudHeight: 128 },
    inputActions: ["jump"], inputAxes: ["moveX", "moveZ"], assets: {}, scenes: [{ id: "scene", name: "Scene", activeCameraId: "camera", entities: [
      { id: "rig", transform3d: {}, behaviors: target === "rig" ? [{ kind: "script", source }] : [] },
      { id: "camera", ...(target === "rig" ? { parentId: "rig" } : {}), transform3d: { rotation },
        camera3d: { projection: { kind: "perspective" }, behavior: { kind: "fixed" } },
        behaviors: target === "camera" ? [{ kind: "script", source }] : [] },
      { id: "player", transform3d: { position: { x: 0, y: 0.82, z: 0 } }, body3d: { type: "kinematic" },
        collider3d: { kind: "capsule", radius: 0.3, halfHeight: 0.5 }, character3d: {} },
      { id: "observer", transform3d: {}, behaviors: [{ kind: "script", source: "({camera}) => ({state:{observedYaw:camera.yaw,observedPitch:camera.pitch},commands:[]})" }] },
      { id: "floor", transform3d: { position: { x: 0, y: -0.5, z: 0 } }, body3d: { type: "static" },
        collider3d: { kind: "box", halfExtents: { x: 100, y: 0.5, z: 100 } } }
    ] }] });
}

it("derives initial fixed-camera pitch from its rendered world rotation", async () => {
  const pitch = Math.PI / 6;
  const game = documentFor("camera", [Math.sin(pitch / 2), 0, 0, Math.cos(pitch / 2)]);
  const session = await createGameSession3D(game, 1);
  try {
    expect(session.snapshot().camera.pitch).toBeCloseTo(pitch, 12);
    expect(session.snapshot().camera.yaw).toBeCloseTo(0, 12);
  } finally { session.dispose(); }
});

it.each(["camera", "rig"] as const)("uses same-tick scripted %s rotation for movement and the next script camera input", async (target) => {
  const game = documentFor(target);
  const session = await createGameSession3D(game, 1);
  try {
    const first = session.step(gameInputFrame3D.parse({ ...EMPTY, axes: { moveZ: -1 } }));
    const player = session.inspect({ entityId: "player" }).entities[0];
    expect(first.frame.camera.transform.rotation).toEqual(QUARTER_TURN);
    expect(session.snapshot().camera.yaw).toBeCloseTo(Math.PI / 2, 12);
    expect(player.transform.position.x).toBeLessThan(0);
    expect(player.transform.position.z).toBeCloseTo(0, 10);
    session.step(EMPTY);
    expect(Object.values(session.snapshot().scriptState)).toContainEqual({ observedYaw: session.snapshot().camera.yaw, observedPitch: 0 });
  } finally { session.dispose(); }
});

it.each(["camera", "rig"] as const)("replays 120 ticks with seed1 from tick60 after scripted %s rotation", async (target) => {
  const game = documentFor(target);
  const route = Array.from({ length: 120 }, (_, tick) => gameInputFrame3D.parse({ ...EMPTY, axes: { moveZ: tick < 90 ? -1 : 0 } }));
  const session = await createGameSession3D(game, 1);
  try {
    for (const input of route.slice(0, 60)) { session.step(input); }
    const saved = session.snapshot();
    const restored = await createGameSession3D(game, 1, saved);
    try {
      expect(restored.snapshot()).toEqual(saved);
      for (const input of route.slice(60)) {
        const actual = restored.step(input);
        const expected = session.step(input);
        expect(actual.frame).toEqual(expected.frame);
        expect(actual.events).toEqual(expected.events);
        expect(restored.snapshot()).toEqual(session.snapshot());
      }
      expect(session.snapshot().tick).toBe(120);
    } finally { restored.dispose(); }
  } finally { session.dispose(); }
});

it("derives script camera input from the restored fixed world pose before the first restored script call", async () => {
  const game = documentFor("rig");
  const session = await createGameSession3D(game, 1);
  try {
    session.step(EMPTY);
    const saved = session.snapshot();
    // Older sessions could save a rotated fixed camera with its stale initial angles.
    saved.camera.yaw = 0;
    const restored = await createGameSession3D(game, 1, saved);
    try {
      restored.step(EMPTY);
      const observer = Object.values(restored.snapshot().scriptState).find((state) => state !== null && typeof state === "object" && !Array.isArray(state) && "observedYaw" in state);
      expect(observer).toEqual({ observedYaw: session.snapshot().camera.yaw, observedPitch: 0 });
    } finally { restored.dispose(); }
  } finally { session.dispose(); }
});


it("resolves a full-size ancestor chain iteratively without mutating cached world transforms", () => {
  const definition = documentFor("rig").scenes[0].entities[0];
  const states: EntityState3D[] = Array.from({ length: 8192 }, (_, index) => ({
    definition: { ...definition, id: `node-${index}`, ...(index > 0 ? { parentId: `node-${index - 1}` } : {}) },
    definitionId: `node-${index}`, spawnTick: 0, active: true,
    transform: structuredClone(definition.transform3d), localTransform: structuredClone(definition.transform3d),
    previousTransform: structuredClone(definition.transform3d), velocity: { x: 0, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 }
  }));
  states[0].transform.rotation = QUARTER_TURN;
  const camera = states[states.length - 1];
  const before = structuredClone(camera.transform);
  expect(fixedCameraRotation3D(camera, states)).toEqual(QUARTER_TURN);
  expect(camera.transform).toEqual(before);
});
