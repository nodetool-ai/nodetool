import { gameDocument, gameDocument3D } from "@nodetool-ai/protocol";
import { expect, it } from "vitest";
import { createTopDownRoomGame } from "../src/sample.js";
import { createNative3DGame } from "../src/sample3d.js";
import { createGameSession, createScriptedGameSession } from "../src/session.js";
import { createGameSession3D } from "../src/session3d.js";
import { stepPresentation3D } from "../src/systems/presentation3d.js";
import { stepPresentation2D } from "../src/systems/presentation2d.js";

const flatInput = { pressed: ["right"], justPressed: [] };
const spatialInput = {
  pressed: [],
  justPressed: [],
  axes: { moveX: 0.4 },
  look: { x: 0, y: 0 }
};

it("restores legacy 2D JSON with defaulted system state", () => {
  const document = createTopDownRoomGame("legacy-flat");
  const original = createGameSession(document, 3);
  try {
    original.step(flatInput);
    const legacy = structuredClone(original.snapshot());
    for (const field of ["activeContacts", "pendingEvents", "scriptState"]) {
      expect(Reflect.deleteProperty(legacy, field)).toBe(true);
    }
    const restored = createGameSession(document, 3, legacy);
    try {
      expect(restored.snapshot().activeContacts).toEqual([]);
      expect(restored.snapshot().pendingEvents).toEqual([]);
      expect(restored.snapshot().scriptState).toEqual({});
      expect(restored.step(flatInput).tick).toBe(legacy.tick + 1);
    } finally {
      restored.dispose();
    }
  } finally {
    original.dispose();
  }
});

it("restores authored 3D scene music when saved music is null or omitted", async () => {
  const base = createNative3DGame("legacy-music");
  const scene = base.scenes[0];
  const audio = createTopDownRoomGame("audio-source").assets["sfx.collect"];
  if (!scene || !audio) {
    throw new Error("Missing music test fixture");
  }
  const document = gameDocument3D.parse({
    ...base,
    assets: { ...base.assets, "sfx.collect": {
      mediaKind: "audio", assetId: audio.assetId, digest: audio.digest,
      required: audio.required
    } },
    scenes: [{ ...scene, music: { assetId: "sfx.collect", volume: 0.4 } }]
  });
  const original = await createGameSession3D(document, 3);
  try {
    original.step(spatialInput);
    for (const omitted of [false, true]) {
      const saved = structuredClone(original.snapshot());
      saved.music = null;
      if (omitted) {
        expect(Reflect.deleteProperty(saved, "music")).toBe(true);
      }
      const restored = await createGameSession3D(document, 3, saved);
      try {
        expect(restored.snapshot().music).toEqual({
          ...document.scenes[0]?.music,
          voiceId: `scene:${scene.id}:music`,
          startTick: saved.tick
        });
      } finally {
        restored.dispose();
      }
    }
  } finally {
    original.dispose();
  }
});

