import { describe, expect, it } from "vitest";
import { gameDocument3D, gameInputFrame3D, gameSnapshot3D, type GameDocument3D, type GameInputFrame3D } from "@nodetool-ai/protocol";
import { createNative3DGame } from "../src/sample3d.js";
import { createGameSession3D, replayGame3D } from "../src/session3d.js";
import { GAME_PHYSICS_BUILD_3D } from "../src/spatial3d/world.js";

const input = (axes: Record<string, number> = {}, justPressed: string[] = [], look = { x: 0, y: 0 }): GameInputFrame3D => gameInputFrame3D.parse({ pressed: [], justPressed, axes, look });
function fixture(extra: unknown[] = [], overrides: Record<string, unknown> = {}): GameDocument3D {
  return gameDocument3D.parse({
    schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "test-3d", revision: "fixture-v1", tickRate: 60,
    entrySceneId: "room", presentation: { aspectRatio: 16 / 9, hudWidth: 960, hudHeight: 540 }, inputActions: ["jump", "respawn"], inputAxes: ["moveX", "moveZ"], assets: {},
    scenes: [{ id: "room", name: "Room", activeCameraId: "camera", entities: [
      { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" }, behavior: { kind: "follow", targetId: "player" } } },
      { id: "player", transform3d: { position: { x: 0, y: 0.82, z: 0 } }, body3d: { type: "kinematic" }, collider3d: { kind: "capsule", radius: 0.3, halfHeight: 0.5 }, character3d: {}, interactionActor: { collects: true, activatesTriggers: true }, behaviors: [{ kind: "winWhenCollected", count: 1 }], ...overrides },
      { id: "floor", transform3d: { position: { x: 0, y: -0.5, z: 0 } }, body3d: { type: "static" }, collider3d: { kind: "box", halfExtents: { x: 20, y: 0.5, z: 20 } } }, ...extra
    ] }]
  });
}

function stepTicks(session: Awaited<ReturnType<typeof createGameSession3D>>, count: number, tickInput = input()): void {
  for (let index = 0; index < count; index += 1) session.step(tickInput);
}

describe("3D fixed-step session", () => {
  it("projects the scene sky as presentation without changing simulation", async () => {
    const plain = await createGameSession3D(fixture(), 1);
    const document = fixture([{ id: "sun", transform3d: {}, light3d: { kind: "directional", color: "#ffffff", intensity: 2 } }]);
    document.scenes[0].environment.sky = { kind: "procedural", sunEntityId: "sun", turbidity: 4, rayleigh: 1, groundColor: "#202020", intensity: 0.5 };
    const sky = await createGameSession3D(document, 1);
    try {
      expect(sky.frame().environment.sky).toEqual(document.scenes[0].environment.sky);
      stepTicks(plain, 30, input({ moveZ: -1 }));
      stepTicks(sky, 30, input({ moveZ: -1 }));
      const plainState = plain.inspect({ entityId: "player" });
      expect(sky.inspect({ entityId: "player" })).toEqual(plainState);
    } finally { plain.dispose(); sky.dispose(); }
  });
  it("projects post-processing as presentation that stays out of snapshots and simulation", async () => {
    const plain = await createGameSession3D(fixture(), 1);
    const document = fixture();
    document.scenes[0].environment.postProcessing = { enabled: true, exposure: 1.5, toneMapping: "agx", antialias: "smaa",
      bloom: { threshold: 0.8, softness: 0.1, radius: 0.4, intensity: 2 }, vignette: { intensity: 0.5, radius: 0.5, softness: 0.5 } };
    const post = await createGameSession3D(document, 1);
    try {
      expect(post.frame().environment.postProcessing).toEqual(document.scenes[0].environment.postProcessing);
      for (let index = 0; index < 30; index += 1) {
        expect(post.step(input({ moveZ: -1 })).events).toEqual(plain.step(input({ moveZ: -1 })).events);
      }
      const { contentDigest: _plainDigest, ...plainSnapshot } = plain.snapshot();
      const { contentDigest: _postDigest, ...postSnapshot } = post.snapshot();
      expect(postSnapshot).toEqual(plainSnapshot);
      expect(JSON.stringify(post.snapshot())).not.toContain("postProcessing");
    } finally { plain.dispose(); post.dispose(); }
  });
  it("projects shadow settings as presentation that stays out of snapshots and simulation", async () => {
    const lamp = { kind: "spot", color: "#ffffff", intensity: 2, range: 8, angle: 0.6 } as const;
    const plain = await createGameSession3D(fixture([{ id: "lamp", transform3d: { position: { x: 0, y: 3, z: 0 } }, light3d: lamp }]), 1);
    const document = fixture([{ id: "lamp", transform3d: { position: { x: 0, y: 3, z: 0 } },
      light3d: { ...lamp, castShadow: true, shadowBias: -0.0005, shadowNormalBias: 0.02 } }]);
    document.scenes[0].environment.shadows.cascades = { count: 3, split: 0.7, maxDistance: 120 };
    const shadowed = await createGameSession3D(document, 1);
    try {
      expect(shadowed.frame().environment.shadows.cascades).toEqual({ count: 3, split: 0.7, maxDistance: 120 });
      expect(shadowed.frame().lights.find((entry) => entry.entityId === "lamp")?.light).toMatchObject({ castShadow: true, shadowBias: -0.0005, shadowNormalBias: 0.02 });
      for (let index = 0; index < 30; index += 1) {
        expect(shadowed.step(input({ moveZ: -1 })).events).toEqual(plain.step(input({ moveZ: -1 })).events);
      }
      const { contentDigest: _plainDigest, ...plainSnapshot } = plain.snapshot();
      const { contentDigest: _shadowedDigest, ...shadowedSnapshot } = shadowed.snapshot();
      expect(shadowedSnapshot).toEqual(plainSnapshot);
      const serialized = JSON.stringify(shadowed.snapshot());
      for (const field of ["cascades", "castShadow", "shadowBias", "shadowNormalBias"]) { expect(serialized).not.toContain(field); }
    } finally { plain.dispose(); shadowed.dispose(); }
  });
  it("projects physics roots, cameras, lights, hierarchy and HUD font bindings", async () => {
    const document = fixture([
      { id: "light", transform3d: { position: { x: 0, y: 4, z: 0 } }, light3d: { kind: "point", color: "#ffffff", intensity: 1, range: 10 } },
      { id: "visual", parentId: "player", transform3d: { position: { x: 0, y: 1, z: 0 } } },
      { id: "template", templateOnly: true, transform3d: {} }
    ]);
    document.assets.title = { mediaKind: "font", assetId: "title.ttf", digest: "font-v1", required: true, fontFormat: "ttf" };
    const session = await createGameSession3D(document, 1);
    try {
      const frame = session.frame();
      expect(frame.entities.map((entity) => entity.entityId)).toEqual(["camera", "player", "floor", "light", "visual"]);
      expect(frame.entities.find((entity) => entity.entityId === "visual")?.transform.position.y).toBeCloseTo(1.82);
      expect(session.inspect({ entityId: "visual" }).entities[0].parentId).toBe("player");
      expect(frame.fonts).toEqual({ title: document.assets.title });
    } finally { session.dispose(); }
  });

  it("publishes the previous camera pose so camera children interpolate with the camera", async () => {
    const document = fixture([{ id: "weapon", parentId: "eye", transform3d: { position: { x: 0.3, y: -0.2, z: -0.5 } } }]);
    const room = document.scenes[0];
    room.activeCameraId = "eye";
    room.entities.push({ ...room.entities[0], id: "eye", parentId: "player", transform3d: { ...room.entities[0].transform3d, position: { x: 0, y: 0.65, z: 0 } },
      camera3d: { ...room.entities[0].camera3d!, behavior: { kind: "fixed" } } });
    const session = await createGameSession3D(gameDocument3D.parse(document), 3);
    try {
      stepTicks(session, 10);
      const before = session.frame().camera.transform;
      const frame = session.step(input({ moveZ: -1 })).frame;
      const eye = frame.entities.find((entity) => entity.entityId === "eye");
      expect(frame.camera.previousTransform).toEqual(before);
      expect(frame.camera.previousTransform).toEqual(eye?.previousTransform);
      expect(frame.camera.transform.position.z).toBeLessThan(before.position.z);
    } finally { session.dispose(); }
  });

  it("moves an upright capsule relative to the camera and jumps from grounded state", async () => {
    const session = await createGameSession3D(fixture(), 7);
    try {
      stepTicks(session, 10);
      expect(session.inspect({ entityId: "player" }).entities[0].grounded).toBe(true);
      const start = session.inspect({ entityId: "player" }).entities[0].transform.position;
      session.step(input({ moveZ: -1 }, [], { x: Math.PI / (2 * 0.002), y: 0 }));
      stepTicks(session, 30, input({ moveZ: -1 }));
      const moved = session.inspect({ entityId: "player" }).entities[0];
      expect(moved.transform.position.x).toBeLessThan(start.x - 1);
      expect(Math.abs(moved.transform.position.z - start.z)).toBeLessThan(0.05);
      session.step(input({}, ["jump"]));
      expect(session.inspect({ entityId: "player" }).entities[0].velocity.y).toBeGreaterThan(5);
      expect(session.inspect({ entityId: "player" }).entities[0].grounded).toBe(false);
    } finally { session.dispose(); }
  });

  it("awards a sensor pickup only to explicit eligible actors", async () => {
    const pickup = { id: "pickup", transform3d: { position: { x: 0, y: 0.8, z: 0 } }, body3d: { type: "static" }, collider3d: { kind: "sphere", radius: 1, sensor: true }, behaviors: [{ kind: "collectible", score: 2 }, { kind: "trigger", event: "checkpoint" }] };
    const crate = { id: "crate", transform3d: { position: { x: 0, y: 0.8, z: 0 } }, body3d: { type: "dynamic", mass: 3 }, collider3d: { kind: "box", halfExtents: { x: 0.3, y: 0.3, z: 0.3 } } };
    const noActor = await createGameSession3D(fixture([pickup, crate], { interactionActor: { collects: false, activatesTriggers: false } }), 1);
    try {
      const first = noActor.step(input());
      expect(first.events.some((event) => event.kind === "collected" || event.kind === "trigger")).toBe(false);
      expect(noActor.inspect().score).toBe(0);
    } finally { noActor.dispose(); }
    const session = await createGameSession3D(fixture([pickup]), 1);
    try {
      const first = session.step(input());
      expect(first.events.filter((event) => event.kind === "collected")).toEqual([{ kind: "collected", entityId: "pickup", byId: "player", score: 2 }]);
      expect(first.events.some((event) => event.kind === "win")).toBe(true);
      expect(session.inspect().score).toBe(2);
      expect(session.step(input()).events.some((event) => event.kind === "collected")).toBe(false);
    } finally { session.dispose(); }
  });

  it("restores world bytes, contacts, camera and controller state exactly at a tick boundary", async () => {
    const document = fixture([{ id: "crate", transform3d: { position: { x: 1, y: 3, z: -2 } }, body3d: { type: "dynamic", mass: 3 }, collider3d: { kind: "box", halfExtents: { x: 0.4, y: 0.4, z: 0.4 } } }]);
    const prefix = Array.from({ length: 25 }, (_, index) => input({ moveX: 0.3, moveZ: -0.5 }, index === 15 ? ["jump"] : [], { x: 0.5, y: 0.1 }));
    const suffix = Array.from({ length: 40 }, () => input({ moveX: -0.2, moveZ: -0.4 }));
    const session = await createGameSession3D(document, 42);
    try {
      prefix.forEach((frame) => session.step(frame));
      const checkpoint = gameSnapshot3D.parse(JSON.parse(JSON.stringify(session.snapshot())));
      expect(checkpoint.physicsBuild).toBe(GAME_PHYSICS_BUILD_3D);
      const expectedEvents = suffix.map((frame) => session.step(frame).events);
      const expected = session.snapshot();
      const replayed = await replayGame3D(document, 999, suffix, checkpoint);
      expect(replayed.steps.map((step) => step.events)).toEqual(expectedEvents);
      expect(replayed.snapshot).toEqual(expected);
    } finally { session.dispose(); }
  });

  it("rejects stale source or physics builds before opening a restored world", async () => {
    const document = fixture();
    const session = await createGameSession3D(document, 1);
    const snapshot = session.snapshot();
    session.dispose();
    await expect(createGameSession3D({ ...document, presentation: { ...document.presentation, hudWidth: 1000 } }, 1, snapshot)).rejects.toThrow("source digest");
    await expect(createGameSession3D(document, 1, { ...snapshot, physicsBuild: "other-build" })).rejects.toThrow("physics build");
  });

  it("fails closed after an invalid tick or illegal pose driver", async () => {
    const session = await createGameSession3D(fixture(), 1);
    expect(() => session.step(input({ invalid: 1 }))).toThrow("Unknown 3D input");
    expect(() => session.snapshot()).toThrow("failed step");
    expect(() => session.frame()).toThrow("failed step");
    session.dispose();
    const illegal = await createGameSession3D(fixture([], { behaviors: [{ kind: "script", maxTickMs: 50, source: "input => ({state:null,commands:[{kind:'setVisual',scale:{x:2,y:2,z:2}}]})" }] }), 1);
    try {
      expect(() => illegal.step(input())).toThrow("nonphysical");
      expect(() => illegal.frame()).toThrow("failed step");
    } finally { illegal.dispose(); }
  });

  it("plays the acceptance route, reacts next tick, and respawns at the explicit checkpoint", async () => {
    const document = createNative3DGame("acceptance-3d");
    const session = await createGameSession3D(document, 3);
    try {
      stepTicks(session, 195, input({ moveZ: -1 }));
      expect(session.inspect().won).toBe(true);
      expect(session.inspect().score).toBe(2);
      expect(session.inspect({ entityId: "door" }).entities[0].transform.position.y).toBeGreaterThan(4);
      session.step(input({}, ["respawn"]));
      expect(session.inspect({ entityId: "player" }).entities[0].transform.position.z).toBeCloseTo(-7, 1);
    } finally { session.dispose(); }
  });
});

describe("3D controller boundaries", () => {
  it("lets script character intent suppress player jump input", async () => {
    const source = `input => ({state:null,commands:[{kind:'characterIntent',movement:{x:0,y:0,z:0},jump:false}]})`;
    const session = await createGameSession3D(fixture([], { behaviors: [{ kind: "script", maxTickMs: 50, source }] }), 1);
    try {
      stepTicks(session, 10);
      expect(session.inspect({ entityId: "player" }).entities[0].grounded).toBe(true);
      session.step(input({}, ["jump"]));
      const player = session.inspect({ entityId: "player" }).entities[0];
      expect(player.grounded).toBe(true);
      expect(player.velocity.y).toBe(0);
    } finally { session.dispose(); }
  });

  it("integrates kinematic angular velocity and replays rotation from a snapshot", async () => {
    const initialComponent = Math.SQRT1_2;
    const document = fixture([{ id: "rotator", transform3d: { position: { x: 4, y: 2, z: 0 }, rotation: [initialComponent, 0, 0, initialComponent] },
      body3d: { type: "kinematic", angularVelocity: { x: 0, y: 1, z: 0 } },
      collider3d: { kind: "box", halfExtents: { x: 1, y: 0.2, z: 1 } } }]);
    const session = await createGameSession3D(document, 1);
    try {
      stepTicks(session, 30);
      const checkpoint = session.snapshot();
      stepTicks(session, 30);
      const rotation = session.inspect({ entityId: "rotator" }).entities[0].transform.rotation;
      expect(rotation[0]).toBeCloseTo(initialComponent * Math.cos(0.5), 3);
      expect(rotation[1]).toBeCloseTo(initialComponent * Math.sin(0.5), 3);
      expect(rotation[2]).toBeCloseTo(-initialComponent * Math.sin(0.5), 3);
      expect(rotation[3]).toBeCloseTo(initialComponent * Math.cos(0.5), 3);
      const replayed = await replayGame3D(document, 1, Array.from({ length: 30 }, () => input()), checkpoint);
      expect(replayed.snapshot).toEqual(session.snapshot());
    } finally { session.dispose(); }
  });

  it("climbs configured steps and carries a grounded actor on a moving platform", async () => {
    const step = { id: "step", transform3d: { position: { x: 0, y: 0.1, z: -1.6 } }, body3d: { type: "static" }, collider3d: { kind: "box", halfExtents: { x: 2, y: 0.1, z: 1 } } };
    const session = await createGameSession3D(fixture([step]), 5);
    try {
      stepTicks(session, 10);
      stepTicks(session, 35, input({ moveZ: -1 }));
      const player = session.inspect({ entityId: "player" }).entities[0];
      expect(player.transform.position.z).toBeLessThan(-1.2);
      expect(player.transform.position.y).toBeGreaterThan(0.95);
      expect(player.grounded).toBe(true);
    } finally { session.dispose(); }
    const platform = { id: "platform", transform3d: { position: { x: 0, y: 2, z: 0 } }, body3d: { type: "kinematic", velocity: { x: 1, y: 0, z: 0 } },
      collider3d: { kind: "box", halfExtents: { x: 3, y: 0.2, z: 3 } } };
    const rider = await createGameSession3D(fixture([platform], { transform3d: { position: { x: 0, y: 3.02, z: 0 } } }), 5);
    try {
      stepTicks(rider, 10);
      const before = rider.inspect({ entityId: "player" }).entities[0];
      expect(before.grounded).toBe(true);
      expect(before.controller?.supportId).toBe("platform");
      stepTicks(rider, 60);
      const after = rider.inspect({ entityId: "player" }).entities[0];
      expect(after.transform.position.x - before.transform.position.x).toBeCloseTo(1, 2);
      expect(after.grounded).toBe(true);
      const snapshot = rider.snapshot();
      const continued = await replayGame3D(fixture([platform], { transform3d: { position: { x: 0, y: 3.02, z: 0 } } }), 5, Array.from({ length: 15 }, () => input()), snapshot);
      stepTicks(rider, 15);
      expect(continued.snapshot).toEqual(rider.snapshot());
    } finally { rider.dispose(); }
  });

  it("pushes dynamic props without granting them an interaction role", async () => {
    const crate = { id: "crate", transform3d: { position: { x: 0, y: 0.5, z: -1.6 } }, body3d: { type: "dynamic", mass: 3, ccd: true }, collider3d: { kind: "box", halfExtents: { x: 0.4, y: 0.4, z: 0.4 }, friction: 0.2 } };
    const session = await createGameSession3D(fixture([crate]), 1);
    try {
      stepTicks(session, 10);
      const before = session.inspect({ entityId: "crate" }).entities[0].transform.position.z;
      stepTicks(session, 60, input({ moveZ: -1 }));
      expect(session.inspect({ entityId: "crate" }).entities[0].transform.position.z).toBeLessThan(before - 1);
    } finally { session.dispose(); }
  });

  it("allows coyote jumps and buffered jumps before landing", async () => {
    const document = fixture();
    const floor = document.scenes[0].entities.find((entity) => entity.id === "floor")!;
    floor.collider3d = { ...floor.collider3d!, kind: "box", halfExtents: { x: 0.6, y: 0.5, z: 2 } };
    const session = await createGameSession3D(document, 1);
    try {
      stepTicks(session, 10);
      for (let index = 0; index < 60 && session.inspect({ entityId: "player" }).entities[0].grounded; index += 1) session.step(input({ moveX: 1 }));
      const airborne = session.inspect({ entityId: "player" }).entities[0];
      expect(airborne.grounded).toBe(false);
      expect(airborne.controller!.coyoteRemaining).toBeGreaterThan(0);
      session.step(input({ moveX: 1 }, ["jump"]));
      expect(session.inspect({ entityId: "player" }).entities[0].velocity.y).toBeGreaterThan(5);
    } finally { session.dispose(); }
    const falling = await createGameSession3D(fixture([], { transform3d: { position: { x: 0, y: 1.2, z: 0 } } }), 1);
    try {
      stepTicks(falling, 10);
      falling.step(input({}, ["jump"]));
      stepTicks(falling, 6);
      expect(falling.inspect({ entityId: "player" }).entities[0].velocity.y).toBeGreaterThan(5);
    } finally { falling.dispose(); }
  });

  it("delivers query results and contact events to scripts on the next tick", async () => {
    const source = `(input) => ({state:{queries:input.queries,events:input.events},commands:input.tick===0?[{kind:'rayQuery',queryId:'ground',origin:{x:0,y:2,z:0},direction:{x:0,y:-1,z:0},maxDistance:10}]:[]})`;
    const session = await createGameSession3D(fixture([{ id: "trigger", transform3d: { position: { x: 0, y: 0.8, z: 0 } }, body3d: { type: "static" }, collider3d: { kind: "sphere", radius: 2, sensor: true }, behaviors: [{ kind: "trigger", event: "inside" }] }], { behaviors: [{ kind: "script", maxTickMs: 50, source }] }), 1);
    try {
      session.step(input());
      const first = Object.values(session.snapshot().scriptState)[0] as { queries: unknown[]; events: unknown[] };
      expect(first.queries).toEqual([]);
      session.step(input());
      const second = Object.values(session.snapshot().scriptState)[0] as { queries: { entityId: string }[]; events: { kind: string }[] };
      expect(second.queries[0].entityId).toBe("floor");
      expect(second.events.some((event) => event.kind === "contact")).toBe(true);
    } finally { session.dispose(); }
  });
});

describe("3D instance lifecycle", () => {
  it("applies vertical spawn velocity to a character controller", async () => {
    const document = fixture();
    const player = document.scenes[0].entities.find((entity) => entity.id === "player")!;
    document.prefabs.actor = { rootId: "player", externalAssets: [], externalScenes: [], entities: [{ ...player, behaviors: [] }] };
    player.behaviors = [{ kind: "script", maxTickMs: 50, maxCommands: 64,
      source: `input => ({state:null,commands:input.tick===0?[{kind:'spawn',prefabId:'actor',position:{x:5,y:10,z:0},velocity:{x:0,y:6,z:0}}]:[]})` }];
    const session = await createGameSession3D(document, 1);
    try {
      session.step(input());
      const spawned = session.inspect({ entityId: "actor#1/player" }).entities[0];
      expect(spawned.controller?.verticalVelocity).toBe(6);
      session.step(input());
      const moved = session.inspect({ entityId: "actor#1/player" }).entities[0];
      expect(moved.transform.position.y).toBeGreaterThan(10);
      expect(moved.velocity.y).toBeCloseTo(6 + document.scenes[0].gravity.y / 60);
    } finally { session.dispose(); }
  });

  it("spawns a rooted prefab once, remaps children, restores scripts, and removes its subtree", async () => {
    const document = fixture([], { behaviors: [{ kind: "script", maxTickMs: 50, source: `(input) => ({state: null,commands: input.tick===0 ? [{kind:'spawn',prefabId:'actor',position:{x:2,y:1,z:0}}] : input.tick===3 ? [{kind:'despawn',entityId:'actor#1/root'}] : []})` }] });
    document.prefabs.actor = { rootId: "root", externalAssets: [], externalScenes: [], entities: gameDocument3D.parse({ ...document, scenes: [{ ...document.scenes[0], entities: [
      ...document.scenes[0].entities.filter((entity) => entity.id === "camera" || entity.id === "player"),
      { id: "root", transform3d: {}, body3d: { type: "kinematic" }, collider3d: { kind: "box", halfExtents: { x: 0.4, y: 0.4, z: 0.4 } }, behaviors: [{ kind: "health", maximum: 4 }] },
      { id: "visual", parentId: "root", transform3d: { position: { x: 0, y: 1, z: 0 } }, primitive: { kind: "sphere", dimensions: { x: 0.5, y: 0.5, z: 0.5 } },
        behaviors: [{ kind: "script", maxTickMs: 50, source: `(input) => ({state: {age:(input.state?.age||0)+1},commands:[]})` }] }
    ] }] }).scenes[0].entities.filter((entity) => entity.id === "root" || entity.id === "visual") };
    const session = await createGameSession3D(document, 3);
    try {
      session.step(input());
      expect(session.inspect({ entityId: "actor#1/root" }).entities[0].health).toBe(4);
      expect(session.inspect({ entityId: "actor#1/visual" }).entities[0].parentId).toBe("actor#1/root");
      expect(session.inspect({ entityId: "actor#1/visual" }).entities[0].transform.position).toEqual({ x: 2, y: 2, z: 0 });
      expect(Object.keys(session.snapshot().scriptState)).toHaveLength(1);
      session.step(input());
      const saved = session.snapshot();
      const restored = await replayGame3D(document, 5, [input(), input()], saved);
      session.step(input()); session.step(input());
      expect(session.snapshot()).toEqual(restored.snapshot);
      expect(session.inspect().entities.some((entity) => entity.instanceId === "actor#1")).toBe(false);
      expect(session.snapshot().prefabInstances).toEqual([]);
    } finally { session.dispose(); }
  });

  it("resets camera and scene-entry age during a queued transition", async () => {
    const document = fixture([], { behaviors: [{ kind: "script", maxTickMs: 50, source: `input => ({state:null,commands:input.tick===0?[{kind:'sceneTransition',sceneId:'next'}]:[]})` }] });
    document.scenes.push({ ...document.scenes[0], id: "next", name: "Next", entities: document.scenes[0].entities.map((entity) => entity.id === "player" ?
      { ...entity, transform3d: { ...entity.transform3d, position: { x: 4, y: 0.82, z: 0 } }, behaviors: [{ kind: "lifetime", ticks: 2, fade: true, endScale: 1 }] } : entity) });
    const session = await createGameSession3D(document, 3);
    try {
      const first = session.step(input({}, [], { x: 500, y: 0 }));
      expect(first.events.some((event) => event.kind === "sceneTransition")).toBe(true);
      expect(session.snapshot().camera.yaw).toBe(0);
      expect(session.inspect({ entityId: "player" }).entities[0].spawnTick).toBe(1);
      session.step(input()); session.step(input());
      expect(session.inspect({ entityId: "player" }).entities[0].active).toBe(true);
      session.step(input());
      expect(session.inspect({ entityId: "player" }).entities[0].active).toBe(false);
    } finally { session.dispose(); }
  });
});

describe("bounded 3D shape queries", () => {
  it("reports authored-order overlap hits once per entity with a result bound and next-tick latency", async () => {
    const source = `(input) => ({ state: {queries:input.queries}, commands: input.tick===0 ? [{kind:'shapeQuery',queryId:'nearby',shape:{kind:'sphere',radius:3},position:{x:0,y:1,z:0},mask:2,maximumResults:2}] : [] })`;
    const props = ["a", "b", "c"].map((id, index) => ({ id, transform3d: { position: { x: index * 0.3, y: 1, z: -1 } }, body3d: { type: "static" }, collider3d: { kind: "box", halfExtents: { x: 0.1, y: 0.1, z: 0.1 }, category: 2 } }));
    const sensor = { id: "sensor", transform3d: { position: { x: 0, y: 1, z: 0 } }, body3d: { type: "static" }, collider3d: { kind: "sphere", radius: 0.5, sensor: true, category: 2 } };
    const document = fixture([...props, sensor], { behaviors: [{ kind: "script", maxTickMs: 50, source }] });
    const session = await createGameSession3D(document, 1);
    try {
      session.step(input());
      expect((Object.values(session.snapshot().scriptState)[0] as { queries: unknown[] }).queries).toEqual([]);
      const save = session.snapshot();
      expect(save.queryResults[0].hits?.map((hit) => hit.entityId)).toEqual(["a", "b"]);
      expect(save.queryResults[0].truncated).toBe(true);
      session.step(input());
      const state = Object.values(session.snapshot().scriptState)[0] as { queries: { hits: { entityId: string }[] }[] };
      expect(state.queries[0].hits.map((hit) => hit.entityId)).toEqual(["a", "b"]);
      const replayed = await replayGame3D(document, 1, [input()], save);
      expect(replayed.snapshot).toEqual(session.snapshot());
    } finally { session.dispose(); }
  });

  it("queries rotated boxes and capsules with explicit sensor inclusion", async () => {
    const source = `(input) => ({state:{queries:input.queries},commands:input.tick===0?[
      {kind:'shapeQuery',queryId:'box',shape:{kind:'box',halfExtents:{x:2,y:.2,z:.2}},rotation:[0,Math.sin(Math.PI/4),0,Math.cos(Math.PI/4)],position:{x:0,y:2,z:0},mask:4,includeSensors:true},
      {kind:'shapeQuery',queryId:'capsule',shape:{kind:'capsule',radius:.3,halfHeight:1},position:{x:0,y:2,z:0},mask:4,includeSensors:true}
    ]:[]})`;
    const target = { id: "target", transform3d: { position: { x: 0, y: 2, z: 1.5 } }, body3d: { type: "static" }, collider3d: { kind: "sphere", radius: 0.1, sensor: true, category: 4 } };
    const center = { ...target, id: "center", transform3d: { position: { x: 0, y: 2.8, z: 0 } } };
    const session = await createGameSession3D(fixture([target, center], { behaviors: [{ kind: "script", maxTickMs: 50, source }] }), 1);
    try {
      session.step(input());
      const queries = session.snapshot().queryResults;
      expect(queries[0].hits?.map((hit) => hit.entityId)).toEqual(["target"]);
      expect(queries[1].hits?.map((hit) => hit.entityId)).toEqual(["center"]);
      expect(queries.every((query) => !query.truncated)).toBe(true);
    } finally { session.dispose(); }
  });

  it("rejects unbounded result requests and query floods rather than publishing a failed tick", async () => {
    const tooManyResults = `input=>({state:null,commands:[{kind:'shapeQuery',queryId:'invalid',shape:{kind:'sphere',radius:1},position:{x:0,y:0,z:0},maximumResults:33}]})`;
    const invalid = await createGameSession3D(fixture([], { behaviors: [{ kind: "script", maxTickMs: 50, source: tooManyResults }] }), 1);
    try {
      expect(() => invalid.step(input())).toThrow();
      expect(() => invalid.snapshot()).toThrow("failed step");
    } finally { invalid.dispose(); }
    const flood = `input => ({state:null,commands:Array.from({length:40},(_,i)=>({kind:'shapeQuery',queryId:input.entity.id+i,shape:{kind:'sphere',radius:1},position:{x:0,y:0,z:0}}))})`;
    const document = fixture([{ id: "other", transform3d: {}, behaviors: [{ kind: "script", maxTickMs: 50, source: flood, maxCommands: 64 }] }], { behaviors: [{ kind: "script", maxTickMs: 50, source: flood, maxCommands: 64 }] });
    const flooded = await createGameSession3D(document, 1);
    try {
      expect(() => flooded.step(input())).toThrow("query command limit");
      expect(() => flooded.frame()).toThrow("failed step");
    } finally { flooded.dispose(); }
  });
});
