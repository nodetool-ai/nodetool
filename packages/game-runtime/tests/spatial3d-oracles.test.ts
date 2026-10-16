import { expect, it } from "vitest";
import { gameDocument3D, gameEntity3D, gameInputFrame3D, type GameDocument3D, type GameEntity3D, type GameQuaternion3D, type GameVector3 } from "@nodetool-ai/protocol";
import { createGameSession3D, type GameSessionStepResult3D } from "../src/session3d.js";
import { prepareRapier3D, SpatialWorld3D } from "../src/spatial3d/world.js";
import type { EntityState3D } from "../src/spatial3d/state.js";

const input = () => gameInputFrame3D.parse({ pressed: [], justPressed: [], axes: {} });

interface SupportFixtureOptions {
  readonly ceilingY?: number;
  readonly target?: GameVector3;
  readonly wall?: boolean;
}
function fixture<T>(value: T | undefined): T {
  if (value === undefined) { throw new Error("Required physics fixture is missing"); }
  return value;
}

function supportDocument(options: SupportFixtureOptions = {}): GameDocument3D {
  const target = options.target ?? { x: 0, y: -0.05, z: 0 };
  const repeat = { ...target, y: target.y + 0.2 };
  return gameDocument3D.parse({
    schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "support-ceiling", revision: "oracle-v1", tickRate: 60,
    entrySceneId: "room", presentation: { aspectRatio: 16 / 9, hudWidth: 960, hudHeight: 540 }, inputActions: ["jump"], inputAxes: ["moveX", "moveZ"], assets: {},
    scenes: [{ id: "room", name: "Room", activeCameraId: "camera", entities: [
      { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" }, behavior: { kind: "fixed" } } },
      { id: "actor", transform3d: { position: { x: 0, y: 0.76, z: 0 } }, body3d: { type: "kinematic" },
        collider3d: { kind: "capsule", radius: 0.25, halfHeight: 0.5 }, character3d: {} },
      { id: "platform", transform3d: { position: { x: 0, y: -0.25, z: 0 } }, body3d: { type: "kinematic" },
        collider3d: { kind: "box", halfExtents: { x: 2, y: 0.25, z: 2 } }, behaviors: [{ kind: "script",
          source: `input=>({state:null,commands:input.tick===20?[{kind:"setKinematicPose",position:${JSON.stringify(target)}}]:input.tick===90?[{kind:"setKinematicPose",position:${JSON.stringify(repeat)}}]:[]})` }] },
      { id: "ceiling", transform3d: { position: { x: 0, y: options.ceilingY ?? 1.86, z: 0 } }, body3d: { type: "static" },
        collider3d: { kind: "box", halfExtents: { x: 2, y: 0.25, z: 2 } } },
      ...(options.wall ? [{ id: "wall", transform3d: { position: { x: 0.55, y: 0.75, z: 0 } }, body3d: { type: "static" },
        collider3d: { kind: "box", halfExtents: { x: 0.1, y: 2, z: 2 } } }] : [])
    ] }]
  });
}

it("clips platform support correction against the complete capsule beneath a ceiling", async () => {
  const session = await createGameSession3D(supportDocument(), 1);
  try {
    for (let tick = 0; tick < 20; tick += 1) { session.step(input()); }
    expect(session.inspect({ entityId: "actor" }).entities[0]?.controller?.supportId).toBe("platform");
    session.step(input());
    const actor = fixture(session.inspect({ entityId: "actor" }).entities[0]);
    expect(actor.transform.position.y + 0.75).toBeLessThanOrEqual(1.61001);
  } finally { session.dispose(); }
});

it("retains ordinary upward carry when the capsule has clearance", async () => {
  const session = await createGameSession3D(supportDocument({ ceilingY: 5 }), 1);
  try {
    for (let tick = 0; tick < 20; tick += 1) { session.step(input()); }
    const before = fixture(session.inspect({ entityId: "actor" }).entities[0]);
    session.step(input());
    const after = fixture(session.inspect({ entityId: "actor" }).entities[0]);
    expect(after.transform.position.y - before.transform.position.y).toBeCloseTo(0.2, 5);
    expect(after.controller?.supportId).toBe("platform");
  } finally { session.dispose(); }
});

it("clips sideways platform carry against walls using the complete capsule", async () => {
  const session = await createGameSession3D(supportDocument({ ceilingY: 5, wall: true, target: { x: 0.5, y: -0.25, z: 0 } }), 1);
  try {
    for (let tick = 0; tick < 21; tick += 1) { session.step(input()); }
    const actor = fixture(session.inspect({ entityId: "actor" }).entities[0]);
    expect(actor.transform.position.x).toBeGreaterThan(0);
    expect(actor.transform.position.x + 0.25).toBeLessThanOrEqual(0.45001);
  } finally { session.dispose(); }
});

it("preserves ceiling clearance through 120 seed-1 ticks and exact replay from tick 60", async () => {
  const document = supportDocument();
  const session = await createGameSession3D(document, 1);
  const continuation: Pick<GameSessionStepResult3D, "frame" | "events">[] = [];
  try {
    for (let tick = 0; tick < 60; tick += 1) {
      session.step(input());
      expect(fixture(session.inspect({ entityId: "actor" }).entities[0]).transform.position.y + 0.75).toBeLessThanOrEqual(1.61001);
    }
    const checkpoint = session.snapshot();
    for (let tick = 60; tick < 120; tick += 1) {
      const result = session.step(input());
      continuation.push({ frame: result.frame, events: result.events });
      expect(fixture(session.inspect({ entityId: "actor" }).entities[0]).transform.position.y + 0.75).toBeLessThanOrEqual(1.61001);
    }
    const restored = await createGameSession3D(document, 1, checkpoint);
    try {
      for (const expected of continuation) {
        const result = restored.step(input());
        expect({ frame: result.frame, events: result.events }).toEqual(expected);
      }
      expect(restored.snapshot()).toEqual(session.snapshot());
    } finally { restored.dispose(); }
  } finally { session.dispose(); }
});

function dynamicDocument(source: string, collider = true): GameDocument3D {
  const document = supportDocument();
  const scene = fixture(document.scenes[0]);
  scene.gravity = { x: 0, y: 0, z: 0 };
  const body = gameEntity3D.parse({ id: "crate", transform3d: {}, body3d: { type: "dynamic", mass: 2 },
    behaviors: [{ kind: "script", source }] });
  if (collider) { body.collider3d = gameEntity3D.parse({ id: "shape", transform3d: {}, collider3d: { kind: "box", halfExtents: { x: 0.5, y: 0.5, z: 0.5 } } }).collider3d; }
  scene.entities = [fixture(scene.entities[0]), body];
  return document;
}

it.each([0, 1])("uses authored mass for an impulse at tick %s", async (tick) => {
  const document = dynamicDocument(`input=>({state:null,commands:input.tick===${tick}?[{kind:"impulse",impulse:{x:2,y:0,z:0}}]:[]})`);
  const session = await createGameSession3D(document, 1);
  try {
    for (let step = 0; step <= tick; step += 1) { session.step(input()); }
    expect(fixture(session.inspect({ entityId: "crate" }).entities[0]).velocity.x).toBeCloseTo(1, 5);
  } finally { session.dispose(); }
});

it("uses authored mass for a colliderless body's one-tick force", async () => {
  const document = dynamicDocument('input=>({state:null,commands:input.tick===0?[{kind:"addForce",force:{x:60,y:0,z:0}}]:[]})', false);
  const session = await createGameSession3D(document, 1);
  try {
    session.step(input());
    expect(fixture(session.inspect({ entityId: "crate" }).entities[0]).velocity.x).toBeCloseTo(0.5, 5);
  } finally { session.dispose(); }
});

it("initializes spawned body mass before an immediate load", async () => {
  const document = dynamicDocument("input=>({state:null,commands:[]})");
  const definition = fixture(fixture(document.scenes[0]).entities[1]);
  const state: EntityState3D = { definition, definitionId: definition.id, spawnTick: 0, active: true,
    transform: structuredClone(definition.transform3d), localTransform: structuredClone(definition.transform3d),
    previousTransform: structuredClone(definition.transform3d), velocity: { x: 0, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 } };
  const world = new SpatialWorld3D(await prepareRapier3D(), fixture(document.scenes[0]), [], new Map());
  try {
    world.add(state);
    world.impulse(state, { x: 2, y: 0, z: 0 });
    const handle = fixture(world.snapshot().bodies.crate);
    expect(world.world.getRigidBody(handle).linvel().x).toBeCloseTo(1, 5);
  } finally { world.dispose(); }
});

it("rejects snapshots from the previous physics runtime before restoring their native world", async () => {
  const document = supportDocument();
  const session = await createGameSession3D(document, 1);
  try {
    const snapshot = session.snapshot();
    const oldBuild = "rapier3d-compat@0.19.3:sha256:1ce1c8c4036b4dcd3bde86c6efdb0f270cf5e274979b1de6ab8052947ef166c5";
    await expect(createGameSession3D(document, 1, { ...snapshot, physicsBuild: oldBuild })).rejects.toThrow(/physics build/);
  } finally { session.dispose(); }
});
it.each([
  { translate: false, pivotX: 0, pivotZ: 0 },
  { translate: true, pivotX: 0, pivotZ: 0 },
  { translate: true, pivotX: 3, pivotZ: -1 }
])("carries a rider through platform rotation and replay: %o", async ({ translate, pivotX, pivotZ }) => {
  const document = supportDocument({ ceilingY: 5 });
  const actor = fixture(fixture(document.scenes[0]).entities.find((entity) => entity.id === "actor"));
  actor.transform3d.position.x = pivotX + 2;
  actor.transform3d.position.z = pivotZ;
  const platform = fixture(fixture(document.scenes[0]).entities.find((entity) => entity.id === "platform"));
  platform.transform3d.position.x = pivotX;
  platform.transform3d.position.z = pivotZ;
  platform.collider3d = gameEntity3D.parse({ id: "shape", transform3d: {}, collider3d: { kind: "box", halfExtents: { x: 3, y: 0.25, z: 3 } } }).collider3d;
  const behavior = platform.behaviors.find((item) => item.kind === "script");
  if (!behavior || behavior.kind !== "script") { throw new Error("Platform script fixture is missing"); }
  behavior.source = `input=>{const n=Math.min(60,Math.max(0,input.tick-19));const half=n*Math.PI/240;return {state:null,commands:n>0?[{kind:"setKinematicPose",position:{x:${pivotX}+${translate ? "n/60" : "0"},y:-0.25,z:${pivotZ}},rotation:[0,Math.sin(half),0,Math.cos(half)]}]:[]}}`;
  const session = await createGameSession3D(document, 1);
  const continuation: Pick<GameSessionStepResult3D, "frame" | "events">[] = [];
  try {
    for (let tick = 0; tick < 60; tick += 1) { session.step(input()); }
    const checkpoint = session.snapshot();
    for (let tick = 60; tick < 120; tick += 1) {
      const result = session.step(input());
      continuation.push({ frame: result.frame, events: result.events });
    }
    const position = fixture(session.inspect({ entityId: "actor" }).entities[0]).transform.position;
    expect(position.x).toBeCloseTo(pivotX + (translate ? 1 : 0), 4);
    expect(position.y).toBeCloseTo(0.76, 4);
    expect(position.z).toBeCloseTo(pivotZ - 2, 4);
    const restored = await createGameSession3D(document, 1, checkpoint);
    try {
      for (const expected of continuation) {
        const result = restored.step(input());
        expect({ frame: result.frame, events: result.events }).toEqual(expected);
      }
      expect(restored.snapshot()).toEqual(session.snapshot());
    } finally { restored.dispose(); }
  } finally { session.dispose(); }
});
it.each(["sensor", "character"])("observes one swept entry and exit when the %s moves, including replay", async (moving) => {
  const document = supportDocument({ ceilingY: 5 });
  const actor = fixture(fixture(document.scenes[0]).entities.find((entity) => entity.id === "actor"));
  const platform = fixture(fixture(document.scenes[0]).entities.find((entity) => entity.id === "platform"));
  platform.behaviors = [];
  platform.collider3d = gameEntity3D.parse({ id: "shape", transform3d: {}, collider3d: { kind: "box", halfExtents: { x: 3, y: 0.25, z: 3 } } }).collider3d;
  if (moving === "character") {
    actor.transform3d.position.x = -2;
    if (!actor.character3d) { throw new Error("Character fixture is missing"); }
    actor.character3d.speed = 240;
    actor.character3d.acceleration = 14400;
  }
  const sensor = gameEntity3D.parse({ id: "sensor", transform3d: { position: { x: moving === "sensor" ? -2 : 0, y: 0.76, z: 0 } },
    body3d: { type: "kinematic" }, collider3d: { kind: "sphere", radius: 0.1, sensor: true },
    behaviors: moving === "sensor" ? [{ kind: "script", source: 'input=>({state:null,commands:input.tick===20?[{kind:"setKinematicPose",position:{x:2,y:0.76,z:0}}]:input.tick===90?[{kind:"setKinematicPose",position:{x:-2,y:0.76,z:0}}]:[]})' }] : [] });
  fixture(document.scenes[0]).entities.push(sensor);
  const session = await createGameSession3D(document, 1);
  const continuation: Pick<GameSessionStepResult3D, "frame" | "events">[] = [];
  const phases: { tick: number; phase: string }[] = [];
  const frameInput = (tick: number) => gameInputFrame3D.parse({ pressed: [], justPressed: [],
    axes: moving === "character" && (tick === 20 || tick === 90) ? { moveX: tick === 20 ? 1 : -1 } : {} });
  try {
    for (let tick = 0; tick < 60; tick += 1) {
      const result = session.step(frameInput(tick));
      for (const event of result.events) {
        if (event.kind === "contact" && event.sensor && [event.entityId, event.otherId].includes("actor") && [event.entityId, event.otherId].includes("sensor")) { phases.push({ tick: result.frame.tick, phase: event.phase }); }
      }
    }
    const checkpoint = session.snapshot();
    for (let tick = 60; tick < 120; tick += 1) {
      const result = session.step(frameInput(tick));
      continuation.push({ frame: result.frame, events: result.events });
      for (const event of result.events) {
        if (event.kind === "contact" && event.sensor && [event.entityId, event.otherId].includes("actor") && [event.entityId, event.otherId].includes("sensor")) { phases.push({ tick: result.frame.tick, phase: event.phase }); }
      }
    }
    expect(phases).toEqual([{ tick: 21, phase: "enter" }, { tick: 22, phase: "exit" }, { tick: 91, phase: "enter" }, { tick: 92, phase: "exit" }]);
    const restored = await createGameSession3D(document, 1, checkpoint);
    try {
      for (const [offset, expected] of continuation.entries()) {
        const result = restored.step(frameInput(offset + 60));
        expect({ frame: result.frame, events: result.events }).toEqual(expected);
      }
      expect(restored.snapshot()).toEqual(session.snapshot());
    } finally { restored.dispose(); }
  } finally { session.dispose(); }
});

function entityState(definition: GameEntity3D): EntityState3D {
  return { definition, definitionId: definition.id, spawnTick: 0, active: true,
    transform: structuredClone(definition.transform3d), localTransform: structuredClone(definition.transform3d),
    previousTransform: structuredClone(definition.transform3d), velocity: { x: 0, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 } };
}
const rolledCharacter: GameQuaternion3D = [0, 0, Math.SQRT1_2, Math.SQRT1_2];

it("rejects a rolled character teleport before changing state or the native body", async () => {
  const document = supportDocument();
  const state = entityState(fixture(fixture(document.scenes[0]).entities.find((entity) => entity.id === "actor")));
  const world = new SpatialWorld3D(await prepareRapier3D(), fixture(document.scenes[0]), [state], new Map());
  try {
    const before = structuredClone(state);
    const physics = world.snapshot();
    expect(() => world.teleport(state, { kind: "teleport", position: { x: 10, y: 0.76, z: 0 }, rotation: rolledCharacter, resetVelocity: false })).toThrow(/upright/);
    expect(state).toEqual(before);
    expect(world.snapshot()).toEqual(physics);
  } finally { world.dispose(); }
});

it("rejects a rolled spawned character before creating any native body", async () => {
  const document = supportDocument();
  const state = entityState(fixture(fixture(document.scenes[0]).entities.find((entity) => entity.id === "actor")));
  state.transform.rotation = rolledCharacter;
  const world = new SpatialWorld3D(await prepareRapier3D(), fixture(document.scenes[0]), [], new Map());
  try {
    const physics = world.snapshot();
    expect(() => world.add(state)).toThrow(/upright/);
    expect(world.snapshot()).toEqual(physics);
    expect(world.world.bodies.len()).toBe(0);
  } finally { world.dispose(); }
});

it.each(["transform", "previousTransform", "localTransform"] as const)("rejects a rolled character %s in a snapshot", async (field) => {
  const document = supportDocument();
  const session = await createGameSession3D(document, 1);
  try {
    const snapshot = session.snapshot();
    const actor = fixture(snapshot.entities.find((entity) => entity.id === "actor"));
    fixture(actor[field]).rotation = rolledCharacter;
    await expect(createGameSession3D(document, 1, snapshot)).rejects.toThrow(/upright/);
  } finally { session.dispose(); }
});

it("continues to accept an upright character yaw teleport", async () => {
  const document = supportDocument();
  const state = entityState(fixture(fixture(document.scenes[0]).entities.find((entity) => entity.id === "actor")));
  const world = new SpatialWorld3D(await prepareRapier3D(), fixture(document.scenes[0]), [state], new Map());
  try {
    world.teleport(state, { kind: "teleport", position: { x: 1, y: 0.76, z: 0 }, rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2], resetVelocity: false });
    expect(state.transform.position.x).toBe(1);
    expect(state.transform.rotation).toEqual([0, Math.SQRT1_2, 0, Math.SQRT1_2]);
  } finally { world.dispose(); }
});
function twoBodyDocument(): GameDocument3D {
  const document = dynamicDocument("input=>({state:null,commands:[]})");
  const a = fixture(fixture(document.scenes[0]).entities[1]);
  a.id = "a";
  a.transform3d.position.x = -2;
  a.behaviors = [];
  const b = structuredClone(a);
  b.id = "b";
  b.transform3d.position.x = 2;
  fixture(document.scenes[0]).entities.push(b);
  return document;
}