it("mirrors 2D presentation output without advancing simulation state", () => {
  const document = createTopDownRoomGame("presentation-flat");
  const scene = document.scenes[0];
  if (!scene) {
    throw new Error("Missing test scene");
  }
  const session = createGameSession(document, 3);
  try {
    const step = session.step(flatInput);
    const before = JSON.stringify(session.snapshot());
    const events = [...step.events];
    const context: Parameters<typeof stepPresentation2D>[0] = {
      document,
      scene,
      states: [],
      score: 0,
      won: false,
      hud: new Map(),
      tick: step.tick,
      events,
      frameFor: () => session.frame(),
      scriptStats: undefined,
      queues: { despawns: new Set(), spawns: [] },
      presentationEvents: [],
      result: undefined
    };
    const keys = Object.keys(context);
    stepPresentation2D(context);
    expect(Object.keys(context)).toEqual(keys);
    expect(context.tick).toBe(step.tick);
    expect(context.events).toBe(events);
    expect(context.presentationEvents).toEqual(step.events);
    expect(context.presentationEvents).not.toBe(step.events);
    expect(context.result).toEqual({
      tick: step.tick,
      events: step.events,
      frame: step.frame
    });
    expect(JSON.stringify(session.snapshot())).toBe(before);
  } finally {
    session.dispose();
  }
});
it("returns the actual system order and timings only when enabled", async () => {
  const flat = createGameSession(
    createTopDownRoomGame("flat"),
    3,
    undefined,
    undefined,
    { recordTimings: true }
  );
  const spatial = await createGameSession3D(
    createNative3DGame("spatial"),
    3,
    undefined,
    { recordTimings: true }
  );
  const untimed = createGameSession(createTopDownRoomGame("untimed"), 3);
  try {
    const flatTiming = flat.step(flatInput).timings;
    const spatialTiming = spatial.step(spatialInput).timings;
    expect(flatTiming?.systems.map((system) => system.system)).toEqual([
      "input",
      "scripts",
      "physics",
      "contacts",
      "gameplay",
      "presentation"
    ]);
    expect(spatialTiming?.systems.map((system) => system.system)).toEqual([
      "input",
      "scripts",
      "character",
      "physics",
      "contacts",
      "gameplay",
      "animation",
      "presentation"
    ]);
    expect(
      spatialTiming?.systems.every(
        (system) => Number.isFinite(system.durationMs) && system.durationMs >= 0
      )
    ).toBe(true);
    expect(spatialTiming?.totalMs).toBeGreaterThanOrEqual(0);
    expect(untimed.step(flatInput)).not.toHaveProperty("timings");
  } finally {
    flat.dispose();
    spatial.dispose();
    untimed.dispose();
  }
});
it("reports physics counts with timings without changing the simulation", async () => {
  const touching = (events: readonly { readonly kind: string; readonly phase?: string }[]): number =>
    events.filter((event) => event.kind === "contact" && event.phase !== "exit").length;
  const flatDocument = createTopDownRoomGame("physics-flat");
  const spatialDocument = createNative3DGame("physics-spatial");
  const flatTimed = createGameSession(flatDocument, 3, undefined, undefined, { recordTimings: true });
  const flatPlain = createGameSession(flatDocument, 3);
  const spatialTimed = await createGameSession3D(spatialDocument, 3, undefined, { recordTimings: true });
  const spatialPlain = await createGameSession3D(spatialDocument, 3);
  try {
    let flatContacts = 0;
    let spatialContacts = 0;
    for (let tick = 0; tick < 120; tick++) {
      const flat = flatTimed.step(flatInput);
      const flatReference = flatPlain.step(flatInput);
      expect(flatReference).not.toHaveProperty("physics");
      expect(flat.events).toEqual(flatReference.events);
      expect(flat.physics?.contacts).toBe(touching(flat.events));
      expect(flat.physics?.bodies).toBeGreaterThan(0);
      flatContacts += flat.physics?.contacts ?? 0;
      const spatial = spatialTimed.step(spatialInput);
      const spatialReference = spatialPlain.step(spatialInput);
      expect(spatialReference).not.toHaveProperty("physics");
      expect(spatial.events).toEqual(spatialReference.events);
      expect(spatial.physics?.contacts).toBe(touching(spatial.events));
      expect(spatial.physics?.bodies).toBeGreaterThan(0);
      spatialContacts += spatial.physics?.contacts ?? 0;
    }
    expect(flatContacts).toBeGreaterThan(0);
    expect(spatialContacts).toBeGreaterThan(0);
    expect(JSON.stringify(flatTimed.snapshot())).toBe(JSON.stringify(flatPlain.snapshot()));
    expect(JSON.stringify(spatialTimed.snapshot())).toBe(JSON.stringify(spatialPlain.snapshot()));
  } finally {
    flatTimed.dispose();
    flatPlain.dispose();
    spatialTimed.dispose();
    spatialPlain.dispose();
  }
});
it("keeps scripted sessions and their replay identical with timings on, off or toggled per tick", async () => {
  const base = createTopDownRoomGame("timed-scripts");
  const flatDocument = gameDocument.parse({ ...base, schemaVersion: 4, engineVersion: "3",
    scenes: base.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity) => entity.id === "player"
      ? { ...entity, behaviors: [...entity.behaviors, { kind: "script", maxCommands: 8, maxTickMs: 20,
        source: "({tick, random}) => ({ state: { roll: random() }, commands: tick % 10 === 0 ? [{kind:'setProp',key:'count',value:tick}] : [] })" }] }
      : entity) })) });
  const sessions = {
    "2d": (snapshot: unknown, recordTimings?: boolean | (() => boolean)) => createScriptedGameSession(flatDocument, 1,
      snapshot as Parameters<typeof createScriptedGameSession>[2], undefined, { recordTimings }),
    "3d": (snapshot: unknown, recordTimings?: boolean | (() => boolean)) => createGameSession3D(createNative3DGame("timed-scripts-3d"), 1,
      snapshot as Parameters<typeof createGameSession3D>[2], { recordTimings })
  };
  const inputs = {
    "2d": Array.from({ length: 120 }, (_, tick) => ({ pressed: tick % 40 < 20 ? ["right"] : ["down"], justPressed: [] })),
    "3d": Array.from({ length: 120 }, (_, tick) => ({ ...spatialInput, axes: { moveX: tick % 40 < 20 ? 0.4 : -0.4 } }))
  };
  for (const dimension of ["2d", "3d"] as const) {
    const create = sessions[dimension];
    let on = false;
    const plain = await create(undefined);
    const timed = await create(undefined, true);
    const toggled = await create(undefined, () => { on = !on; return on; });
    let checkpoint: unknown;
    let scriptTicks = 0;
    try {
      for (let tick = 0; tick < 120; tick++) {
        const input = inputs[dimension][tick] as never;
        const reference = plain.step(input);
        const always = timed.step(input);
        const alternating = toggled.step(input);
        expect(reference).not.toHaveProperty("timings");
        expect(always.timings).toBeDefined();
        expect(Boolean(alternating.timings)).toBe(tick % 2 === 0);
        expect(always.events).toEqual(reference.events);
        expect(alternating.events).toEqual(reference.events);
        expect(always.frame).toEqual(reference.frame);
        if (always.scriptStats) { scriptTicks += 1; }
        if (tick === 59) { checkpoint = structuredClone(plain.snapshot()); }
      }
      expect(scriptTicks).toBeGreaterThan(0);
      const expected = JSON.stringify(plain.snapshot());
      expect(JSON.stringify(timed.snapshot())).toBe(expected);
      expect(JSON.stringify(toggled.snapshot())).toBe(expected);
      for (const recordTimings of [false, true]) {
        const replay = await create(checkpoint, recordTimings);
        try {
          for (let tick = 60; tick < 120; tick++) { replay.step(inputs[dimension][tick] as never); }
          expect(JSON.stringify(replay.snapshot())).toBe(expected);
        } finally {
          replay.dispose();
        }
      }
    } finally {
      plain.dispose();
      timed.dispose();
      toggled.dispose();
    }
  }
});
it("drains presentation events independently from deterministic snapshots", () => {
  const session = createGameSession(createTopDownRoomGame("events"), 3);
  try {
    let events = session.step(flatInput).events;
    for (let tick = 0; events.length === 0 && tick < 120; tick++) {
      events = session.step(flatInput).events;
    }
    expect(events.length).toBeGreaterThan(0);
    const snapshot = JSON.stringify(session.snapshot());
    expect(session.takePresentationEvents()).toEqual(events);
    expect(session.takePresentationEvents()).toEqual([]);
    expect(JSON.stringify(session.snapshot())).toBe(snapshot);
    expect(session.snapshot()).not.toHaveProperty("presentationEvents");
  } finally {
    session.dispose();
  }
});
it("restores session state through system lifecycles and reproduces the remaining replay", async () => {
  const document2d = createTopDownRoomGame("restore-flat");
  const document3d = createNative3DGame("restore-spatial");
  const flat = createGameSession(document2d, 3);
  const spatial = await createGameSession3D(document3d, 3);
  try {
    for (let tick = 0; tick < 10; tick++) {
      flat.step(flatInput);
      spatial.step(spatialInput);
    }
    const restoredFlat = createGameSession(document2d, 3, flat.snapshot());
    const restoredSpatial = await createGameSession3D(
      document3d,
      3,
      spatial.snapshot()
    );
    try {
      expect(restoredFlat.takePresentationEvents()).toEqual([]);
      expect(restoredSpatial.takePresentationEvents()).toEqual([]);
      for (let tick = 0; tick < 20; tick++) {
        expect(JSON.stringify(restoredFlat.step(flatInput))).toBe(
          JSON.stringify(flat.step(flatInput))
        );
        const restored = restoredSpatial.step(spatialInput);
        const uninterrupted = spatial.step(spatialInput);
        expect(
          JSON.stringify({
            tick: restored.tick,
            events: restored.events,
            frame: restored.frame
          })
        ).toBe(
          JSON.stringify({
            tick: uninterrupted.tick,
            events: uninterrupted.events,
            frame: uninterrupted.frame
          })
        );
        expect(JSON.stringify(restoredFlat.snapshot())).toBe(
          JSON.stringify(flat.snapshot())
        );
        expect(JSON.stringify(restoredSpatial.snapshot())).toBe(
          JSON.stringify(spatial.snapshot())
        );
      }
    } finally {
      restoredFlat.dispose();
      restoredSpatial.dispose();
    }
  } finally {
    flat.dispose();
    spatial.dispose();
  }
});

