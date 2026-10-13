import { describe, expect, it } from "vitest";
import { gameDocument3D, gameInputFrame3D, gameScriptCommand3D, type GameDocument3D } from "@nodetool-ai/protocol";
import { createGameSession3D } from "../src/session3d.js";
import { prepareRapier3D } from "../src/spatial3d/world.js";
import { base64ToBytes, bytesToBase64 } from "../src/spatial3d/digest.js";

const input = gameInputFrame3D.parse({ pressed: [], justPressed: [], axes: {}, look: { x: 0, y: 0 } });
const zero = { x: 0, y: 0, z: 0 };
function fixture(commands: string, mass = 1, type = "dynamic"): GameDocument3D {
  return gameDocument3D.parse({ schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "forces", revision: "fixture", tickRate: 60,
    entrySceneId: "room", presentation: { aspectRatio: 16 / 9, hudWidth: 960, hudHeight: 540 }, inputActions: [], assets: {},
    scenes: [{ id: "room", name: "Room", gravity: zero, activeCameraId: "camera", entities: [
      { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" }, behavior: { kind: "follow", targetId: "body" } } },
      { id: "body", transform3d: { position: { x: 10, y: 0, z: 0 } }, body3d: { type, ...(type === "dynamic" ? { mass } : {}) },
        collider3d: { kind: "box", halfExtents: { x: 0.5, y: 0.5, z: 0.5 } }, behaviors: [{ kind: "script", maxTickMs: 20, source: `input => ({state:null,commands:${commands}})` }] }
    ] }] });
}
const force = "{kind:'addForce',force:{x:60,y:0,z:0}}";
const torque = "{kind:'addTorque',torque:{x:0,y:0,z:1}}";

describe("one-tick 3D script loads", () => {
  it("strictly validates bounded finite load vectors and world points", () => {
    for (const command of [ { kind: "addForce", force: zero }, { kind: "addTorque", torque: zero }, { kind: "addForceAtPoint", force: zero, point: zero } ]) {
      expect(gameScriptCommand3D.safeParse(command).success).toBe(true);
      expect(gameScriptCommand3D.safeParse({ ...command, target: "other" }).success).toBe(false);
    }
    for (const x of [Infinity, NaN, 1e308, 1e6 + 1, -1e6 - 1]) {
      expect(gameScriptCommand3D.safeParse({ kind: "addForce", force: { ...zero, x } }).success).toBe(false);
      expect(gameScriptCommand3D.safeParse({ kind: "addTorque", torque: { ...zero, x } }).success).toBe(false);
      expect(gameScriptCommand3D.safeParse({ kind: "addForceAtPoint", force: zero, point: { ...zero, x } }).success).toBe(false);
    }
    expect(gameScriptCommand3D.safeParse({ kind: "addForce", force: { ...zero, extra: 1 } }).success).toBe(false);
  });

  it("accumulates forces for one tick with acceleration inversely proportional to mass", async () => {
    const light = await createGameSession3D(fixture(`input.tick===0?[${force},${force}]:[]`), 1);
    const heavy = await createGameSession3D(fixture(`input.tick===0?[${force},${force}]:[]`, 2), 1);
    try {
      light.step(input); heavy.step(input);
      expect(light.inspect({ entityId: "body" }).entities[0].velocity.x).toBeCloseTo(2, 5);
      expect(heavy.inspect({ entityId: "body" }).entities[0].velocity.x).toBeCloseTo(1, 5);
      light.step(input); heavy.step(input);
      expect(light.inspect({ entityId: "body" }).entities[0].velocity.x).toBeCloseTo(2, 5);
      expect(heavy.inspect({ entityId: "body" }).entities[0].velocity.x).toBeCloseTo(1, 5);
    } finally { light.dispose(); heavy.dispose(); }
  });

  it("applies world-space force at a point and accumulates torque for only one tick", async () => {
    const session = await createGameSession3D(fixture(`input.tick===0?[{kind:'addForceAtPoint',force:{x:0,y:60,z:0},point:{x:11,y:0,z:0}},${torque}]:[]`), 1);
    try {
      session.step(input);
      const first = session.inspect({ entityId: "body" }).entities[0];
      expect(first.velocity.y).toBeCloseTo(1, 5);
      expect(first.angularVelocity.z).toBeCloseTo(6.1, 5);
      session.step(input);
      expect(session.inspect({ entityId: "body" }).entities[0].angularVelocity.z).toBe(first.angularVelocity.z);
      const rapier = await prepareRapier3D();
      const saved = session.snapshot().physics;
      const world = rapier.World.restoreSnapshot(base64ToBytes(saved.bytes));
      try {
        expect(world.getRigidBody(saved.bodies.body).userForce()).toEqual(zero);
        expect(world.getRigidBody(saved.bodies.body).userTorque()).toEqual(zero);
      } finally { world.free(); }
    } finally { session.dispose(); }
  });

  it("keeps forces and torque in world axes when the body is rotated", async () => {
    const document = fixture(`input.tick===0?[${force},${torque},${torque}]:[]`);
    document.scenes[0].entities[1].transform3d.rotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
    const session = await createGameSession3D(document, 1);
    try {
      session.step(input);
      const body = session.inspect({ entityId: "body" }).entities[0];
      expect(body.velocity).toEqual({ x: 1, y: 0, z: 0 });
      expect(body.angularVelocity.z).toBeCloseTo(0.2, 5);
      session.step(input);
      expect(session.inspect({ entityId: "body" }).entities[0].angularVelocity.z).toBe(body.angularVelocity.z);
    } finally { session.dispose(); }
  });

  it("rejects loads on owners without a body", async () => {
    const document = fixture(`[${force}]`);
    delete document.scenes[0].entities[1].body3d;
    delete document.scenes[0].entities[1].collider3d;
    const session = await createGameSession3D(document, 1);
    try { expect(() => session.step(input)).toThrow("active dynamic body"); } finally { session.dispose(); }
  });

  it.each(["static", "kinematic"])("rejects loads on %s owners", async type => {
    const session = await createGameSession3D(fixture(`[${force}]`, 1, type), 1);
    try { expect(() => session.step(input)).toThrow("active dynamic body"); } finally { session.dispose(); }
  });

  it("sums a maximum command batch without overflowing Rapier", async () => {
    const document = fixture("input.tick===0?Array.from({length:64},()=>({kind:'addForceAtPoint',force:{x:1e6,y:1e6,z:1e6},point:{x:1e6,y:1e6,z:1e6}})):[]");
    const behavior = document.scenes[0].entities[1].behaviors[0];
    if (behavior.kind !== "script") { throw new Error("Missing script"); }
    behavior.maxCommands = 64;
    const session = await createGameSession3D(document, 1);
    try {
      session.step(input);
      const body = session.inspect({ entityId: "body" }).entities[0];
      for (const value of Object.values(body.velocity)) { expect(Number.isFinite(value)).toBe(true); }
      for (const value of Object.values(body.angularVelocity)) { expect(Number.isFinite(value)).toBe(true); }
      expect(body.velocity.x).toBeCloseTo(64e6 / 60, 0);
    } finally { session.dispose(); }
  });

  it("zero loads preserve sleeping bodies and nonzero force wakes them", async () => {
    const plain = await createGameSession3D(fixture("[]"), 1);
    const zeros = await createGameSession3D(fixture("[{kind:'addForce',force:{x:0,y:0,z:0}},{kind:'addTorque',torque:{x:0,y:0,z:0}},{kind:'addForceAtPoint',force:{x:0,y:0,z:0},point:{x:100,y:100,z:100}}]"), 1);
    const wake = await createGameSession3D(fixture(`input.tick===120?[${force}]:[]`), 1);
    const rapier = await prepareRapier3D();
    try {
      for (let tick = 0; tick < 120; tick += 1) {
        plain.step(input); zeros.step(input); wake.step(input);
        expect(zeros.snapshot().physics).toEqual(plain.snapshot().physics);
      }
      const saved = zeros.snapshot().physics;
      const sleeping = rapier.World.restoreSnapshot(base64ToBytes(saved.bytes));
      let physics = saved;
      try {
        sleeping.getRigidBody(saved.bodies.body).sleep();
        physics = { ...saved, bytes: bytesToBase64(sleeping.takeSnapshot()) };
      } finally { sleeping.free(); }
      const zeroRestored = await createGameSession3D(fixture("[{kind:'addForce',force:{x:0,y:0,z:0}},{kind:'addTorque',torque:{x:0,y:0,z:0}},{kind:'addForceAtPoint',force:{x:0,y:0,z:0},point:{x:100,y:100,z:100}}]"), 1, { ...zeros.snapshot(), physics });
      const wakeRestored = await createGameSession3D(fixture(`input.tick===120?[${force}]:[]`), 1, { ...wake.snapshot(), physics });
      try {
        zeroRestored.step(input);
        const state = zeroRestored.snapshot().physics;
        const world = rapier.World.restoreSnapshot(base64ToBytes(state.bytes));
        try { expect(world.getRigidBody(state.bodies.body).isSleeping()).toBe(true); } finally { world.free(); }
        wakeRestored.step(input);
        expect(wakeRestored.inspect({ entityId: "body" }).entities[0].velocity.x).toBeCloseTo(1, 5);
      } finally { zeroRestored.dispose(); wakeRestored.dispose(); }
    } finally { plain.dispose(); zeros.dispose(); wake.dispose(); }
  });

  it("keeps loads scoped to spawned instances and the current scene", async () => {
    const document = fixture("input.tick===0?[{kind:'spawn',prefabId:'loaded',position:{x:20,y:0,z:0}}]:input.tick===3?[{kind:'despawn',entityId:'loaded#1/body'}]:input.tick===4?[{kind:'sceneTransition',sceneId:'next'}]:[]");
    const loaded = fixture(`[${force}]`).scenes[0].entities[1];
    document.prefabs.loaded = { rootId: "body", externalAssets: [], externalScenes: [], entities: [loaded] };
    const next = fixture("[]").scenes[0];
    document.scenes.push({ ...next, id: "next", name: "Next" });
    const session = await createGameSession3D(document, 1);
    try {
      session.step(input);
      expect(session.inspect({ entityId: "loaded#1/body" }).entities[0].velocity.x).toBe(0);
      session.step(input);
      expect(session.inspect({ entityId: "loaded#1/body" }).entities[0].velocity.x).toBeCloseTo(1, 5);
      session.step(input);
      expect(session.inspect({ entityId: "loaded#1/body" }).entities[0].velocity.x).toBeCloseTo(2, 5);
      session.step(input);
      expect(session.inspect({ entityId: "loaded#1/body" }).entities).toEqual([]);
      session.step(input);
      expect(session.snapshot().sceneId).toBe("next");
      session.step(input);
      expect(session.inspect({ entityId: "body" }).entities[0].velocity).toEqual(zero);
    } finally { session.dispose(); }
  });

  it("replays exact snapshots and events across tick 60 through tick 120", async () => {
    const document = fixture(`input.tick%3===0?[${force},${torque},{kind:'addForceAtPoint',force:{x:0,y:1,z:0},point:{x:10,y:0,z:0}}]:[]`);
    const session = await createGameSession3D(document, 1);
    try {
      for (let tick = 0; tick < 60; tick += 1) { session.step(input); }
      const restored = await createGameSession3D(document, 1, session.snapshot());
      try {
        for (let tick = 60; tick < 120; tick += 1) {
          expect(restored.step(input).events).toEqual(session.step(input).events);
          expect(restored.snapshot()).toEqual(session.snapshot());
        }
      } finally { restored.dispose(); }
    } finally { session.dispose(); }
  });
});