it.each(["bodies", "both", "colliders", "duplicate-body", "duplicate-collider", "extra-key"])("rejects mismatched snapshot ownership: %s", async (tamper) => {
  const document = twoBodyDocument();
  const session = await createGameSession3D(document, 1);
  try {
    const snapshot = session.snapshot();
    const bodies = snapshot.physics.bodies;
    const colliders = snapshot.physics.colliders;
    if (tamper === "bodies" || tamper === "both") { [bodies.a, bodies.b] = [fixture(bodies.b), fixture(bodies.a)]; }
    if (tamper === "colliders" || tamper === "both") { [colliders.a, colliders.b] = [fixture(colliders.b), fixture(colliders.a)]; }
    if (tamper === "duplicate-body") { bodies.b = fixture(bodies.a); }
    if (tamper === "duplicate-collider") { colliders.b = fixture(colliders.a); }
    if (tamper === "extra-key") { bodies.foreign = fixture(bodies.a); }
    await expect(createGameSession3D(document, 1, snapshot)).rejects.toThrow(/Physics snapshot/);
  } finally { session.dispose(); }
});

it("preserves valid initial authored Float32 poses and exact native snapshot bytes", async () => {
  const document = twoBodyDocument();
  const a = fixture(fixture(document.scenes[0]).entities[1]);
  a.transform3d.position = { x: -2.1, y: 0.3, z: 0.1 };
  a.transform3d.rotation = [0.1 / Math.sqrt(0.95), 0.2 / Math.sqrt(0.95), 0.3 / Math.sqrt(0.95), 0.9 / Math.sqrt(0.95)];
  const session = await createGameSession3D(document, 1);
  try {
    const snapshot = session.snapshot();
    const restored = await createGameSession3D(document, 1, snapshot);
    try { expect(restored.snapshot()).toEqual(snapshot); }
    finally { restored.dispose(); }
  } finally { session.dispose(); }
});