it("mirrors 3D presentation output without advancing simulation state", async () => {
  const session = await createGameSession3D(
    createNative3DGame("presentation"),
    3
  );
  try {
    const step = session.step(spatialInput);
    const before = JSON.stringify(session.snapshot());
    const events = [...step.events];
    const context: Parameters<typeof stepPresentation3D>[0] = {
      tick: step.tick,
      events,
      frame: () => session.frame(),
      scriptStats: undefined,
      queues: { despawns: new Set(), spawns: [] },
      presentationEvents: [],
      result: undefined
    };
    const keys = Object.keys(context);
    stepPresentation3D(context);
    expect(Object.keys(context)).toEqual(keys);
    expect(context.tick).toBe(step.tick);
    expect(context.events).toBe(events);
    expect(context.presentationEvents).toEqual(events);
    expect(context.presentationEvents).not.toBe(events);
    expect(context.result).toEqual({
      tick: step.tick,
      events,
      frame: step.frame
    });
    expect(JSON.stringify(session.snapshot())).toBe(before);
  } finally {
    session.dispose();
  }
});

it("preserves script animation commands and their transition start ticks", async () => {
  const document = createNative3DGame("animation-order");
  const authored = gameDocument3D.parse({
    ...document,
    assets: {
      ...document.assets,
      character: {
        mediaKind: "model",
        assetId: "11111111111111111111111111111111",
        digest: "prepared-character",
        bounds: { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } },
        nodeIds: [],
        clipIds: ["idle-clip", "run-clip"],
        geometryBytes: 0,
        textureBytes: 0,
        triangles: 0
      }
    },
    scenes: document.scenes.map((scene) => ({
      ...scene,
      entities: scene.entities.map((entity) => {
        if (entity.id !== "player-visual") {
          return entity;
        }
        const visual = structuredClone(entity);
        delete visual.primitive;
        return {
          ...visual,
          model: { assetId: "character" },
          animator3d: {
            clips: { idle: "idle-clip", run: "run-clip" },
            initialClip: "idle"
          },
          behaviors: [
            {
              kind: "script",
              source: `(input) => ({ state: null, commands: [{ kind: "playAnimation", clip: input.tick < 2 ? "run" : "idle" }] })`,
              maxTickMs: 20
            }
          ]
        };
      })
    }))
  });
  const session = await createGameSession3D(authored, 3);
  try {
    session.step(spatialInput);
    const animation = () =>
      session
        .snapshot()
        .entities.find((entity) => entity.id === "player-visual")?.animation;
    expect(animation()).toMatchObject({
      clipId: "run-clip",
      startTick: 1,
      previousClipId: "idle-clip",
      previousStartTick: 0
    });
    session.step(spatialInput);
    expect(animation()?.startTick).toBe(1);
    session.step(spatialInput);
    expect(animation()).toMatchObject({
      clipId: "idle-clip",
      startTick: 3,
      previousClipId: "run-clip",
      previousStartTick: 1
    });
  } finally {
    session.dispose();
  }
});
